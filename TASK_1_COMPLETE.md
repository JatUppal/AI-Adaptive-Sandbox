# Task 1: API Gateway & Jaeger Integration - COMPLETE ✅

**Assignee:** Person A  
**Epic:** Root Cause Analysis System  
**Priority:** High  
**Status:** ✅ **COMPLETE**  
**Completion Date:** 2025-12-08  
**Time Spent:** ~2 hours

---

## Summary

Successfully implemented a FastAPI gateway that:
- ✅ Wraps existing Python scripts (predict_failure.py, report_generator.py)
- ✅ Fetches and analyzes traces from Jaeger
- ✅ Provides 5 REST API endpoints
- ✅ Integrates with ML models and baseline reports
- ✅ Passes all 17 acceptance criteria tests

---

## Files Created

```
api/
├── main.py              # FastAPI app with 5 endpoints (283 lines)
├── jaeger_client.py     # Jaeger trace fetcher (113 lines)
├── Dockerfile           # Container configuration
├── requirements.txt     # Python dependencies (9 packages)
├── README.md           # Comprehensive documentation
└── test_api.sh         # Automated test suite (17 tests)
```

**Modified:**
- `docker-compose.yml` - Added rca-api service configuration

---

## API Endpoints Implemented

### 1. Health Check
- **Endpoint:** `GET /health`
- **Purpose:** Service health monitoring
- **Status:** ✅ Working

### 2. Predict Impact
- **Endpoint:** `POST /api/predict-impact`
- **Purpose:** ML-based failure prediction
- **Integration:** Calls `scripts/predict_failure.py`
- **Status:** ✅ Working

### 3. Analyze Failure
- **Endpoint:** `POST /api/analyze-failure`
- **Purpose:** Root cause analysis from Jaeger traces
- **Integration:** Ready for Person B's `root_cause_analyzer.py`
- **Status:** ✅ Working (with fallback)

### 4. Generate Report
- **Endpoint:** `POST /api/generate-report`
- **Purpose:** Create comparison reports
- **Integration:** Calls `scripts/report_generator.py`
- **Status:** ✅ Working

### 5. List Reports
- **Endpoint:** `GET /api/reports`
- **Purpose:** List all generated reports
- **Status:** ✅ Working

---

## Jaeger Client Functions

### `fetch_traces(service_name, minutes_ago)`
- Fetches traces from Jaeger REST API
- Handles timeouts and connection errors
- Returns empty list on failure (no crashes)

### `is_error_span(span)`
- Detects OTLP status code == 2 (ERROR)
- Detects HTTP status codes >= 400
- Handles both numeric and string status codes

### `get_failed_spans(traces)`
- Extracts all error spans from traces
- Filters using `is_error_span()`
- Returns list of failed span objects

---

## Test Results

**All 17 tests PASSED ✅**

### Functional Tests (9/9)
- ✅ Docker service running
- ✅ Health endpoint returns ok
- ✅ Predict impact returns probability
- ✅ Probability value is valid (0-1)
- ✅ API can reach Jaeger
- ✅ fetch_traces() returns data
- ✅ CORS allows localhost:5173
- ✅ Analyze failure endpoint works
- ✅ List reports endpoint works

### Integration Tests (5/5)
- ✅ Model files accessible
- ✅ Scripts accessible
- ✅ Reports directory writable
- ✅ is_error_span() detects HTTP 502
- ✅ JAEGER_URL environment variable set

### Code Quality Tests (3/3)
- ✅ Uses environment variables
- ✅ Error handling with try/except
- ✅ API logs to stdout

---

## Quick Start

### Start the Service
```bash
docker compose up -d rca-api
```

### Verify Health
```bash
curl http://localhost:8000/health
# {"status":"ok","service":"rca-api"}
```

### Test Prediction
```bash
curl -X POST http://localhost:8000/api/predict-impact \
  -H 'Content-Type: application/json' \
  -d '{"fault_type":"latency","fault_target":"a_to_b","fault_magnitude":1000}' \
  | jq .
```

### Run Full Test Suite
```bash
./api/test_api.sh
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Frontend (Person C)                   │
│                   http://localhost:5173                   │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP/JSON + CORS
                         ▼
┌──────────────────────────────────────────────────────────┐
│                      RCA API Gateway                      │
│                   http://localhost:8000                   │
├──────────────────────────────────────────────────────────┤
│  • FastAPI (5 endpoints)                                  │
│  • CORS enabled for localhost:5173                        │
│  • Error handling & logging                               │
└───┬────────┬────────┬────────┬────────────────────────────┘
    │        │        │        │
    ▼        ▼        ▼        ▼
┌────────┐ ┌──────┐ ┌──────┐ ┌────────────────────┐
│ Jaeger │ │Models│ │Scripts│ │ Person B's Analyzer│
│ :16686 │ │ .pkl │ │  .py  │ │ (root_cause_...)   │
└────────┘ └──────┘ └──────┘ └────────────────────┘
```

---

## Environment Configuration

### Environment Variables
- `JAEGER_URL=http://jaeger:16686` - Jaeger query service
- `PROMETHEUS_URL=http://prometheus:9090` - Prometheus server

