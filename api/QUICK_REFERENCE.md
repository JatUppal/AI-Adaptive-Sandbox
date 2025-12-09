# RCA API - Quick Reference Card

## Service Info
- **URL:** http://localhost:8000
- **Container:** rca-api
- **Status:** ✅ Running

## Quick Commands

### Start/Stop
```bash
docker compose up -d rca-api      # Start
docker compose stop rca-api       # Stop
docker compose restart rca-api    # Restart
docker logs rca-api -f            # View logs
```

### Health Check
```bash
curl http://localhost:8000/health
```

### Run Tests
```bash
./api/test_api.sh
```

## API Endpoints

### 1. Health Check
```bash
curl http://localhost:8000/health
```

### 2. Predict Impact
```bash
curl -X POST http://localhost:8000/api/predict-impact \
  -H 'Content-Type: application/json' \
  -d '{
    "fault_type": "latency",
    "fault_target": "a_to_b",
    "fault_magnitude": 1000
  }' | jq .
```

### 3. Analyze Failure
```bash
curl -X POST http://localhost:8000/api/analyze-failure \
  -H 'Content-Type: application/json' \
  -d '{
    "service": "service-a",
    "time_window_minutes": 5
  }' | jq .
```

### 4. Generate Report
```bash
curl -X POST http://localhost:8000/api/generate-report \
  -H 'Content-Type: application/json' \
  -d '{
    "test_id": "test_001"
  }' | jq .
```

### 5. List Reports
```bash
curl http://localhost:8000/api/reports | jq .
```

## Debugging

### Check Jaeger connectivity
```bash
docker exec rca-api curl http://jaeger:16686/api/traces?limit=1
```

### Test prediction script
```bash
docker exec rca-api python ../scripts/predict_failure.py \
  --model ../models/failure_predictor.pkl \
  --cols ../models/feature_columns.json \
  --row '{"req_rate":0.5,"err_rate":0.0,"p50_ms":150,"p95_ms":600,"toxic_active":0}'
```

### Check mounted volumes
```bash
docker exec rca-api ls -la /models/
docker exec rca-api ls -la /scripts/
docker exec rca-api ls -la /reports/
```

### View environment variables
```bash
docker exec rca-api printenv | grep -E "(JAEGER|PROMETHEUS)"
```

## Test Jaeger Client

```bash
docker exec rca-api python -c "
from jaeger_client import fetch_traces, get_failed_spans
traces = fetch_traces('service-a', 10)
print(f'Fetched {len(traces)} traces')
failed = get_failed_spans(traces)
print(f'Found {len(failed)} failed spans')
"
```

## Common Issues

### Service won't start
```bash
docker compose build rca-api
docker compose up -d rca-api
docker logs rca-api
```

### Module not found
```bash
# Rebuild with updated requirements
docker compose build rca-api --no-cache
```

### Permission denied on volumes
```bash
# Check volume mounts in docker-compose.yml
docker exec rca-api ls -la /models /scripts /reports
```

## Files Structure

```
api/
├── main.py              # FastAPI app (5 endpoints)
├── jaeger_client.py     # Jaeger trace fetcher
├── Dockerfile           # Container config
├── requirements.txt     # Dependencies
├── README.md           # Full documentation
├── QUICK_REFERENCE.md  # This file
└── test_api.sh         # Test suite (17 tests)
```

## Integration

### For Person B
Create `scripts/root_cause_analyzer.py`:
```python
def analyze_root_causes(failed_spans, total_traces):
    return {
        "root_causes": [...],
        "affected_services": [...],
        "recommendations": [...]
    }
```

### For Person C
Frontend endpoints ready at `http://localhost:8000/api/*`
CORS enabled for `http://localhost:5173`

## Documentation
- Full docs: `api/README.md`
- Task summary: `TASK_1_COMPLETE.md`
- Run tests: `./api/test_api.sh`
