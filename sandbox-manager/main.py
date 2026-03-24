#!/usr/bin/env python3
"""
Prometheon Sandbox Manager v2 — dynamic service configuration.

Users define their own services + connections:
  - Each service: name, Docker image, port, env vars
  - Each connection: from → to (Toxiproxy auto-inserted between them)
  - Entry point: which service receives external traffic
  - "Demo mode" uses built-in service-a/b/c for quick starts
"""

import os
import re
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from kubernetes import client, config
from kubernetes.client.rest import ApiException

# ---------------------------------------------------------------------------
# K8s client setup
# ---------------------------------------------------------------------------
try:
    config.load_incluster_config()
    print("[sandbox-mgr] Loaded in-cluster K8s config")
except config.ConfigException:
    config.load_kube_config()
    print("[sandbox-mgr] Loaded local kubeconfig")

core_v1 = client.CoreV1Api()
apps_v1 = client.AppsV1Api()
networking_v1 = client.NetworkingV1Api()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
NAMESPACE_PREFIX = "tenant-"
PLATFORM_NAMESPACE = "prometheon-platform"
TOXIPROXY_BASE_PORT = 8666  # first proxy listener port
MAX_SERVICES = 10
MAX_CONNECTIONS = 15

# Built-in demo images (pre-loaded in kind)
DEMO_SERVICE_A = os.getenv("SERVICE_A_IMAGE", "prometheon/service-a:latest")
DEMO_SERVICE_B = os.getenv("SERVICE_B_IMAGE", "prometheon/service-b:latest")
DEMO_SERVICE_C = os.getenv("SERVICE_C_IMAGE", "prometheon/service-c:latest")
TOXIPROXY_IMAGE = os.getenv("TOXIPROXY_IMAGE", "shopify/toxiproxy")

# Image validation — allow Docker Hub and common registries
IMAGE_PATTERN = re.compile(
    r'^[a-z0-9][a-z0-9._/-]*[a-z0-9](:[a-zA-Z0-9._-]+)?$'
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Prometheon Sandbox Manager", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ServiceConfig(BaseModel):
    name: str = Field(min_length=1, max_length=60, description="Service name (lowercase, alphanumeric + hyphens)")
    image: str = Field(description="Docker image (e.g. nginx:1.25, myorg/api:v1.2)")
    port: int = Field(default=8080, ge=1, le=65535, description="Container port")
    env: Dict[str, str] = Field(default_factory=dict, description="Environment variables")
    entry_point: bool = Field(default=False, description="Is this the entry point for traffic?")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if not re.match(r'^[a-z][a-z0-9-]*$', v):
            raise ValueError('Service name must start with a letter, contain only lowercase letters, numbers, and hyphens')
        if len(v) > 60:
            raise ValueError('Service name must be 60 characters or less')
        return v

    @field_validator('image')
    @classmethod
    def validate_image(cls, v):
        if not IMAGE_PATTERN.match(v):
            raise ValueError(f'Invalid Docker image format: {v}')
        # Block obviously dangerous patterns
        if '..' in v or '/' == v[0]:
            raise ValueError('Invalid image path')
        return v


class ConnectionConfig(BaseModel):
    from_service: str = Field(description="Source service name")
    to_service: str = Field(description="Target service name")


class CreateSandboxRequest(BaseModel):
    tenant_id: str = Field(description="Tenant UUID from auth system")
    name: str = Field(default="default", description="Human-readable sandbox name")
    resource_tier: str = Field(default="small", description="small | medium | large")
    services: List[ServiceConfig] = Field(default_factory=list, description="User-defined services")
    connections: List[ConnectionConfig] = Field(default_factory=list, description="Service connections (Toxiproxy injected)")
    use_demo: bool = Field(default=False, description="Use built-in demo services instead")


class SandboxResponse(BaseModel):
    sandbox_id: str
    namespace: str
    tenant_id: str
    name: str
    status: str
    services: dict
    entry_point: Optional[str]
    connections: list
    created_at: str


RESOURCE_TIERS = {
    "small":  {"cpu_limit": "500m",  "mem_limit": "512Mi", "cpu_request": "100m", "mem_request": "128Mi"},
    "medium": {"cpu_limit": "1000m", "mem_limit": "1Gi",   "cpu_request": "250m", "mem_request": "256Mi"},
    "large":  {"cpu_limit": "2000m", "mem_limit": "2Gi",   "cpu_request": "500m", "mem_request": "512Mi"},
}

QUOTA_TIERS = {
    "small":  {"cpu": "2",  "memory": "2Gi",  "pods": "15"},
    "medium": {"cpu": "4",  "memory": "4Gi",  "pods": "25"},
    "large":  {"cpu": "8",  "memory": "8Gi",  "pods": "40"},
}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "service": "sandbox-manager", "version": "2.0.0"}


