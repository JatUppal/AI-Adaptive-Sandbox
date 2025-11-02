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
