# AI Adaptive Sandbox

A full observability sandbox for distributed tracing, metrics, and failure simulation.

Includes 3 FastAPI microservices instrumented with OpenTelemetry, Prometheus, Grafana, Jaeger, and Toxiproxy.

## Stack Overview

| Component | Purpose | URL / Port |
|-----------|---------|------------|
| `service-a` | Entry service (A→B→C chain) | http://localhost:8081 |
| `service-b` | Internal downstream | :8080 |
| `service-c` | Internal downstream | :8080 |
| `otel-collector` | Receives and exports traces | 4317 / 4318 |
| `jaeger` | Trace visualization | http://localhost:16686 |
| `prometheus` | Metrics storage & queries | http://localhost:9090 |
| `grafana` | Dashboards & reports | http://localhost:3000 |
| `toxiproxy` | Failure injection | API: :8474, A→B: :8666, B→C: :8667 |
| `mock-slack` | Simulated Slack alerts | http://localhost:5000 |


## Start the Frontend
### 1) Start the platform (services + prom + toxiproxy)

From the repo root:
```bash
# starts: service-a,b,c + toxiproxy + prometheus + the proxy (port 3001)
docker compose up -d
```

#### Sanity checks:
```bash
# Proxy (gateway) health
curl -s http://localhost:3001/proxy/health

# Prometheus health page (UI)
open http://localhost:9090   # or: xdg-open ... / start ...
# or query via API:
curl -s "http://localhost:9090/-/healthy"
```

### 2) Configure the frontend

Create `frontend/.env` (or `.env.local`) with the proxy base URL so the UI can call the gateway:
```bash
# frontend/.env
VITE_PROXY_URL=http://localhost:3001/proxy
```

If you omit this, the app will default to `/proxy` and expect your frontend and proxy to be served from the same origin.

### 3) Run the frontend (Vite)
```bash
cd frontend

# install deps
npm install
# (or) pnpm i
# (or) yarn

# run dev server (http://localhost:5173)
npm run dev
```

**Open:** `http://localhost:5173`

You should see the left-nav: Dashboard / Replay / Failure Injection / AI Insights / Reports

### 4) What each page does

#### Dashboard
* Tiles show instant values (requests/min, error rate, p95).
* Charts show range (last 5 min) time series.
* Data comes from Prometheus through the proxy:
  * `GET /proxy/prom/requests`
  * `GET /proxy/prom/errors`
  * `GET /proxy/prom/p95`
  * `GET /proxy/prom/requests/range`
  * `GET /proxy/prom/errors/range`
  * `GET /proxy/prom/p95/range`

#### Replay
* Click Start Replay to send N requests through A → B → C.
* Proxy endpoint used:
  * `POST /proxy/replay/start` with `{ count, delay }`.

#### Failure Injection
* Lists Toxiproxy proxies (`a_to_b`, `b_to_c`).
* Add a toxic (e.g., latency 1000ms; optional jitter).
* Proxy endpoints used:
  * `GET /proxy/toxics/list`
  * `POST /proxy/toxics/add` `{ proxy, toxic }`
  * `DELETE /proxy/toxics/remove/:proxy/:toxicName`

After adding latency on `a_to_b`, re-run Replay—success rate will dip and p95 will rise.

### 5) Useful curl checks
```bash
# Proxy
curl -s http://localhost:3001/proxy/health
curl -s http://localhost:3001/proxy/status
curl -s -X POST http://localhost:3001/proxy/replay/start \
  -H 'content-type: application/json' -d '{"count":5,"delay":200}'

# Toxiproxy (via proxy)
curl -s http://localhost:3001/proxy/toxics/list | jq .
curl -s -X POST http://localhost:3001/proxy/toxics/add \
  -H 'content-type: application/json' \
  -d '{"proxy":"a_to_b","toxic":{"type":"latency","name":"lat_1000","attributes":{"latency":1000,"jitter":250}}}'

# Prometheus
curl -s "http://localhost:9090/-/healthy"
```

### 6) Environment & ports (defaults)

* **Frontend (Vite):** `5173`
* **Proxy (gateway):** `3001` (exposes `/proxy/*`)
* **Prometheus:** `9090`
* **Service A:** `8081` (external for quick curl tests)
* **Toxiproxy API:** `8474` (internal; UI calls through proxy)

If you change any of these in `docker-compose.yml` or the proxy config, update `VITE_PROXY_URL` accordingly.




## 1. Start the Sandbox

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

All services should be healthy.

## 2. Hit Service A (end-to-end request)

```bash
curl -s http://localhost:8081/checkout | jq .
```

Expected JSON:

```json
{
  "service": "A",
  "downstream": {
    "service": "B",
    "downstream": {
      "service": "C",
      "stock": 42
    }
  }
}
```

## 3. Generate Load

Run a small burst of requests:

```bash
for i in {1..20}; do curl -s http://localhost:8081/checkout > /dev/null; done
```

## 4. Observe Distributed Traces

Open Jaeger at http://localhost:16686.

Choose `service-a` and click **Find Traces** to view A→B→C spans.

## 5. View Metrics in Prometheus

Prometheus scrapes `/metrics` from all services.

Test queries directly at http://localhost:9090/graph:

**Request rate:**
```promql
sum by (service,endpoint) (rate(request_count_total[1m]))
```

**Error rate:**
```promql
sum by (service,endpoint) (rate(error_count_total[1m]))
```

## 6. View Grafana Dashboards

Visit: http://localhost:3000