# ---------------------------------------------------------------------------
# POST /sandboxes — create sandbox with custom or demo services
# ---------------------------------------------------------------------------
@app.post("/sandboxes", status_code=201)
def create_sandbox(req: CreateSandboxRequest) -> SandboxResponse:
    sandbox_id = str(uuid.uuid4())[:8]
    ns_name = f"{NAMESPACE_PREFIX}{req.tenant_id[:8]}-{sandbox_id}"
    tier = RESOURCE_TIERS.get(req.resource_tier, RESOURCE_TIERS["small"])
    quota = QUOTA_TIERS.get(req.resource_tier, QUOTA_TIERS["small"])
    otel_endpoint = f"http://otel-collector.{PLATFORM_NAMESPACE}.svc.cluster.local:4318"

    # Resolve services + connections
    if req.use_demo or len(req.services) == 0:
        services = _demo_services()
        connections = _demo_connections()
    else:
        services = req.services
        connections = req.connections

    # Validation
    if len(services) > MAX_SERVICES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_SERVICES} services per sandbox")
    if len(connections) > MAX_CONNECTIONS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_CONNECTIONS} connections per sandbox")

    svc_names = [s.name for s in services]
    if len(svc_names) != len(set(svc_names)):
        raise HTTPException(status_code=400, detail="Duplicate service names")

    for conn in connections:
        if conn.from_service not in svc_names:
            raise HTTPException(status_code=400, detail=f"Connection references unknown service: {conn.from_service}")
        if conn.to_service not in svc_names:
            raise HTTPException(status_code=400, detail=f"Connection references unknown service: {conn.to_service}")

    # Determine entry point
    entry_point = None
    for s in services:
        if s.entry_point:
            entry_point = s.name
            break
    if not entry_point:
        entry_point = services[0].name

    # Build proxy port map: connection → toxiproxy listener port
    proxy_map = {}
    for i, conn in enumerate(connections):
        port = TOXIPROXY_BASE_PORT + i
        proxy_name = f"{conn.from_service}_to_{conn.to_service}"
        target_svc = next(s for s in services if s.name == conn.to_service)
        proxy_map[proxy_name] = {
            "listen_port": port,
            "upstream": f"{conn.to_service}:{target_svc.port}",
            "from": conn.from_service,
            "to": conn.to_service,
        }

    # Build env var overrides: from-service gets UPSTREAM_URL → toxiproxy:PORT
    connection_env_overrides: Dict[str, Dict[str, str]] = {}
    for proxy_name, pinfo in proxy_map.items():
        from_svc = pinfo["from"]
        to_svc = pinfo["to"]
        env_key = f"{to_svc.upper().replace('-', '_')}_URL"
        if from_svc not in connection_env_overrides:
            connection_env_overrides[from_svc] = {}
        connection_env_overrides[from_svc][env_key] = f"http://toxiproxy:{pinfo['listen_port']}"

    # Store config as namespace annotation for later retrieval
    sandbox_config = {
        "services": [{"name": s.name, "image": s.image, "port": s.port, "entry_point": s.entry_point} for s in services],
        "connections": [{"from": c.from_service, "to": c.to_service} for c in connections],
        "entry_point": entry_point,
        "proxy_map": proxy_map,
    }

    try:
        # 1. Create namespace with config annotation
        ns = client.V1Namespace(
            metadata=client.V1ObjectMeta(
                name=ns_name,
                labels={
                    "app.kubernetes.io/part-of": "prometheon",
                    "prometheon.io/role": "tenant",
                    "prometheon.io/tenant-id": req.tenant_id[:36],
                    "prometheon.io/sandbox-id": sandbox_id,
                    "prometheon.io/sandbox-name": req.name[:60],
                    "prometheon.io/entry-point": entry_point,
                },
                annotations={
                    "prometheon.io/sandbox-config": json.dumps(sandbox_config),
                },
            )
        )
        core_v1.create_namespace(ns)
        print(f"[sandbox-mgr] Created namespace: {ns_name}")

        # 2. ResourceQuota
        rq = client.V1ResourceQuota(
            metadata=client.V1ObjectMeta(name="sandbox-quota", namespace=ns_name),
            spec=client.V1ResourceQuotaSpec(
                hard={"requests.cpu": quota["cpu"], "requests.memory": quota["memory"], "pods": quota["pods"]}
            ),
        )
        core_v1.create_namespaced_resource_quota(ns_name, rq)

        # 3. NetworkPolicy
        netpol_body = {
            "apiVersion": "networking.k8s.io/v1",
            "kind": "NetworkPolicy",
            "metadata": {"name": "tenant-isolation", "namespace": ns_name},
            "spec": {
                "podSelector": {},
                "policyTypes": ["Ingress"],
                "ingress": [{
                    "from": [
                        {"podSelector": {}},
                        {"namespaceSelector": {"matchLabels": {"prometheon.io/role": "platform"}}},
                    ]
                }],
            },
        }
        networking_v1.create_namespaced_network_policy(ns_name, netpol_body)

        # 4. Deploy Toxiproxy (if there are connections)
        if connections:
            extra_ports = [pinfo["listen_port"] for pinfo in proxy_map.values()]
            _create_deployment(
                ns_name, "toxiproxy", TOXIPROXY_IMAGE, 8474,
                extra_ports=extra_ports,
                tier=tier,
                image_pull_policy="IfNotPresent",
            )

        # 5. Deploy each user service
        for svc in services:
            # Merge user env + connection overrides + OTel
            env_vars = dict(svc.env)
            if svc.name in connection_env_overrides:
                env_vars.update(connection_env_overrides[svc.name])

            # OTel instrumentation
            env_vars.update({
                "OTEL_SERVICE_NAME": f"{svc.name}-{sandbox_id}",
                "OTEL_TRACES_EXPORTER": "otlp",
                "OTEL_TRACES_SAMPLER": "always_on",
                "OTEL_PROPAGATORS": "tracecontext,baggage",
                "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
                "OTEL_EXPORTER_OTLP_ENDPOINT": otel_endpoint,
                "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": f"{otel_endpoint}/v1/traces",
            })

            # For demo images, use Never (pre-loaded in kind). For user images, use IfNotPresent.
            pull_policy = "Never" if svc.image.startswith("prometheon/") else "IfNotPresent"

            _create_deployment(
                ns_name, svc.name, svc.image, svc.port,
                env_vars=env_vars,
                tier=tier,
                image_pull_policy=pull_policy,
            )

        # 6. Toxiproxy init job (dynamic proxies)
        if connections:
            _create_toxiproxy_init_job(ns_name, sandbox_id, proxy_map)

        # Build response
        svc_endpoints = {}
        for svc in services:
            svc_endpoints[svc.name] = f"{svc.name}.{ns_name}.svc.cluster.local:{svc.port}"
        if connections:
            svc_endpoints["toxiproxy"] = f"toxiproxy.{ns_name}.svc.cluster.local:8474"

        return SandboxResponse(
            sandbox_id=sandbox_id,
            namespace=ns_name,
            tenant_id=req.tenant_id,
            name=req.name,
            status="creating",
            services=svc_endpoints,
            entry_point=entry_point,
            connections=[{"from": c.from_service, "to": c.to_service, "proxy": f"{c.from_service}_to_{c.to_service}"} for c in connections],
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    except ApiException as e:
        try:
            core_v1.delete_namespace(ns_name)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"K8s API error: {e.reason}")
    except HTTPException:
        raise
    except Exception as e:
        try:
            core_v1.delete_namespace(ns_name)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Sandbox creation failed: {str(e)}")


