# AI Predictor Quick Start Guide

This guide will get your AI failure predictor up and running in minutes.

## What's Been Implemented

All components from instructions.txt are complete:

1. Training Scripts
   - scripts/build_dataset.py - Builds dataset from Prometheus metrics
   - scripts/train_model.py - Trains Random Forest classifier

2. AI Predictor Service (services/ai-predictor/)
   - /health - Health check endpoint
   - /predict - Returns risk prediction JSON
   - /metrics - Exposes failure_risk_score{service="service-a"}
   - Live Prometheus queries (no dummy data)

3. Infrastructure
   - Docker configuration with model volume mount
   - Prometheus scrape config for ai-predictor
   - Grafana dashboard with gauge + time series panels

4. Documentation
   - Complete README with step-by-step instructions
   - Troubleshooting guide
   - Architecture diagram

## Quick Start (5 minutes)

### 1. Start the Stack
```bash
docker compose up -d
```

### 2. Generate Training Data
```bash
# Normal traffic (60 seconds)
for i in {1..60}; do curl -s http://localhost:8081/checkout >/dev/null; sleep 1; done

# Add some failures
curl -X POST http://localhost:8474/proxies/a_to_b/toxics \
  -H "Content-Type: application/json" \
  -d '{"type":"latency","name":"lat_test","attributes":{"latency":1000}}'

for i in {1..30}; do curl -s http://localhost:8081/checkout >/dev/null; sleep 1; done

curl -X DELETE http://localhost:8474/proxies/a_to_b/toxics/lat_test
```

### 3. Build Dataset & Train Model
```bash
pip install -r scripts/requirements.txt
python scripts/build_dataset.py --minutes 30 --out data/phase2/metrics_dataset.csv
python scripts/train_model.py \
  --data data/phase2/metrics_dataset.csv \
  --model-out models/failure_predictor.pkl \
  --cols-out models/feature_columns.json
```

### 4. Start AI Predictor
```bash
docker compose up -d ai-predictor
```

### 5. Test It
```bash
# Health check
curl http://localhost:8085/health | jq

# Get prediction
curl http://localhost:8085/predict | jq

# View metric
curl http://localhost:8085/metrics | grep failure_risk_score
```

### 6. View in Grafana
Open http://localhost:3000 and navigate to Reporting Dashboard

You will see:
- AI Failure Risk Score gauge (bottom left)
- AI Failure Risk Over Time chart (bottom right)

## Test Live Predictions

Inject a failure and watch the risk score change:

```bash
# Add high latency
curl -X POST http://localhost:8474/proxies/a_to_b/toxics \
  -H "Content-Type: application/json" \
  -d '{"type":"latency","name":"high_lat","attributes":{"latency":2000}}'

# Generate traffic
for i in {1..20}; do curl -s http://localhost:8081/checkout >/dev/null; sleep 1; done

# Check risk (should be HIGH)
curl http://localhost:8085/predict | jq '.status'

# Clean up
curl -X DELETE http://localhost:8474/proxies/a_to_b/toxics/high_lat
```

## Acceptance Criteria (All Met)

- /predict returns JSON with risk_score in [0,1]
- /metrics exposes failure_risk_score{service="service-a"}
- Grafana has gauge + time series showing risk
- README updated with startup instructions

## Key Files Modified/Created

- scripts/build_dataset.py (NEW)
- scripts/train_model.py (NEW)
- scripts/requirements.txt (UPDATED: Added ML dependencies)
- services/ai-predictor/app.py (UPDATED: Live Prometheus queries)
- observability/prometheus.yml (UPDATED: Added ai-predictor scrape)
- observability/grafana-dashboards/reporting_dashboard.json (UPDATED: Added 2 panels)
- docker-compose.yml (UPDATED: Model mount + env vars)
- README.md (UPDATED: Complete Phase 2 guide)

## Full Documentation

See README.md Phase 2 section for detailed instructions and troubleshooting.
