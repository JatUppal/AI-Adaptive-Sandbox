"""
Prometheon Sandbox Proxy v2 — dynamic service discovery.
Reads sandbox config from sandbox manager to determine service names,
entry point, and proxy names. No hardcoded service-a/b/c.
"""
import asyncio, os, json
from typing import Dict, Any, List, Optional
import httpx
from fastapi import APIRouter, HTTPException, Depends
from auth import get_current_user

router = APIRouter(prefix="/api/sandbox", tags=["sandbox-proxy"])
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
SANDBOX_MGR_URL = os.getenv("SANDBOX_MANAGER_URL", "http://sandbox-manager:9000")
_sandbox_cache: Dict[str, dict] = {}

async def _get_sandbox_info(sandbox_id: str) -> dict:
    if sandbox_id in _sandbox_cache:
        return _sandbox_cache[sandbox_id]
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{SANDBOX_MGR_URL}/sandboxes/{sandbox_id}")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Sandbox not found")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to resolve sandbox")
        data = resp.json()
        _sandbox_cache[sandbox_id] = data
        return data

def _svc_url(ns: str, svc: str, port: int = 8080) -> str:
    return f"http://{svc}.{ns}.svc.cluster.local:{port}"

def _get_service_names(info: dict) -> List[str]:
    config = info.get("config", {})
    services = config.get("services", [])
    if services:
        return [s["name"] for s in services]
    return [n for n in info.get("services", {}) if n != "toxiproxy"]

def _get_entry_point(info: dict) -> str:
    return info.get("entry_point", "") or _get_service_names(info)[0]

def _get_service_port(info: dict, name: str) -> int:
    for svc in info.get("config", {}).get("services", []):
        if svc["name"] == name:
            return svc.get("port", 8080)
    return 8080