# ---------------------------------------------------------------------------
# GET /sandboxes
# ---------------------------------------------------------------------------
@app.get("/sandboxes")
def list_sandboxes(tenant_id: Optional[str] = None):
    label_selector = "prometheon.io/role=tenant"
    if tenant_id:
        label_selector += f",prometheon.io/tenant-id={tenant_id[:36]}"

    try:
        namespaces = core_v1.list_namespace(label_selector=label_selector)
        sandboxes = []
        for ns in namespaces.items:
            labels = ns.metadata.labels or {}
            annotations = ns.metadata.annotations or {}
            pods = core_v1.list_namespaced_pod(ns.metadata.name)
            running = sum(1 for p in pods.items if p.status.phase == "Running")
            total = len(pods.items)

            # Parse stored config
            config_json = annotations.get("prometheon.io/sandbox-config", "{}")
            try:
                sandbox_config = json.loads(config_json)
            except json.JSONDecodeError:
                sandbox_config = {}

            sandboxes.append({
                "sandbox_id": labels.get("prometheon.io/sandbox-id", "unknown"),
                "namespace": ns.metadata.name,
                "tenant_id": labels.get("prometheon.io/tenant-id", "unknown"),
                "name": labels.get("prometheon.io/sandbox-name", "default"),
                "status": "ready" if running == total and total > 0 else "creating",
                "pods": f"{running}/{total}",
                "entry_point": labels.get("prometheon.io/entry-point", ""),
                "service_count": len(sandbox_config.get("services", [])),
                "connection_count": len(sandbox_config.get("connections", [])),
                "created_at": ns.metadata.creation_timestamp.isoformat() if ns.metadata.creation_timestamp else None,
            })
        return sandboxes
    except ApiException as e:
        raise HTTPException(status_code=500, detail=f"K8s API error: {e.reason}")


