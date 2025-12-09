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

**Goal:** Build a dataset from Prometheus metrics, train a failure prediction classifier, and make predictions via API.

---

## Prerequisites

Ensure Docker services are running:
```bash
# Start all services (includes Toxiproxy proxy initialization)
docker compose up -d

# Verify services are healthy
docker ps

# Initialize Toxiproxy proxies (required for traffic flow)
curl -X POST http://localhost:8474/proxies \
  -H 'Content-Type: application/json' \
  -d '{"name":"a_to_b","listen":"0.0.0.0:8666","upstream":"service-b:8080","enabled":true}'

curl -X POST http://localhost:8474/proxies \
  -H 'Content-Type: application/json' \
  -d '{"name":"b_to_c","listen":"0.0.0.0:8667","upstream":"service-c:8080","enabled":true}'

# Verify proxies exist
curl -s http://localhost:8474/proxies | jq 'keys[]'
```

**Note:** Toxiproxy proxies must be created after each `docker compose down`. To persist proxies automatically, see [Troubleshooting](#toxiproxy-proxy-persistence) below.

---

## Step 0: Generate Traffic with Failure Scenarios

Generate diverse traffic patterns for training data:
```bash
# Round 1: Normal traffic (10 min)
echo "🟢 Generating normal traffic..."
for i in {1..600}; do 
    curl -s http://localhost:8081/checkout >/dev/null
    sleep 1
done

# Round 2: Add latency toxic (10 min)
echo "🟡 Adding latency toxic..."
curl -X POST http://localhost:8474/proxies/a_to_b/toxics \
  -H 'Content-Type: application/json' \
  -d '{"name":"lat1","type":"latency","attributes":{"latency":1000,"jitter":200}}'

for i in {1..600}; do 
    curl -s http://localhost:8081/checkout >/dev/null
    sleep 1
done

# Round 3: Different failure scenario (10 min)
echo "🔴 Switching to different toxic..."
curl -X DELETE http://localhost:8474/proxies/a_to_b/toxics/lat1
curl -X POST http://localhost:8474/proxies/b_to_c/toxics \
  -H 'Content-Type: application/json' \
  -d '{"name":"lat2","type":"latency","attributes":{"latency":1500,"jitter":300}}'

for i in {1..600}; do 
    curl -s http://localhost:8081/checkout >/dev/null
    sleep 1
done

# Cleanup
curl -X DELETE http://localhost:8474/proxies/b_to_c/toxics/lat2
echo "✅ Traffic generation complete!"
```

---

## Step 1: Build Metrics Dataset

Extract features from Prometheus and create labeled dataset:
```bash
# Create directories if needed
mkdir -p data/phase2 models

# Install dependencies
pip install -r scripts/requirements.txt

# Build dataset (captures last 35 minutes of metrics)
python scripts/build_dataset.py \
  --minutes 35 \
  --service service-a \
  --threshold_p95_ms 3000 \
  --out data/phase2/metrics_dataset.csv

# Verify dataset
wc -l data/phase2/metrics_dataset.csv
head -10 data/phase2/metrics_dataset.csv
```

**Output:** `data/phase2/metrics_dataset.csv`

**Expected:** 
- ≥150 usable rows (after removing NaN)
- Mix of label=0 (healthy) and label=1 (failures)
- Features: `req_rate`, `err_rate`, `p50_ms`, `p95_ms`, `toxic_active`

---

## Step 2: Train Failure Prediction Model

Train and evaluate LogisticRegression and RandomForest classifiers:
```bash
python scripts/train_model.py \
  --data data/phase2/metrics_dataset.csv \
  --model-out models/failure_predictor.pkl \
  --cols-out models/feature_columns.json
```

**What it does:**
- Loads dataset and removes NaN rows
- Splits data (80% train, 20% test)
- Trains two models:
  - `LogisticRegression` (liblinear, class_weight='balanced')
  - `RandomForestClassifier` (n_estimators=200, max_depth=8)
- Evaluates: precision, recall, F1, ROC AUC
- Selects best model by ROC AUC
- Saves model and feature column order

**Outputs:**
- `models/failure_predictor.pkl` - Trained sklearn model
- `models/feature_columns.json` - Feature order for inference

**Expected Results:**
```
ROC AUC:    ≥0.75 (target)
Precision:  High (minimize false positives)
Recall:     High (catch real failures)
```

---

## Step 3: Test Predictions

Make predictions using the trained model:
```bash
# Test with healthy traffic pattern
python scripts/predict_failure.py \
  --model models/failure_predictor.pkl \
  --cols models/feature_columns.json \
  --row '{"req_rate":0.4,"err_rate":0.0,"p50_ms":150,"p95_ms":600,"toxic_active":0}'

# Output: {"risk_score": 0.05, "label_hat": 0}  # Low risk, healthy

# Test with failure pattern
python scripts/predict_failure.py \
  --model models/failure_predictor.pkl \
  --cols models/feature_columns.json \
  --row '{"req_rate":0.5,"err_rate":0.8,"p50_ms":3000,"p95_ms":5000,"toxic_active":1}'

# Output: {"risk_score": 0.95, "label_hat": 1}  # High risk, failure
```

**Output format:**
- `risk_score`: Probability of failure [0.0 to 1.0]
- `label_hat`: Binary prediction (0=healthy, 1=failure)

---

## Step 4: Run Tests

Verify implementation with comprehensive test suite:
```bash
# Run all tests (15 tests covering core functionality and edge cases)
pytest scripts/tests/test_model.py -v

# Run specific test
pytest scripts/tests/test_model.py::test_model_with_edge_cases -v

# Run with coverage report
pip install pytest-cov
pytest scripts/tests/test_model.py -v --cov=scripts --cov-report=html
```

**Expected:** All 15 tests pass (99% coverage on model code)

---

## Step 5: Deploy Live Predictor (Optional)

Run the AI predictor service that exposes `/predict` API and Prometheus metrics:

### Local (Development):
```bash
pip install -r services/ai-predictor/requirements.txt
uvicorn services.ai-predictor.app:app --reload --port 8085
```

### Docker (Production):
```bash
docker compose up -d ai-predictor
```

### Check Endpoints:
```bash
# Health check
curl http://localhost:8085/health

# Prediction API
curl -X POST http://localhost:8085/predict \
  -H 'Content-Type: application/json' \
  -d '{"req_rate":0.5,"err_rate":0.1,"p50_ms":1500,"p95_ms":3500,"toxic_active":1}'

# Prometheus metrics
curl http://localhost:8085/metrics | grep failure_risk_score
```

---

## Grafana Integration

Add failure risk visualization to your dashboard:

1. **Open Grafana:** `http://localhost:3000`
2. **Create/Edit Dashboard**
3. **Add Gauge Panel:**
   - **Query:** `failure_risk_score{service="service-a"}`
   - **Thresholds:** 
     - Green: 0-0.5
     - Yellow: 0.5-0.8
     - Red: 0.8-1.0
4. **Add Time Series Panel:**
   - **Query:** `failure_risk_score{service="service-a"}`
   - **Refresh:** 5s

---

## Troubleshooting

### Toxiproxy Proxy Persistence

Proxies are lost when Toxiproxy restarts. To persist automatically:

**Option 1: Configuration File (Recommended)**

Create `observability/toxiproxy.json`:
```json
[
  {
    "name": "a_to_b",
    "listen": "0.0.0.0:8666",
    "upstream": "service-b:8080",
    "enabled": true
  },
  {
    "name": "b_to_c",
    "listen": "0.0.0.0:8667",
    "upstream": "service-c:8080",
    "enabled": true
  }
]
```

Update `docker-compose.yml`:
```yaml
toxiproxy:
  image: shopify/toxiproxy
  container_name: toxiproxy
  ports:
    - "8474:8474"
    - "8666:8666"
    - "8667:8667"
  volumes:
    - ./observability/toxiproxy.json:/config/toxiproxy.json:ro
  command: ["-config", "/config/toxiproxy.json"]
```

**Option 2: Initialization Script**

Create `scripts/init-toxiproxy.sh`:
```bash
#!/bin/bash
echo "Initializing Toxiproxy proxies..."
sleep 3

curl -X POST http://localhost:8474/proxies \
  -H 'Content-Type: application/json' \
  -d '{"name":"a_to_b","listen":"0.0.0.0:8666","upstream":"service-b:8080","enabled":true}'

curl -X POST http://localhost:8474/proxies \
  -H 'Content-Type: application/json' \
  -d '{"name":"b_to_c","listen":"0.0.0.0:8667","upstream":"service-c:8080","enabled":true}'

echo "✅ Proxies initialized!"
```
```bash
chmod +x scripts/init-toxiproxy.sh
docker compose up -d && ./scripts/init-toxiproxy.sh
```

### Missing Dataset or Low Row Count

If `build_dataset.py` produces too few rows:
```bash
# Generate more continuous traffic (longer duration)
for i in {1..1800}; do 
    curl -s http://localhost:8081/checkout >/dev/null
    sleep 1
done

# Rebuild with longer time window
python scripts/build_dataset.py --minutes 60 --out data/phase2/metrics_dataset.csv
```

### Model Performance Issues

If ROC AUC < 0.75:

1. **Check label distribution:** Should have both 0s and 1s
```bash
   tail -n +2 data/phase2/metrics_dataset.csv | grep -v nan | cut -d',' -f8 | sort | uniq -c
```

2. **Adjust threshold:** Lower threshold creates more label=1 examples
```bash
   python scripts/build_dataset.py --threshold_p95_ms 2000 --out data/phase2/metrics_dataset.csv
```

3. **Generate more failure scenarios:** Add more toxic variations

### Services Showing Unhealthy

If Service B or C are unhealthy:
```bash
# Check if proxies exist
curl http://localhost:8474/proxies

# If empty, recreate proxies (see Prerequisites)

# Restart services
docker compose restart service-a service-b service-c

# Test traffic flow
curl http://localhost:8081/checkout
```

### Prometheus Scraping AI Predictor

If running predictor in Docker, add to `observability/prometheus.yml`:

**For local predictor:**
```yaml
- job_name: 'ai-predictor'
  scrape_interval: 5s
  static_configs:
    - targets: ['host.docker.internal:8085']
```

**For Docker predictor:**
```yaml
- job_name: 'ai-predictor'
  scrape_interval: 5s
  static_configs:
    - targets: ['ai-predictor:8080']
```

Then restart:
```bash
docker compose restart prometheus
```

---

## Quick Reference

### File Structure
```
AI-Adaptive-Sandbox/
├── data/phase2/
│   └── metrics_dataset.csv          # Training data
├── models/
│   ├── failure_predictor.pkl        # Trained model
│   └── feature_columns.json         # Feature order
├── scripts/
│   ├── build_dataset.py             # Dataset generation
│   ├── train_model.py               # Model training
│   ├── predict_failure.py           # Prediction script
│   └── tests/test_model.py          # Test suite (15 tests)
└── services/ai-predictor/           # Live prediction service
    └── app.py
```

### Key Commands
```bash
# Full workflow
docker compose up -d && ./scripts/init-toxiproxy.sh  # Start services
# [Generate traffic - see Step 0]
python scripts/build_dataset.py --minutes 35 --out data/phase2/metrics_dataset.csv
python scripts/train_model.py --data data/phase2/metrics_dataset.csv --model-out models/failure_predictor.pkl --cols-out models/feature_columns.json
python scripts/predict_failure.py --model models/failure_predictor.pkl --cols models/feature_columns.json --row '{...}'
pytest scripts/tests/test_model.py -v
```

### Feature Descriptions
- `req_rate`: Requests per second
- `err_rate`: Errors per second  
- `p50_ms`: 50th percentile latency (milliseconds)
- `p95_ms`: 95th percentile latency (milliseconds)
- `toxic_active`: Binary flag (1=chaos active, 0=normal)

---

## Acceptance Criteria

- [x] `models/failure_predictor.pkl` and `models/feature_columns.json` exist
- [x] Model achieves ROC AUC ≥ 0.75 on validation set
- [x] `scripts/predict_failure.py` returns `risk_score` in [0, 1]
- [x] All tests pass: `pytest scripts/tests/test_model.py -q`
- [x] README has runnable quickstart instructions
