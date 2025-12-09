#!/bin/bash
# Test script for RCA API - Task 1 Acceptance Criteria
# Author: Person A
# Date: 2025-12-08

set -e

echo "=========================================="
echo "RCA API - Acceptance Criteria Tests"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local test_name="$1"
    local command="$2"
    local expected="$3"
    
    echo -n "Testing: $test_name... "
    
    if output=$(eval "$command" 2>&1); then
        if [[ -z "$expected" ]] || echo "$output" | grep -q "$expected"; then
            echo -e "${GREEN}✓ PASSED${NC}"
            ((PASSED++))
            return 0
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo "  Expected: $expected"
            echo "  Got: $output"
            ((FAILED++))
            return 1
        fi
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Command failed: $command"
        echo "  Error: $output"
        ((FAILED++))
        return 1
    fi
}

echo "=== Functional Tests ==="
echo ""

# Test 1: Docker service running
test_endpoint \
    "Docker service is running" \
    "docker compose ps rca-api | grep -q 'running'" \
    ""

# Test 2: Health endpoint
test_endpoint \
    "Health endpoint returns ok" \
    "curl -s http://localhost:8000/health" \
    '"status":"ok"'

# Test 3: Predict impact endpoint
test_endpoint \
    "Predict impact returns probability" \
    "curl -s -X POST http://localhost:8000/api/predict-impact -H 'Content-Type: application/json' -d '{\"fault_type\":\"latency\",\"fault_target\":\"a_to_b\",\"fault_magnitude\":1000}'" \
    '"predicted_failure_probability"'

# Test 4: Probability is between 0 and 1
test_endpoint \
    "Probability value is valid (0-1)" \
    "curl -s -X POST http://localhost:8000/api/predict-impact -H 'Content-Type: application/json' -d '{\"fault_type\":\"latency\",\"fault_target\":\"a_to_b\",\"fault_magnitude\":1000}' | jq -e '.predicted_failure_probability >= 0 and .predicted_failure_probability <= 1'" \
    ""

# Test 5: Jaeger connectivity from container
test_endpoint \
    "API can reach Jaeger" \
    "docker exec rca-api python -c \"import requests; r = requests.get('http://jaeger:16686/api/traces?service=service-a&limit=1'); exit(0 if r.status_code == 200 else 1)\"" \
    ""

# Test 6: Fetch traces function
test_endpoint \
    "fetch_traces() returns data" \
    "docker exec rca-api python -c \"from jaeger_client import fetch_traces; traces = fetch_traces('service-a', 10); print(f'traces:{len(traces)}')\"" \
    "traces:"

# Test 7: CORS headers
test_endpoint \
    "CORS allows localhost:5173" \
    "curl -s -X OPTIONS http://localhost:8000/api/predict-impact -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' -v 2>&1" \
    "access-control-allow-origin: http://localhost:5173"

# Test 8: Analyze failure endpoint
test_endpoint \
    "Analyze failure endpoint works" \
    "curl -s -X POST http://localhost:8000/api/analyze-failure -H 'Content-Type: application/json' -d '{\"service\":\"service-a\",\"time_window_minutes\":5}'" \
    '"total_traces"'

# Test 9: List reports endpoint
test_endpoint \
    "List reports endpoint works" \
    "curl -s http://localhost:8000/api/reports | jq -e 'type == \"array\"'" \
    ""

echo ""
echo "=== Integration Tests ==="
echo ""

# Test 10: Model volume mounted
test_endpoint \
    "Model files accessible" \
    "docker exec rca-api ls /models/failure_predictor.pkl" \
    "failure_predictor.pkl"

# Test 11: Scripts volume mounted
test_endpoint \
    "Scripts accessible" \
    "docker exec rca-api ls /scripts/predict_failure.py" \
    "predict_failure.py"

# Test 12: Reports volume writable
test_endpoint \
    "Reports directory writable" \
    "docker exec rca-api touch /reports/test_write.tmp && docker exec rca-api rm /reports/test_write.tmp" \
    ""

# Test 13: Error span detection
test_endpoint \
    "is_error_span() detects HTTP 502" \
    "docker exec rca-api python -c \"from jaeger_client import is_error_span; span = {'tags': [{'key': 'http.status_code', 'value': 502}]}; print('error' if is_error_span(span) else 'ok')\"" \
    "error"

# Test 14: Environment variables set
test_endpoint \
    "JAEGER_URL environment variable set" \
    "docker exec rca-api printenv JAEGER_URL" \
    "jaeger:16686"

echo ""
echo "=== Code Quality Tests ==="
echo ""

# Test 15: No hardcoded URLs in main.py
test_endpoint \
    "Uses environment variables" \
    "grep -q 'JAEGER_URL' api/jaeger_client.py" \
    ""

# Test 16: Error handling present
test_endpoint \
    "Error handling with try/except" \
    "grep -q 'try:' api/main.py && grep -q 'except' api/main.py" \
    ""

# Test 17: Logs to stdout
test_endpoint \
    "API logs to stdout" \
    "docker logs rca-api 2>&1 | grep -q 'Uvicorn running'" \
    ""

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo -e "${GREEN}Failed: $FAILED${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "🎉 Task 1 (API Gateway & Jaeger Integration) is complete!"
    echo ""
    echo "Next steps:"
    echo "  - Person B: Implement scripts/root_cause_analyzer.py"
    echo "  - Person C: Build frontend to consume API endpoints"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Check the output above for details."
    exit 1
fi