# ---------------------------------------------------------------------------
# GET /sandboxes/{sandbox_id}
# ---------------------------------------------------------------------------
@app.get("/sandboxes/{sandbox_id}")
def get_sandbox(sandbox_id: str):
    label_selector = f"prometheon.io/sandbox-id={sandbox_id}"
    try:
        namespaces = core_v1.list_namespace(label_selector=label_selector)
        if not namespaces.items:
            raise HTTPException(status_code=404, detail="Sandbox not found")

        ns = namespaces.items[0]
        ns_name = ns.metadata.name
        labels = ns.metadata.labels or {}
        annotations = ns.metadata.annotations or {}

        # Parse stored config
        config_json = annotations.get("prometheon.io/sandbox-config", "{}")
        try:
            sandbox_config = json.loads(config_json)
        except json.JSONDecodeError:
            sandbox_config = {}

        # Pod statuses
        pods = core_v1.list_namespaced_pod(ns_name)
        pod_statuses = []
        for p in pods.items:
            pod_statuses.append({
                "name": p.metadata.name,
                "status": p.status.phase,
                "ready": all(cs.ready for cs in (p.status.container_statuses or [])),
            })

        # Service endpoints
        k8s_services = core_v1.list_namespaced_service(ns_name)
        svc_endpoints = {
            s.metadata.name: f"{s.metadata.name}.{ns_name}.svc.cluster.local:{s.spec.ports[0].port}"
            for s in k8s_services.items
        }

        running = sum(1 for p in pods.items if p.status.phase == "Running")
        total = len(pods.items)

        return {
            "sandbox_id": sandbox_id,
            "namespace": ns_name,
            "tenant_id": labels.get("prometheon.io/tenant-id", "unknown"),
            "name": labels.get("prometheon.io/sandbox-name", "default"),
            "status": "ready" if running == total and total > 0 else "creating",
            "pods": pod_statuses,
            "services": svc_endpoints,
            "config": sandbox_config,
            "entry_point": sandbox_config.get("entry_point", labels.get("prometheon.io/entry-point", "")),
            "created_at": ns.metadata.creation_timestamp.isoformat() if ns.metadata.creation_timestamp else None,
        }
    except HTTPException:
        raise
    except ApiException as e:
        raise HTTPException(status_code=500, detail=f"K8s API error: {e.reason}")


# ---------------------------------------------------------------------------
# DELETE /sandboxes/{sandbox_id}
# ---------------------------------------------------------------------------
@app.delete("/sandboxes/{sandbox_id}")
def delete_sandbox(sandbox_id: str):
    label_selector = f"prometheon.io/sandbox-id={sandbox_id}"
    try:
        namespaces = core_v1.list_namespace(label_selector=label_selector)
        if not namespaces.items:
            raise HTTPException(status_code=404, detail="Sandbox not found")

        ns_name = namespaces.items[0].metadata.name
        core_v1.delete_namespace(ns_name)
        print(f"[sandbox-mgr] Deleting namespace: {ns_name}")
        return {"deleted": True, "sandbox_id": sandbox_id, "namespace": ns_name}
    except HTTPException:
        raise
    except ApiException as e:
        raise HTTPException(status_code=500, detail=f"K8s API error: {e.reason}")


