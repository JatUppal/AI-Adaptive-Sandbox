# RCA API - Root Cause Analysis API Gateway

**Task 1: API Gateway & Jaeger Integration**  
**Status:** ✅ Complete  
**Author:** Person A  
**Date:** 2025-12-08

---

## Overview

The RCA API is a FastAPI-based gateway that provides:
- **Failure prediction** using trained ML models
- **Jaeger trace analysis** for root cause identification
- **Report generation** from baseline comparisons
- **Integration** with existing Python scripts

---

## Architecture

```
┌─────────────────┐
│   Frontend      │
│ (localhost:5173)│
└────────┬────────┘
         │ HTTP/JSON
         ▼
┌─────────────────┐
│    RCA API      │
│ (localhost:8000)│
├─────────────────┤
│ • FastAPI       │
│ • CORS enabled  │
│ • 5 endpoints   │
└────┬───┬───┬────┘
     │   │   │
     │   │   └──────────────┐
     │   │                  │
     ▼   ▼                  ▼
┌─────────┐  ┌──────────┐  ┌──────────┐
│ Jaeger  │  │ Scripts  │  │ Models   │
│ :16686  │  │ /scripts │  │ /models  │
└─────────┘  └──────────┘  └──────────┘
```

---

## Files Created

```
api/
├── main.py              # FastAPI application (5 endpoints)
├── jaeger_client.py     # Jaeger trace fetcher
├── Dockerfile           # Container configuration
├── requirements.txt     # Python dependencies
└── README.md           # This file
```

---

## API Endpoints

### 1. Health Check
```bash
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "rca-api"
}
```

---

### 2. Predict Impact
```bash
POST /api/predict-impact
Content-Type: application/json

{
  "fault_type": "latency",
  "fault_target": "a_to_b",
  "fault_magnitude": 1000
}
```

**Response:**
```json
{
  "predicted_failure_probability": 0.85,
  "affected_services": [
    {
      "service_name": "service-a",
      "failure_probability": 0.765,
      "reason": "Direct upstream impact"
    },
    {
      "service_name": "service-b",
      "failure_probability": 0.595,
      "reason": "Downstream cascade"
    }
  ],
  "recommendation": "High failure risk. Consider reducing magnitude."
}
```

**How it works:**
1. Builds feature vector from fault parameters
2. Calls `scripts/predict_failure.py` via subprocess
3. Maps risk score to affected services
4. Returns prediction with recommendation

---

### 3. Analyze Failure
```bash
POST /api/analyze-failure
Content-Type: application/json

{
  "service": "service-a",
  "time_window_minutes": 5
}
```

**Response:**
```json
{
  "total_traces": 150,
  "failed_spans": 12,
  "service": "service-a",
  "time_window_minutes": 5,
  "message": "Root cause analyzer not yet implemented. Showing basic trace statistics.",
  "failed_span_details": [...]
}
```

**How it works:**
1. Fetches traces from Jaeger using `jaeger_client.py`
2. Filters failed spans (HTTP 4xx/5xx, OTLP errors)
3. Calls `scripts/root_cause_analyzer.py` (when Person B implements it)
4. Returns analysis results

---

### 4. Generate Report
```bash
POST /api/generate-report
Content-Type: application/json

{
  "test_id": "test_001"
}
```

**Response:**
```json
{
  "filename": "test_001_report.md"
}
```

**How it works:**
1. Calls `scripts/report_generator.py` via subprocess
2. Compares baseline YAML files
3. Generates Markdown report in `/reports`

---

### 5. List Reports
```bash
GET /api/reports
```

**Response:**
```json
[
  {
    "filename": "summary_report.md",
    "created_at": "2025-12-08T20:00:00",
    "size_mb": 0.05,
    "download_url": "http://localhost:8000/api/reports/summary_report.md"
  }
]
```

---

## Jaeger Client Functions

### `fetch_traces(service_name, minutes_ago)`
Fetches traces from Jaeger REST API.

**Parameters:**
- `service_name`: Service to query (e.g., "service-a")
- `minutes_ago`: Time window in minutes (default: 5)

**Returns:** List of trace objects

**Example:**
```python
from jaeger_client import fetch_traces

traces = fetch_traces("service-a", minutes_ago=10)
print(f"Found {len(traces)} traces")
```

---

### `is_error_span(span)`
Checks if a span represents an error.

**Checks:**
1. OTLP status code == 2 (ERROR)
2. HTTP status code >= 400 in tags

**Returns:** `True` if error, `False` otherwise

---

### `get_failed_spans(traces)`
Extracts all failed spans from traces.

**Returns:** List of error span objects

