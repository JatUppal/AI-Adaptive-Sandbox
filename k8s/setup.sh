#!/bin/bash
set -e

# ==========================================================================
# Prometheon Phase 2B — Full K8s Setup
# Run from repo root: ./k8s/setup.sh
# ==========================================================================

CLUSTER_NAME="prometheon"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================"
echo "  Prometheon K8s Setup — Phase 2B"
echo "============================================"
echo ""

# ------------------------------------------------------------------
# Step 1: Create kind cluster (skip if exists)
# ------------------------------------------------------------------
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo "[1/6] Cluster '${CLUSTER_NAME}' already exists — skipping creation"
else
    echo "[1/6] Creating kind cluster '${CLUSTER_NAME}'..."
    kind create cluster --config "${SCRIPT_DIR}/kind-config.yaml"
fi

kubectl cluster-info --context "kind-${CLUSTER_NAME}"
echo ""

# ------------------------------------------------------------------
# Step 2: Build Docker images locally
# ------------------------------------------------------------------
echo "[2/6] Building Docker images..."

docker build -t prometheon/service-a:latest "${REPO_ROOT}/services/service-a" -f "${REPO_ROOT}/services/service-a/Dockerfile"
echo "  ✓ service-a"

docker build -t prometheon/service-b:latest "${REPO_ROOT}/services/service-b" -f "${REPO_ROOT}/services/service-b/Dockerfile"
echo "  ✓ service-b"

docker build -t prometheon/service-c:latest "${REPO_ROOT}/services/service-c" -f "${REPO_ROOT}/services/service-c/Dockerfile"
echo "  ✓ service-c"

docker build -t prometheon/rca-api:latest -f "${REPO_ROOT}/api/Dockerfile.k8s" "${REPO_ROOT}"
echo "  ✓ rca-api (with scripts + models baked in)"

docker build -t prometheon/sandbox-manager:latest "${REPO_ROOT}/sandbox-manager"
echo "  ✓ sandbox-manager"

echo ""

# ------------------------------------------------------------------
# Step 3: Load images into kind
# ------------------------------------------------------------------
echo "[3/6] Loading images into kind cluster..."

kind load docker-image prometheon/service-a:latest --name "${CLUSTER_NAME}"
kind load docker-image prometheon/service-b:latest --name "${CLUSTER_NAME}"
kind load docker-image prometheon/service-c:latest --name "${CLUSTER_NAME}"
kind load docker-image prometheon/rca-api:latest --name "${CLUSTER_NAME}"
kind load docker-image prometheon/sandbox-manager:latest --name "${CLUSTER_NAME}"

# Also load toxiproxy and busybox (used in tenant sandboxes)
echo "  Pulling and loading public images..."
docker pull --platform linux/amd64 shopify/toxiproxy 2>/dev/null || true
docker pull --platform linux/amd64 busybox:1.36 2>/dev/null || true
kind load docker-image shopify/toxiproxy --name "${CLUSTER_NAME}" || true
kind load docker-image busybox:1.36 --name "${CLUSTER_NAME}" || true

echo "  ✓ All images loaded"
echo ""

# ------------------------------------------------------------------
# Step 4: Apply platform manifests
# ------------------------------------------------------------------
echo "[4/6] Deploying platform services..."

kubectl apply -f "${SCRIPT_DIR}/platform/namespace.yaml"
kubectl apply -f "${SCRIPT_DIR}/platform/postgres.yaml"
kubectl apply -f "${SCRIPT_DIR}/platform/redis.yaml"
kubectl apply -f "${SCRIPT_DIR}/platform/otel-collector.yaml"
kubectl apply -f "${SCRIPT_DIR}/platform/observability.yaml"
kubectl apply -f "${SCRIPT_DIR}/platform/rca-api.yaml"
kubectl apply -f "${SCRIPT_DIR}/platform/sandbox-manager.yaml"

echo "  ✓ All manifests applied"
echo ""

# ------------------------------------------------------------------
# Step 5: Wait for pods to be ready
# ------------------------------------------------------------------
echo "[5/6] Waiting for pods to be ready (this may take 1-2 minutes)..."

kubectl -n prometheon-platform wait --for=condition=ready pod -l app=postgres --timeout=120s 2>/dev/null || echo "  ⏳ postgres still starting..."
kubectl -n prometheon-platform wait --for=condition=ready pod -l app=redis --timeout=60s 2>/dev/null || echo "  ⏳ redis still starting..."
kubectl -n prometheon-platform wait --for=condition=ready pod -l app=jaeger --timeout=60s 2>/dev/null || echo "  ⏳ jaeger still starting..."
kubectl -n prometheon-platform wait --for=condition=ready pod -l app=prometheus --timeout=60s 2>/dev/null || echo "  ⏳ prometheus still starting..."
kubectl -n prometheon-platform wait --for=condition=ready pod -l app=otel-collector --timeout=60s 2>/dev/null || echo "  ⏳ otel-collector still starting..."
kubectl -n prometheon-platform wait --for=condition=ready pod -l app=rca-api --timeout=120s 2>/dev/null || echo "  ⏳ rca-api still starting..."
kubectl -n prometheon-platform wait --for=condition=ready pod -l app=sandbox-manager --timeout=120s 2>/dev/null || echo "  ⏳ sandbox-manager still starting..."

echo ""

# ------------------------------------------------------------------
# Step 6: Print status
# ------------------------------------------------------------------
echo "[6/6] Cluster status:"
echo ""
kubectl get pods -n prometheon-platform -o wide
echo ""
echo "============================================"
echo "  Prometheon is running on Kubernetes!"
echo "============================================"
echo ""
echo "Access points (via kind NodePort):"
echo "  RCA API:          http://localhost:8000"
echo "  Sandbox Manager:  http://localhost:9000"
echo "  Jaeger UI:        http://localhost:16686"
echo "  Prometheus:       http://localhost:9090"
echo "  Grafana:          http://localhost:3000"
echo ""
echo "Quick test:"
echo "  curl http://localhost:8000/health"
echo "  curl http://localhost:9000/health"
echo ""
echo "Create a sandbox:"
echo '  curl -X POST http://localhost:9000/sandboxes \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{"tenant_id":"test-tenant-001","name":"my-sandbox"}'"'"''
echo ""
echo "Frontend: cd frontend && npm run dev"
echo ""