**Default dashboard:** Reporting Dashboard

It shows:
- Request rate by service
- Error rate over time
- Latency (p50, p95)
- Real-time p95 gauges

⏱ **Dashboard refresh:** set to every 5 seconds  
 **Time window:** Last 15 minutes

The `[1m]` query windows are now saved permanently — no reconfiguration needed.

All dashboard JSONs are version-controlled in:
```
observability/grafana-dashboards/
```

They auto-load when teammates run `docker compose up`.

## 7. Inject Failures via Toxiproxy

Toxiproxy lets you simulate latency, packet loss, or disconnects.

### List proxies

```bash
toxiproxy-cli -host localhost:8474 list
```

### Add latency (A→B)

```bash
toxiproxy-cli -host localhost:8474 toxic add \
  --type latency \
  --toxicName latency_ab \
  --attribute latency=500 \
  --attribute jitter=50 \
  ab
```

### Simulate packet cut (A→B)

```bash
toxiproxy-cli -host localhost:8474 toxic add \
  --type limit_data \
  --toxicName ab-cut \
  --attribute bytes=1 \
  ab
```

### Remove toxics

```bash
toxiproxy-cli -host localhost:8474 toxic remove --toxicName ab-cut ab
toxiproxy-cli -host localhost:8474 toxic remove --toxicName latency_ab ab
```

## 🧪 8. Verify Error Metrics

After adding a toxic, test requests:

```bash
for i in $(seq 1 40); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/checkout
done | sort | uniq -c
```

You should see responses like `40 502` or `40 500`.

Confirm in metrics:

```bash
curl -s http://localhost:8081/metrics | egrep 'request_count_total|error_count_total'
```

Expected:
```
request_count_total{service="service-a",endpoint="/checkout"} 40
error_count_total{service="service-a",endpoint="/checkout"} 40
```

## 9. Visualize Failures

In Grafana, watch:
- Error rate spike to ~100%
- p95 latency change
- Gauges turn red

Then remove the toxic to return to normal — the dashboard will drop back to 0% error rate.

## 10. (Optional) Slack Alerts

Check the mock Slack service:

```bash
docker logs mock-slack
```

Send test alert:

```bash
curl -X POST http://localhost:5000/webhook \
  -H "Content-Type: application/json" \
  -d '{"text":"🔥 High error rate detected"}'
```

## 11. Tear Down

Stop and remove everything:

```bash
docker compose down
```

Clean data:

```bash
rm -rf data/captures/*
```

## Team Notes

**All dashboards persist** because of the writable Grafana mount:
- `./observability/grafana-dashboards:/var/lib/grafana/dashboards`

**Grafana auto-loads dashboards** defined in:
- `./observability/grafana-dashboards/dashboards.yml`

**Prometheus targets auto-register** from:
- `./observability/prometheus.yml`

# Phase 2 — Predictive AI (Quickstart)

**Goal:** build a tiny dataset from Prometheus, train a simple classifier, and serve a live `failure_risk_score` metric + `/predict` API.

## 0) Prep: generate some load
```bash
for i in {1..60}; do curl -s http://localhost:8081/checkout >/dev/null; sleep 1; done
```

## 1) Build a metrics dataset

Requires Prometheus running (`docker compose up -d prometheus`).
```bash
pip install -r scripts/requirements.txt
python scripts/build_dataset.py --minutes 30 --out data/phase2/metrics_dataset.csv
```

**Output:** `data/phase2/metrics_dataset.csv`

## 2) Train a model
```bash
python scripts/train_model.py \
  --data data/phase2/metrics_dataset.csv \
  --model-out models/failure_predictor.pkl \
  --cols-out models/feature_columns.json
```

**Outputs:**
* `models/failure_predictor.pkl` (sklearn model)
* `models/feature_columns.json` (feature order used at inference time)

## 3) Run the live predictor

### Local (no Docker):
```bash
pip install -r services/ai-predictor/requirements.txt
uvicorn services.ai-predictor.app:app --reload --port 8085
```

### Docker (optional, if you added it to `docker-compose.yml`):
```bash
docker compose up -d ai-predictor
```

## 4) Check outputs

### Risk API
```
http://localhost:8085/predict
```

### Prometheus metric
```
http://localhost:8085/metrics  →  failure_risk_score{service="service-a"}
```

### Grafana gauge (manual add)
* Open Grafana → any dashboard (or create one)
* Add a Gauge panel with query:
```promql
failure_risk_score{service="service-a"}
```
* Set refresh to 5s while testing.

## Notes / Troubleshooting

### Missing directories
If `data/phase2/` or `models/` don't exist, create them:
```bash
mkdir -p data/phase2 models
```

### Prometheus scrape configuration
If you run the predictor in Docker and want Prometheus to scrape it, add this to `observability/prometheus.yml` (choose one):

**Local host (no Docker):**
```yaml
- job_name: 'ai-predictor'
  scrape_interval: 5s
  static_configs:
    - targets: ['host.docker.internal:8085']
```

**Docker service (if defined in compose):**
```yaml
- job_name: 'ai-predictor'
  scrape_interval: 5s
  static_configs:
    - targets: ['ai-predictor:8080']
```

Then restart Prometheus:
```bash
docker compose restart prometheus
open http://localhost:9090/targets
```

### Model not loaded
If the predictor returns `model_loaded: false`, it will serve a stub score. Train the model (Step 2) or mount `models/` into the container so it can find `failure_predictor.pkl` and `feature_columns.json`.