**Example:**
```python
from jaeger_client import fetch_traces, get_failed_spans

traces = fetch_traces("service-a", 5)
failed = get_failed_spans(traces)
print(f"Found {len(failed)} failed spans")
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JAEGER_URL` | `http://jaeger:16686` | Jaeger query service URL |
| `PROMETHEUS_URL` | `http://prometheus:9090` | Prometheus server URL |

---

## Docker Configuration

### Volumes Mounted
- `./models:/models:ro` - ML models (read-only)
- `./scripts:/scripts:ro` - Python scripts (read-only)
- `./data:/data` - Baseline data
- `./reports:/reports` - Generated reports

### Dependencies
- `jaeger` - Trace storage
- `prometheus` - Metrics storage
- `service-a`, `service-b`, `service-c` - Microservices

---

## Testing

### Start the Service
```bash
docker compose up -d rca-api
```

### Check Health
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"rca-api"}
```

### Test Prediction
```bash
curl -X POST http://localhost:8000/api/predict-impact \
  -H 'Content-Type: application/json' \
  -d '{"fault_type":"latency","fault_target":"a_to_b","fault_magnitude":1000}' \
  | jq .
```

### Test Jaeger Integration
```bash
curl -X POST http://localhost:8000/api/analyze-failure \
  -H 'Content-Type: application/json' \
  -d '{"service":"service-a","time_window_minutes":5}' \
  | jq .
```

### Test Reports
```bash
curl http://localhost:8000/api/reports | jq .
```

### View Logs
```bash
docker logs rca-api --tail 50
```

---

## Acceptance Criteria ✅

### Functional Tests
- ✅ `docker compose up -d` starts rca-api successfully
- ✅ `curl http://localhost:8000/health` returns `{"status": "ok"}`
- ✅ `/api/predict-impact` returns prediction with `predicted_failure_probability` between 0-1
- ✅ API can reach Jaeger at `http://jaeger:16686/api/traces`
- ✅ `fetch_traces()` returns non-empty list when service-a has traffic
- ✅ `is_error_span()` correctly identifies spans with HTTP 502 as errors
- ✅ CORS allows requests from `http://localhost:5173`

### Integration Tests
- ✅ Person B can import and call `get_failed_spans()` function
- ✅ Existing `scripts/predict_failure.py` runs successfully via subprocess
- ✅ Existing `scripts/report_generator.py` runs successfully via subprocess
- ✅ API can read from mounted `/models` volume
- ✅ API can write to mounted `/reports` volume

### Code Quality
- ✅ No hardcoded URLs (uses environment variables)
- ✅ Error handling with try/except on external calls
- ✅ Returns empty lists/dicts on errors (doesn't crash)
- ✅ Logs errors to stdout for debugging

---

## Dependencies

**Blocked by:** None  
**Blocks:** 
- Person B (needs `get_failed_spans()` output format)
- Person C (needs API endpoints)

**Uses:**
- `scripts/predict_failure.py` - ML prediction
- `scripts/report_generator.py` - Report generation
- `models/failure_predictor.pkl` - Trained model
- `models/feature_columns.json` - Feature schema

---

## Implementation Tips

1. **Test Jaeger client independently:**
   ```bash
   docker exec rca-api python jaeger_client.py
   ```

2. **Debug issues:**
   ```bash
   docker logs rca-api
   ```

3. **Subprocess paths:** All paths in subprocess calls are relative to `/app` in container

4. **Person B integration:** The `/api/analyze-failure` endpoint will automatically use `scripts/root_cause_analyzer.py` when Person B creates it

---

## Next Steps

1. **Person B:** Implement `scripts/root_cause_analyzer.py` with function:
   ```python
   def analyze_root_causes(failed_spans, total_traces):
       # Your analysis logic
       return {
           "root_causes": [...],
           "affected_services": [...],
           "recommendations": [...]
       }
   ```

2. **Person C:** Build frontend to consume these API endpoints

3. **Testing:** Add integration tests for all endpoints

---

## Troubleshooting

### API won't start
```bash
# Check logs
docker logs rca-api

# Rebuild
docker compose build rca-api
docker compose up -d rca-api
```

### Prediction fails
```bash
# Verify model files exist
docker exec rca-api ls -la /models/

# Test script directly
docker exec rca-api python ../scripts/predict_failure.py --help
```

### Jaeger connection fails
```bash
# Test connectivity
docker exec rca-api curl http://jaeger:16686/api/traces?limit=1
```

### CORS issues
```bash
# Verify CORS headers
curl -X OPTIONS http://localhost:8000/api/predict-impact \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" -v
```

---

**Status:** ✅ All acceptance criteria met  
**Ready for:** Person B and Person C integration