# ---------------------------------------------------------------------------
# Demo service presets
# ---------------------------------------------------------------------------
def _demo_services() -> List[ServiceConfig]:
    return [
        ServiceConfig(name="service-a", image=DEMO_SERVICE_A, port=8080, entry_point=True,
                       env={"SERVICE_B_URL": "http://toxiproxy:8666"}),
        ServiceConfig(name="service-b", image=DEMO_SERVICE_B, port=8080,
                       env={"SERVICE_C_URL": "http://toxiproxy:8667"}),
        ServiceConfig(name="service-c", image=DEMO_SERVICE_C, port=8080),
    ]


def _demo_connections() -> List[ConnectionConfig]:
    return [
        ConnectionConfig(from_service="service-a", to_service="service-b"),
        ConnectionConfig(from_service="service-b", to_service="service-c"),
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _create_deployment(
    namespace: str,
    name: str,
    image: str,
    port: int,
    env_vars: Dict[str, str] = None,
    extra_ports: list = None,
    tier: dict = None,
    image_pull_policy: str = "Never",
):
    tier = tier or RESOURCE_TIERS["small"]

    container_ports = [client.V1ContainerPort(container_port=port)]
    svc_ports = [client.V1ServicePort(port=port, target_port=port, name=f"http-{port}")]
    for ep in (extra_ports or []):
        container_ports.append(client.V1ContainerPort(container_port=ep))
        svc_ports.append(client.V1ServicePort(port=ep, target_port=ep, name=f"tcp-{ep}"))

    env = [client.V1EnvVar(name=k, value=v) for k, v in (env_vars or {}).items()]

    deployment = client.V1Deployment(
        metadata=client.V1ObjectMeta(name=name, namespace=namespace, labels={"app": name}),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": name}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"app": name}),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name=name,
                            image=image,
                            image_pull_policy=image_pull_policy,
                            ports=container_ports,
                            env=env,
                            resources=client.V1ResourceRequirements(
                                requests={"memory": tier["mem_request"], "cpu": tier["cpu_request"]},
                                limits={"memory": tier["mem_limit"], "cpu": tier["cpu_limit"]},
                            ),
                        )
                    ]
                ),
            ),
        ),
    )
    apps_v1.create_namespaced_deployment(namespace, deployment)

    service = client.V1Service(
        metadata=client.V1ObjectMeta(name=name, namespace=namespace),
        spec=client.V1ServiceSpec(selector={"app": name}, ports=svc_ports),
    )
    core_v1.create_namespaced_service(namespace, service)
    print(f"[sandbox-mgr] Deployed {name} ({image}) in {namespace}")


def _create_toxiproxy_init_job(namespace: str, sandbox_id: str, proxy_map: dict):
    batch_v1 = client.BatchV1Api()

    # Build wget commands for each proxy
    commands = ["sleep 5"]
    for proxy_name, pinfo in proxy_map.items():
        payload = json.dumps({
            "name": proxy_name,
            "listen": f"0.0.0.0:{pinfo['listen_port']}",
            "upstream": pinfo["upstream"],
            "enabled": True,
        })
        commands.append(
            f"wget -q -O- --post-data='{payload}' "
            f"--header='Content-Type: application/json' "
            f"http://toxiproxy:8474/proxies"
        )
    commands.append(f"echo 'Toxiproxy configured for sandbox {sandbox_id}: {len(proxy_map)} proxies'")

    init_cmd = " && ".join(commands)

    job = client.V1Job(
        metadata=client.V1ObjectMeta(name=f"toxiproxy-init-{sandbox_id}", namespace=namespace),
        spec=client.V1JobSpec(
            backoff_limit=3,
            ttl_seconds_after_finished=120,
            template=client.V1PodTemplateSpec(
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name="init",
                            image="busybox:1.36",
                            image_pull_policy="IfNotPresent",
                            command=["/bin/sh", "-c", init_cmd],
                            resources=client.V1ResourceRequirements(
                                requests={"memory": "32Mi", "cpu": "50m"},
                                limits={"memory": "64Mi", "cpu": "100m"},
                            ),
                        )
                    ],
                    restart_policy="OnFailure",
                )
            ),
        ),
    )
    batch_v1.create_namespaced_job(namespace, job)
    print(f"[sandbox-mgr] Created toxiproxy-init job for {len(proxy_map)} proxies in {namespace}")


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)