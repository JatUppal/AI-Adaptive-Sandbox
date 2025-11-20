# AI Adaptive Sandbox

A full observability sandbox for distributed tracing, metrics, and failure simulation.

Includes 3 FastAPI microservices instrumented with OpenTelemetry, Prometheus, Grafana, Jaeger, and Toxiproxy.

## Stack Overview

| Component | Purpose | URL / Port |
|-----------|---------|------------|
| `service-a` | Entry service (A→B→C chain) | http://localhost:8081 |
| `service-b` | Internal downstream | :8080 |
| `service-c` | Internal downstream | :8080 |
| `ai-predictor` | AI failure risk prediction | http://localhost:8085 |
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

# Phase 2 — Predictive AI (Complete Guide)

**Goal:** Build a dataset from Prometheus metrics, train a failure prediction model, and serve live risk scores via API and Prometheus metrics with Grafana visualization.

## Prerequisites

Ensure the sandbox is running:
```bash
docker compose up -d
```

## Step 1: Generate Load & Metrics

Generate normal traffic to collect baseline metrics:
```bash
# Generate 60 seconds of normal traffic
for i in {1..60}; do 
  curl -s http://localhost:8081/checkout >/dev/null
  sleep 1
done
```

Optionally inject some failures to create a balanced dataset:
```bash
# Add latency toxic to simulate degradation
curl -X POST http://localhost:8474/proxies/a_to_b/toxics \
  -H "Content-Type: application/json" \
  -d '{"type":"latency","name":"lat_test","attributes":{"latency":1000}}'

# Generate traffic with failures
for i in {1..30}; do 
  curl -s http://localhost:8081/checkout >/dev/null
  sleep 1
done

# Remove toxic
curl -X DELETE http://localhost:8474/proxies/a_to_b/toxics/lat_test
```

## Step 2: Build Training Dataset

Install dependencies and build the dataset from Prometheus:
```bash
pip install -r scripts/requirements.txt
python scripts/build_dataset.py --minutes 30 --out data/phase2/metrics_dataset.csv
```

**Output:** `data/phase2/metrics_dataset.csv` with features:
- `req_rate`: Request rate (requests/sec)
- `err_rate`: Error rate (0-1)
- `p50_ms`: 50th percentile latency (ms)
- `p95_ms`: 95th percentile latency (ms)
- `toxic_active`: Whether failure injection is active (0/1)
- `failure`: Label (1 if error_rate > 0.1 or p95 > 800ms)

## Step 3: Train the Model

Train a Random Forest classifier:
```bash
python scripts/train_model.py \
  --data data/phase2/metrics_dataset.csv \
  --model-out models/failure_predictor.pkl \
  --cols-out models/feature_columns.json
```

**Outputs:**
- `models/failure_predictor.pkl`: Trained sklearn model
- `models/feature_columns.json`: Feature column order for inference

The script will display:
- Classification report
- Feature importance
- ROC AUC score

## Step 4: Run the AI Predictor Service

The ai-predictor service is already configured in `docker-compose.yml`. Start it:

```bash
docker compose up -d ai-predictor
```

The service will:
- Load the trained model from `models/`
- Query live metrics from Prometheus every time `/predict` is called
- Expose `failure_risk_score` metric on `/metrics`

**Ports:**
- API: http://localhost:8085
- Metrics: http://localhost:8085/metrics

## Step 5: Test the Predictor

### Health check
```bash
curl http://localhost:8085/health | jq
```

Expected output:
```json
{
  "ok": true,
  "model_loaded": true,
  "prom_url": "http://prometheus:9090"
}
```

### Get risk prediction
```bash
curl http://localhost:8085/predict | jq
```

Expected output:
```json
{
  "service": "service-a",
  "risk_score": 0.23,
  "status": "LOW",
  "reason": "err_rate=0.000, p95=245ms",
  "features": {
    "req_rate": 0.5,
    "err_rate": 0.0,
    "p50_ms": 150,
    "p95_ms": 245,
    "toxic_active": 0
  },
  "model_loaded": true
}
```