# --- Config endpoint for frontend ---
@router.get("/{sandbox_id}/config")
async def sandbox_config(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    info = await _get_sandbox_info(sandbox_id)
    config = info.get("config", {})
    return {
        "services": config.get("services", []),
        "connections": config.get("connections", []),
        "entry_point": _get_entry_point(info),
        "proxy_map": config.get("proxy_map", {}),
    }

# --- Health ---
@router.get("/{sandbox_id}/services/health")
async def sandbox_services_health(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    info = await _get_sandbox_info(sandbox_id)
    ns = info["namespace"]
    results = []
    async with httpx.AsyncClient(timeout=3.0) as client:
        for svc_name in _get_service_names(info):
            port = _get_service_port(info, svc_name)
            try:
                resp = await client.get(f"{_svc_url(ns, svc_name, port)}/health")
                results.append({"name": svc_name, "status": "Healthy" if resp.status_code < 400 else "Unhealthy"})
            except Exception:
                results.append({"name": svc_name, "status": "Unhealthy"})
        try:
            resp = await client.get("http://prometheus.prometheon-platform.svc.cluster.local:9090/-/healthy")
            results.append({"name": "Prometheus", "status": "Healthy" if resp.status_code < 400 else "Unhealthy"})
        except Exception:
            results.append({"name": "Prometheus", "status": "Unhealthy"})
        if "toxiproxy" in info.get("services", {}):
            try:
                resp = await client.get(_svc_url(ns, "toxiproxy", 8474) + "/version")
                results.append({"name": "Toxiproxy", "status": "Healthy" if resp.status_code < 400 else "Unhealthy"})
            except Exception:
                results.append({"name": "Toxiproxy", "status": "Unhealthy"})
    return results

# --- Toxiproxy CRUD ---
@router.get("/{sandbox_id}/toxics/list")
async def list_toxics(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    info = await _get_sandbox_info(sandbox_id)
    toxi_url = _svc_url(info["namespace"], "toxiproxy", 8474)
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{toxi_url}/proxies")
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed to list proxies")
        proxies = resp.json()
        result = {}
        for pname, pdata in proxies.items():
            tr = await client.get(f"{toxi_url}/proxies/{pname}/toxics")
            result[pname] = {"listen": pdata.get("listen",""), "upstream": pdata.get("upstream",""), "enabled": pdata.get("enabled",True), "toxics": tr.json() if tr.status_code==200 else []}
        return result

@router.post("/{sandbox_id}/toxics/add")
async def add_toxic(sandbox_id: str, payload: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    info = await _get_sandbox_info(sandbox_id)
    toxi_url = _svc_url(info["namespace"], "toxiproxy", 8474)
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{toxi_url}/proxies/{payload.get('proxy','')}/toxics", json=payload.get("toxic",{}))
        if resp.status_code not in (200,201):
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()

@router.delete("/{sandbox_id}/toxics/remove/{proxy}/{toxic}")
async def remove_toxic(sandbox_id: str, proxy: str, toxic: str, current_user: dict = Depends(get_current_user)):
    info = await _get_sandbox_info(sandbox_id)
    toxi_url = _svc_url(info["namespace"], "toxiproxy", 8474)
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.delete(f"{toxi_url}/proxies/{proxy}/toxics/{toxic}")
        if resp.status_code not in (200,204):
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return {"deleted": True}

# --- Replay ---
@router.post("/{sandbox_id}/replay/start")
async def replay_start(sandbox_id: str, payload: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    info = await _get_sandbox_info(sandbox_id)
    ns = info["namespace"]
    entry = _get_entry_point(info)
    port = _get_service_port(info, entry)
    target = _svc_url(ns, entry, port)
    count = payload.get("count", 60)
    delay = payload.get("delay", 1000)
    path = payload.get("path", "/checkout")
    results = {"total": count, "success": 0, "failed": 0, "errors": [], "entry_point": entry, "path": path}
    async with httpx.AsyncClient(timeout=10.0) as client:
        for i in range(count):
            try:
                resp = await client.get(f"{target}{path}")
                if resp.status_code < 400: results["success"] += 1
                else: results["failed"] += 1
            except Exception as e:
                results["failed"] += 1
                if len(results["errors"]) < 5: results["errors"].append(str(e))
            if delay > 0 and i < count - 1:
                await asyncio.sleep(delay / 1000.0)
    return results

# --- Prometheus metrics ---
def _otel_name(svc: str, sid: str) -> str:
    return f"{svc}-{sid}"

async def _prom_query(query: str):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": query})
        if resp.status_code != 200: return None
        r = resp.json().get("data",{}).get("result",[])
        return float(r[0]["value"][1]) if r and "value" in r[0] else 0.0

async def _prom_range(query: str, dur: str = "20m", step: str = "60s") -> list:
    import time
    import math
    end = int(time.time())
    # Parse duration string to seconds
    dur_seconds = int(dur.replace("m", "")) * 60
    start = end - dur_seconds
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{PROMETHEUS_URL}/api/v1/query_range", params={"query": query, "start": str(start), "end": str(end), "step": step})
        if resp.status_code != 200: return []
        r = resp.json().get("data",{}).get("result",[])
        values = []
        for v in (r[0].get("values",[]) if r else []):
            fval = float(v[1])
            if math.isnan(fval) or math.isinf(fval):
                fval = 0.0
            values.append({"time": v[0], "value": fval})
        return values

async def _entry_otel(sid: str) -> str:
    info = await _get_sandbox_info(sid)
    return _otel_name(_get_entry_point(info), sid)

@router.get("/{sandbox_id}/prom/requests")
async def prom_requests(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    s = await _entry_otel(sandbox_id)
    v = await _prom_query(f'sum(rate(prometheon_calls_total{{service_name="{s}"}}[5m]))')
    return {"value": round(v or 0, 3), "label": "Last scrape"}

@router.get("/{sandbox_id}/prom/errors")
async def prom_errors(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    s = await _entry_otel(sandbox_id)
    t = await _prom_query(f'sum(rate(prometheon_calls_total{{service_name="{s}"}}[5m]))')
    e = await _prom_query(f'sum(rate(prometheon_calls_total{{service_name="{s}",status_code="STATUS_CODE_ERROR"}}[5m]))')
    return {"value": round(((e or 0)/(t if t else 1))*100, 2), "label": "Last scrape"}

@router.get("/{sandbox_id}/prom/p95")
async def prom_p95(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    s = await _entry_otel(sandbox_id)
    v = await _prom_query(f'histogram_quantile(0.95, sum(rate(prometheon_duration_milliseconds_bucket{{service_name="{s}"}}[5m])) by (le))')
    return {"value": round(v or 0, 1), "label": "Last scrape"}

@router.get("/{sandbox_id}/prom/requests/range")
async def prom_requests_range(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    s = await _entry_otel(sandbox_id)
    return await _prom_range(f'sum(rate(prometheon_calls_total{{service_name="{s}"}}[5m]))')

@router.get("/{sandbox_id}/prom/errors/range")
async def prom_errors_range(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    s = await _entry_otel(sandbox_id)
    return await _prom_range(f'sum(rate(prometheon_calls_total{{service_name="{s}",status_code="STATUS_CODE_ERROR"}}[5m]))')

@router.get("/{sandbox_id}/prom/p95/range")
async def prom_p95_range(sandbox_id: str, current_user: dict = Depends(get_current_user)):
    s = await _entry_otel(sandbox_id)
    return await _prom_range(f'histogram_quantile(0.95, sum(rate(prometheon_duration_milliseconds_bucket{{service_name="{s}"}}[5m])) by (le))')