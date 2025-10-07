#!/bin/bash
set -e

echo "=========================================="
echo "Phase 0.1.5 - Integration Test Suite"
echo "=========================================="
echo ""

FAILED_TESTS=0
PASSED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED_TESTS++))
}

function test_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED_TESTS++))
}

function test_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "Test 1: Checking if all services are running..."
if docker ps | grep -q "service-a" && docker ps | grep -q "service-b" && docker ps | grep -q "service-c"; then
    test_pass "All services are running"
else
    test_fail "Not all services are running"
fi
echo ""

echo "Test 2: Checking if Prometheus is running..."
if docker ps | grep -q "prometheus"; then
    test_pass "Prometheus is running"
else
    test_fail "Prometheus is not running"
fi
echo ""

echo "Test 3: Checking if Grafana is running..."
if docker ps | grep -q "grafana"; then
    test_pass "Grafana is running"
else
    test_fail "Grafana is not running"
fi
echo ""

echo "Test 4: Checking if mock-slack is running..."
if docker ps | grep -q "mock-slack"; then
    test_pass "Mock-slack is running"
else
    test_fail "Mock-slack is not running"
fi
echo ""

echo "Test 5: Testing service-a metrics endpoint..."
if curl -s http://localhost:8081/metrics | grep -q "request_count_total"; then
    test_pass "Service-a metrics endpoint is working"
else
    test_fail "Service-a metrics endpoint is not working"
fi
echo ""

echo "Test 6: Testing service-a health endpoint..."
if curl -s http://localhost:8081/health | grep -q "ok"; then
    test_pass "Service-a health endpoint is working"
else
    test_fail "Service-a health endpoint is not working"
fi
echo ""

echo "Test 7: Testing Prometheus targets..."
if curl -s http://localhost:9090/api/v1/targets 2>/dev/null | grep -q "service-a"; then
    test_pass "Prometheus is scraping service-a"
else
    test_warn "Prometheus may not be scraping service-a yet (may need time to start)"
fi
echo ""

echo "Test 8: Generating test traffic..."
TRAFFIC_SUCCESS=0
for i in {1..10}; do
    if curl -s http://localhost:8081/checkout > /dev/null 2>&1; then
        ((TRAFFIC_SUCCESS++))
    fi
    sleep 0.1
done

if [ $TRAFFIC_SUCCESS -ge 8 ]; then
    test_pass "Generated test traffic successfully ($TRAFFIC_SUCCESS/10 requests)"
else
    test_fail "Failed to generate sufficient traffic ($TRAFFIC_SUCCESS/10 requests)"
fi
echo ""

echo "Test 9: Checking if metrics are being collected..."
sleep 2
if curl -s http://localhost:8081/metrics | grep -q "request_count_total{.*} [1-9]"; then
    test_pass "Metrics are being collected"
else
    test_warn "Metrics may not be collected yet (may need more traffic)"
fi
echo ""

echo "Test 10: Testing mock Slack webhook..."
SLACK_RESPONSE=$(curl -s -X POST http://localhost:5000/webhook \
    -H "Content-Type: application/json" \
    -d '{"text": "Test alert"}' 2>/dev/null)

if [ -n "$SLACK_RESPONSE" ]; then
    test_pass "Mock Slack webhook is responding"
else
    test_fail "Mock Slack webhook is not responding"
fi
echo ""

echo "Test 11: Checking if Python scripts exist and are executable..."
if [ -x "scripts/report_generator.py" ] && [ -x "scripts/slack_notifier.py" ] && [ -x "scripts/run_reporting_pipeline.sh" ]; then
    test_pass "All scripts are executable"
else
    test_fail "Some scripts are not executable"
fi
echo ""

echo "Test 12: Checking if configuration files exist..."
if [ -f "config/alert_thresholds.yaml" ] && [ -f "observability/prometheus.yml" ] && [ -f "observability/grafana-datasources.yml" ]; then
    test_pass "All configuration files exist"
else
    test_fail "Some configuration files are missing"
fi
echo ""

echo "Test 13: Checking if Grafana dashboard exists..."
if [ -f "observability/grafana-dashboards/reporting_dashboard.json" ]; then
    test_pass "Grafana dashboard file exists"
else
    test_fail "Grafana dashboard file is missing"
fi
echo ""

echo "Test 14: Testing report generator (dry run)..."
# Create a dummy baseline for testing
mkdir -p data/baselines
cat > data/baselines/test_baseline.yaml << EOF
p50_ms: 10.5
p95_ms: 25.3
error_rate: 0.0
EOF

if python scripts/report_generator.py \
    --baseline data/baselines/test_baseline.yaml \
    --compare data/baselines/test_baseline.yaml \
    --output reports/test_report.md > /dev/null 2>&1; then
    test_pass "Report generator script works"
    rm -f reports/test_report.md data/baselines/test_baseline.yaml
else
    test_fail "Report generator script failed"
fi
echo ""

echo "Test 15: Testing Slack notifier (dry run)..."
if [ -f "data/baselines/test_baseline.yaml" ]; then
    cat > data/baselines/test_baseline.yaml << EOF
p50_ms: 10.5
p95_ms: 25.3
error_rate: 0.0
EOF
fi

if python scripts/slack_notifier.py \
    --baseline data/baselines/test_baseline.yaml \
    --dry-run > /dev/null 2>&1; then
    test_pass "Slack notifier script works"
    rm -f data/baselines/test_baseline.yaml
else
    test_fail "Slack notifier script failed"
fi
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed:${NC} $PASSED_TESTS"
echo -e "${RED}Failed:${NC} $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "🎉 Phase 0.1.5 implementation is working correctly!"
    echo ""
    echo "Next steps:"
    echo "  1. View Grafana dashboard: http://localhost:3000"
    echo "  2. View Prometheus targets: http://localhost:9090/targets"
    echo "  3. Run full pipeline: ./scripts/run_reporting_pipeline.sh"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Please check the failed tests above and troubleshoot."
    echo "See QUICK_START.md for troubleshooting tips."
    exit 1
fi