**Status thresholds:**
- `LOW`: risk_score < 0.5
- `MEDIUM`: 0.5 ≤ risk_score < 0.8
- `HIGH_RISK`: risk_score ≥ 0.8

### View Prometheus metric
```bash
curl http://localhost:8085/metrics | grep failure_risk_score
```

Expected output:
```
failure_risk_score{service="service-a"} 0.23
```

## Step 6: View in Grafana

Open Grafana at http://localhost:3000 and navigate to the **Reporting Dashboard**.

The dashboard now includes two new panels:
1. **AI Failure Risk Score** (Gauge): Current risk level with color thresholds
   - Green: < 0.5 (LOW)
   - Yellow: 0.5-0.8 (MEDIUM)
   - Red: ≥ 0.8 (HIGH_RISK)

2. **AI Failure Risk Over Time** (Time Series): Historical risk trend

Both panels query: `failure_risk_score{service="service-a"}`

The dashboard auto-refreshes every 5 seconds.

## Step 7: Test Live Predictions

Inject a failure and watch the risk score increase:

```bash
# Add high latency
curl -X POST http://localhost:8474/proxies/a_to_b/toxics \
  -H "Content-Type: application/json" \
  -d '{"type":"latency","name":"high_lat","attributes":{"latency":2000}}'

# Generate traffic
for i in {1..20}; do 
  curl -s http://localhost:8081/checkout >/dev/null
  sleep 1
done

# Check risk score (should increase)
curl http://localhost:8085/predict | jq '.risk_score'

# Watch in Grafana - gauge should turn yellow/red
```

Clean up:
```bash
curl -X DELETE http://localhost:8474/proxies/a_to_b/toxics/high_lat
```

## Architecture

```
┌─────────────┐
│  Services   │ → Metrics → ┌────────────┐
│  (A, B, C)  │             │ Prometheus │
└─────────────┘             └──────┬─────┘
                                   │
                            ┌──────▼──────┐
                            │AI Predictor │
                            │  - Queries  │
                            │  - Predicts │
                            │  - Exposes  │
                            └──────┬──────┘
                                   │
                            ┌──────▼──────┐
                            │  Grafana    │
                            │  Dashboard  │
                            └─────────────┘
```

## Troubleshooting

### Model not loaded
If `model_loaded: false`:
1. Ensure you ran Step 3 to train the model
2. Check that `models/failure_predictor.pkl` exists
3. Restart the service: `docker compose restart ai-predictor`

### No data in Grafana panels
1. Verify Prometheus is scraping ai-predictor:
   - Visit http://localhost:9090/targets
   - Look for `ai-predictor` job (should be UP)
2. Call `/predict` at least once to initialize the metric
3. Check metric exists: `curl http://localhost:8085/metrics | grep failure_risk_score`

### Risk score always 0.2 (stub)
This means the model isn't loaded or predictions are failing:
1. Check logs: `docker compose logs ai-predictor`
2. Verify model files exist in `models/`
3. Ensure training completed successfully

### Prometheus queries return 0
- Wait 1-2 minutes for metrics to accumulate
- Ensure services are receiving traffic
- Check Prometheus UI: http://localhost:9090

## Local Development (without Docker)

Run the predictor locally for faster iteration:

```bash
# Install dependencies
pip install -r services/ai-predictor/requirements.txt

# Set environment variables
export PROM_URL=http://localhost:9090
export MODEL_PATH=models/failure_predictor.pkl
export COLS_PATH=models/feature_columns.json

# Run service
uvicorn services.ai-predictor.app:app --reload --port 8085
```

Access at http://localhost:8085

## Next Steps

- **Improve the model**: Collect more diverse failure scenarios
- **Add more features**: Include toxic_active detection, request patterns
- **Automated retraining**: Schedule periodic model updates
- **Alerting**: Set up alerts when risk_score > 0.8
- **Multi-service**: Extend predictions to service-b and service-c