### Docker Volumes
- `./models:/models:ro` - ML models (read-only)
- `./scripts:/scripts:ro` - Python scripts (read-only)
- `./data:/data` - Baseline data (read-write)
- `./reports:/reports` - Generated reports (read-write)

### Dependencies
- jaeger (trace storage)
- prometheus (metrics storage)
- service-a, service-b, service-c (microservices)

---

## Integration Points

### For Person B (Root Cause Analyzer)
Create `scripts/root_cause_analyzer.py` with:

```python
def analyze_root_causes(failed_spans, total_traces):
    """
    Analyze failed spans to identify root causes.
    
    Args:
        failed_spans: List of error span objects from Jaeger
        total_traces: Total number of traces analyzed
    
    Returns:
        {
            "root_causes": [...],
            "affected_services": [...],
            "recommendations": [...]
        }
    """
    # Your implementation here
    pass
```

The API will automatically use this function when available.

### For Person C (Frontend)
Consume these endpoints:
- `GET /health` - Service status
- `POST /api/predict-impact` - Failure prediction
- `POST /api/analyze-failure` - Root cause analysis
- `POST /api/generate-report` - Report generation
- `GET /api/reports` - List reports

CORS is already configured for `http://localhost:5173`.

---

## Acceptance Criteria Status

### Functional Tests ✅
- ✅ `docker compose up -d` starts rca-api successfully
- ✅ `curl http://localhost:8000/health` returns `{"status": "ok"}`
- ✅ `/api/predict-impact` returns prediction with `predicted_failure_probability` between 0-1
- ✅ API can reach Jaeger at `http://jaeger:16686/api/traces`
- ✅ `fetch_traces()` returns non-empty list when service-a has traffic
- ✅ `is_error_span()` correctly identifies spans with HTTP 502 as errors
- ✅ CORS allows requests from `http://localhost:5173`

### Integration Tests ✅
- ✅ Person B can import and call `get_failed_spans()` function
- ✅ Existing `scripts/predict_failure.py` runs successfully via subprocess
- ✅ Existing `scripts/report_generator.py` runs successfully via subprocess
- ✅ API can read from mounted `/models` volume
- ✅ API can write to mounted `/reports` volume

### Code Quality ✅
- ✅ No hardcoded URLs (uses environment variables)
- ✅ Error handling with try/except on external calls
- ✅ Returns empty lists/dicts on errors (doesn't crash)
- ✅ Logs errors to stdout for debugging

---

## Example API Responses

### Predict Impact
```json
{
  "predicted_failure_probability": 0.001,
  "affected_services": [
    {
      "service_name": "service-a",
      "failure_probability": 0.001,
      "reason": "Direct upstream impact"
    },
    {
      "service_name": "service-b",
      "failure_probability": 0.001,
      "reason": "Downstream cascade"
    }
  ],
  "recommendation": "Low risk. Safe to proceed."
}
```

### Analyze Failure
```json
{
  "total_traces": 20,
  "failed_spans": 0,
  "service": "service-a",
  "time_window_minutes": 5,
  "message": "Root cause analyzer not yet implemented. Showing basic trace statistics.",
  "failed_span_details": []
}
```

### List Reports
```json
[
  {
    "filename": "summary_report.md",
    "created_at": "2025-10-07T19:21:31.407456",
    "size_mb": 0.0,
    "download_url": "http://localhost:8000/api/reports/summary_report.md"
  }
]
```

---

## Troubleshooting

### Service won't start
```bash
docker logs rca-api
docker compose build rca-api
docker compose up -d rca-api
```

### Prediction fails
```bash
# Verify model exists
docker exec rca-api ls -la /models/

# Test script directly
docker exec rca-api python ../scripts/predict_failure.py \
  --model ../models/failure_predictor.pkl \
  --cols ../models/feature_columns.json \
  --row '{"req_rate":0.5,"err_rate":0.0,"p50_ms":150,"p95_ms":600,"toxic_active":0}'
```

### Jaeger connection fails
```bash
docker exec rca-api curl http://jaeger:16686/api/traces?limit=1
```

---

## Documentation

- **README.md** - Comprehensive API documentation
- **test_api.sh** - Automated test suite with 17 tests
- **TASK_1_COMPLETE.md** - This summary document

---

## Next Steps

1. **Person B:** Implement `scripts/root_cause_analyzer.py`
   - Function signature provided above
   - Will be automatically called by `/api/analyze-failure`

2. **Person C:** Build frontend to consume API
   - All endpoints ready
   - CORS configured
   - Example responses documented

3. **Team:** Integration testing
   - Run `./api/test_api.sh` after changes
   - Monitor logs: `docker logs rca-api -f`

---

## Metrics

- **Lines of Code:** ~400 (main.py: 283, jaeger_client.py: 113)
- **Test Coverage:** 17 automated tests
- **Dependencies:** 9 Python packages
- **Endpoints:** 5 REST APIs
- **Docker Services:** 1 (rca-api)
- **Time to Complete:** ~2 hours

---

**Status:** ✅ **READY FOR INTEGRATION**

All acceptance criteria met. Ready for Person B and Person C to build on this foundation.
