# Phase 0.1.5 Demo Guide - Reporting & Monitoring

**Author:** Carlos Orozco  
**Date:** October 6, 2025  
**Status:** ✅ Complete & Tested

---

## 🎯 What Was Implemented

Phase 0.1.5 adds **automated monitoring, alerting, and reporting** on top of our existing OpenTelemetry stack. This connects observation (Phase 0.1) with replay/failure testing (Phase 0.2) by turning raw telemetry into actionable insights.

### Key Features Added:
1. ✅ **Prometheus Metrics** - All services now expose `/metrics` endpoints
2. ✅ **Grafana Dashboard** - Real-time visualization of performance metrics
3. ✅ **Report Generator** - Automated comparison reports (Markdown/HTML)
4. ✅ **Slack Alerting** - Threshold-based notifications with mock webhook
5. ✅ **End-to-End Pipeline** - One command to run the complete workflow

---

## 📊 Demo Walkthrough

### Prerequisites
```bash
# Ensure services are running
docker compose ps

# Install Python dependencies (if not already installed)
pip install -r scripts/requirements.txt
```

---

## 🚀 Demo Part 1: Prometheus Metrics

### Step 1.1: Check Service Metrics Endpoint
```bash
# View metrics from service-a
curl http://localhost:8081/metrics | grep -E "(request_count|error_count|request_latency)"
```

**Expected Output:**
```
# HELP request_count_total Total request count
# TYPE request_count_total counter
request_count_total{endpoint="/checkout",service="service-a"} 80.0
# HELP error_count_total Total error count
# TYPE error_count_total counter
# HELP request_latency_seconds Request latency
# TYPE request_latency_seconds histogram
```

### Step 1.2: View Prometheus Targets
```bash
# Open Prometheus UI
open http://localhost:9090/targets
```

**What to Show:**
- All 3 services (service-a, service-b, service-c) should be **UP** and green
- Each target shows last scrape time and status

### Step 1.3: Query Metrics in Prometheus
```bash
# Open Prometheus query interface
open http://localhost:9090/graph
```

**Try these queries:**
```promql
# Request rate per service
rate(request_count_total[5m])

# Error rate
rate(error_count_total[5m]) / rate(request_count_total[5m])

# p95 latency
histogram_quantile(0.95, sum(rate(request_latency_seconds_bucket[5m])) by (le, service))
```

---

## 📈 Demo Part 2: Grafana Dashboard

### Step 2.1: Open Grafana
```bash
open http://localhost:3000
```

**Navigation:**
1. Click **"Dashboards"** in the left sidebar
2. Select **"Reporting Dashboard"**

### Step 2.2: Dashboard Panels Overview

The dashboard includes **4 key panels**:

| Panel | Metric | What It Shows |
|-------|--------|---------------|
| **Request Rate by Service** | `rate(request_count_total[5m])` | Requests per second for each service/endpoint |
| **Error Rate** | `rate(error_count_total[5m]) / rate(request_count_total[5m])` | Percentage of failed requests |
| **Latency (p50 & p95)** | `histogram_quantile()` | Median and 95th percentile response times |
| **Current p95 Latency Gauge** | Real-time gauge | Live performance indicator |

### Step 2.3: Generate Traffic to See Live Updates
```bash
# Generate a few quick requests
curl -s http://localhost:8081/checkout && \
curl -s http://localhost:8081/checkout && \
curl -s http://localhost:8081/checkout && \
echo "Done - 3 requests sent"
```

**Watch the dashboard update in real-time** (5-second refresh interval)

---

## 📝 Demo Part 3: Automated Reports

### Step 3.1: Generate a Baseline
```bash
# Process captures and create baseline
python scripts/process_captures.py
python scripts/make_baseline.py
```

**Expected Output:**
```
Processing data/captures/capture_001.ndjson...
✅ Processed 1899 spans, updated data/captures/capture_001.ndjson
Wrote baseline: error_rate: 0.0
p50_ms: 1.13
p95_ms: 28.80
```

### Step 3.2: View the Baseline File
```bash
cat data/baselines/normal_baseline.yaml
```

**Expected Output:**
```yaml
error_rate: 0.0
p50_ms: 1.13
p95_ms: 28.8
```

### Step 3.3: Generate a Comparison Report
```bash
python scripts/report_generator.py \
  --baseline data/baselines/normal_baseline.yaml \
  --compare data/baselines/normal_baseline.yaml \
  --output reports/demo_report.md
```

### Step 3.4: View the Generated Report
```bash
cat reports/demo_report.md
```

**What to Show:**
- Summary table with p50, p95, error rate
- Percentage change calculations
- Visual indicators (⚠️ warnings, ✅ improvements, ℹ️ info)

---

## 🔔 Demo Part 4: Slack Alerting

### Step 4.1: View Alert Thresholds
```bash
cat config/alert_thresholds.yaml
```

**Current Thresholds:**
```yaml
latency_p95_ms: 500      # Alert if p95 > 500ms
error_rate_pct: 5        # Alert if error rate > 5%
latency_p50_ms: 200      # Alert if p50 > 200ms
slack_webhook_url: "http://localhost:5000/webhook"
```

### Step 4.2: Test Alerting (Dry Run)
```bash
python scripts/slack_notifier.py \
  --baseline data/baselines/normal_baseline.yaml \
  --dry-run
```

**Expected Output:**
```
✅ All metrics within acceptable thresholds

🔍 Dry-run mode: Slack notification skipped
```

### Step 4.3: Send Alert to Mock Slack
```bash
python scripts/slack_notifier.py \
  --baseline data/baselines/normal_baseline.yaml
```

**Expected Output:**
```
✅ All metrics within acceptable thresholds
Sending alert to Slack webhook: http://localhost:5000/webhook
Payload: {
  "text": "✅ All metrics within acceptable thresholds",
  "attachments": [...]
}
✅ Alert sent successfully
```

### Step 4.4: Verify Mock Slack Received Alert
```bash
# View mock-slack logs
docker logs mock-slack --tail 20
```

**What to Show:**
- HTTP POST request received
- JSON payload logged

---

## 🎬 Demo Part 5: Complete Pipeline

### Step 5.1: Run the Full Reporting Pipeline
```bash
./scripts/run_reporting_pipeline.sh
```

**What Happens:**
1. ✅ Generates 50 requests to service-a
2. ✅ Processes OTLP captures → adds duration field
3. ✅ Creates baseline from traces (p50, p95, error rate)
4. ✅ Generates comparison report
5. ✅ Checks thresholds and sends Slack alert
6. ✅ Exits with status code (0 = success, 1 = threshold breach)

**Expected Output:**
```
==========================================
AI Adaptive Sandbox - Reporting Pipeline
==========================================

📊 Step 1: Generating traffic...
Sending 50 requests to service-a...
✅ Traffic generation complete

📈 Step 2: Processing captures and generating baseline...
Processing data/captures/capture_001.ndjson...
✅ Processed 1899 spans, updated data/captures/capture_001.ndjson
Wrote baseline: error_rate: 0.0
p50_ms: 1.13
p95_ms: 28.80
✅ Baseline generated: data/baselines/normal_baseline.yaml

📝 Step 3: Generating comparison report...
✅ Report generated: reports/summary_report.md

🔔 Step 4: Checking thresholds and sending alerts...
✅ All metrics within acceptable thresholds
✅ Alert sent successfully

==========================================
Pipeline Complete
==========================================

📁 Generated files:
  - data/baselines/normal_baseline.yaml
  - reports/summary_report.md

🌐 View dashboards:
  - Grafana: http://localhost:3000
  - Prometheus: http://localhost:9090
  - Jaeger: http://localhost:16686
```

### Step 5.2: View Generated Files
```bash
# View baseline
cat data/baselines/normal_baseline.yaml

# View report
cat reports/summary_report.md

# List all generated files
ls -lh reports/
ls -lh data/baselines/
```

---

## 🧪 Demo Part 6: Validation Test Suite

### Step 6.1: Run Automated Tests
```bash
./scripts/test_phase_015.sh
```

**What It Tests:**
- ✅ All Docker containers running
- ✅ Service health endpoints responding
- ✅ Metrics endpoints working
- ✅ Prometheus scraping targets
- ✅ Mock Slack webhook responding
- ✅ Scripts executable and functional
- ✅ Configuration files present
- ✅ Report generator working
- ✅ Slack notifier working

**Expected Output:**
```
==========================================
Phase 0.1.5 - Integration Test Suite
==========================================

✓ All services are running
✓ Prometheus is running
✓ Grafana is running
✓ Mock-slack is running
✓ Service-a metrics endpoint is working
✓ Service-a health endpoint is working
✓ Prometheus is scraping service-a
✓ Generated test traffic successfully (10/10 requests)
✓ Metrics are being collected
✓ Mock Slack webhook is responding
✓ All scripts are executable
✓ All configuration files exist
✓ Grafana dashboard file exists
✓ Report generator script works
✓ Slack notifier script works

==========================================
Test Summary
==========================================
Passed: 15
Failed: 0

✓ All tests passed!

🎉 Phase 0.1.5 implementation is working correctly!
```

---

## 📋 Summary of Changes

### New Files Created (16)
```
config/
  └── alert_thresholds.yaml          # Alert configuration

observability/
  ├── prometheus.yml                  # Prometheus scrape config
  ├── grafana-datasources.yml         # Grafana datasource
  └── grafana-dashboards/
      ├── dashboards.yml              # Dashboard provisioning
      └── reporting_dashboard.json    # Reporting dashboard

scripts/
  ├── report_generator.py             # Report generation
  ├── slack_notifier.py               # Alert notifications
  ├── process_captures.py             # OTLP format processor
  ├── run_reporting_pipeline.sh       # End-to-end pipeline
  ├── test_phase_015.sh               # Validation tests
  └── requirements.txt                # Python dependencies

reports/                              # Generated reports directory
data/baselines/                       # Generated baselines directory

IMPLEMENTATION_SUMMARY.md             # Technical details
QUICK_START.md                        # Quick reference
CHECKLIST.md                          # Task tracking
DEMO_PHASE_015.md                     # This file
```

### Modified Files (9)
```
services/service-a/
  ├── app.py                          # Added Prometheus metrics
  └── requirements.txt                # Added prometheus-client

services/service-b/
  ├── app.py                          # Added Prometheus metrics
  └── requirements.txt                # Added prometheus-client

services/service-c/
  ├── app.py                          # Added Prometheus metrics
  └── requirements.txt                # Added prometheus-client

docker-compose.yml                    # Added Prometheus config, Grafana volumes, mock-slack
README.md                             # Added Phase 0.1.5 documentation
.gitignore                            # Exclude generated files
```

---

## 🎓 Key Technical Details

### Metrics Instrumentation
- **Library:** `prometheus-client==0.20.0`
- **Metrics Types:**
  - `request_count_total` (Counter) - Total requests per service/endpoint
  - `error_count_total` (Counter) - Total errors per service/endpoint
  - `request_latency_seconds` (Histogram) - Request latency distribution

### Data Flow
```
Services → Prometheus (scrape) → Grafana (visualize)
    ↓
OpenTelemetry → Collector → NDJSON captures
    ↓
process_captures.py (add duration field)
    ↓
make_baseline.py (calculate p50/p95/error_rate)
    ↓
report_generator.py (compare baselines)
    ↓
slack_notifier.py (check thresholds & alert)
```

### Why process_captures.py?
- OpenTelemetry collector exports OTLP format with `startTimeUnixNano` and `endTimeUnixNano`
- `make_baseline.py` expects a `duration` field directly on each span
- `process_captures.py` transforms OTLP → adds `duration = end - start`
- This keeps `make_baseline.py` unchanged while making it work with OTLP data

---

## 🎯 Demo Script (5-Minute Version)

```bash
# 1. Show services are running
docker compose ps

# 2. Show metrics endpoint
curl http://localhost:8081/metrics | grep request_count

# 3. Open Grafana dashboard
open http://localhost:3000

# 4. Generate traffic (watch dashboard update)
for i in {1..50}; do curl -s http://localhost:8081/checkout > /dev/null; echo -n "."; sleep 0.1; done

# 5. Run complete pipeline
./scripts/run_reporting_pipeline.sh

# 6. Show generated baseline
cat data/baselines/normal_baseline.yaml

# 7. Show generated report
cat reports/summary_report.md

# 8. Run validation tests
./scripts/test_phase_015.sh
```

---

## 🔗 Quick Links

| Resource | URL | Purpose |
|----------|-----|---------|
| **Grafana Dashboard** | http://localhost:3000 | Real-time metrics visualization |
| **Prometheus UI** | http://localhost:9090 | Metrics query interface |
| **Prometheus Targets** | http://localhost:9090/targets | Scrape target status |
| **Jaeger UI** | http://localhost:16686 | Distributed tracing |
| **Service A** | http://localhost:8081/checkout | Generate traffic |
| **Service A Metrics** | http://localhost:8081/metrics | Prometheus metrics |
| **Mock Slack** | http://localhost:5000 | Mock webhook endpoint |

---

## 💡 Tips for Demo

1. **Before Demo:**
   - Ensure all services are running: `docker compose ps`
   - Clear old data: `rm -f data/baselines/*.yaml reports/*.md`
   - Generate fresh traffic: `for i in {1..100}; do curl -s http://localhost:8081/checkout > /dev/null; done`

2. **During Demo:**
   - Keep Grafana dashboard open in browser
   - Show real-time updates as you generate traffic
   - Highlight the 4 dashboard panels and what they show
   - Run pipeline script and explain each step

3. **Key Points to Emphasize:**
   - ✅ Zero-config Prometheus metrics on all services
   - ✅ Auto-provisioned Grafana dashboard
   - ✅ Automated report generation with visual indicators
   - ✅ Threshold-based alerting with configurable limits
   - ✅ One-command end-to-end pipeline
   - ✅ Comprehensive test suite for validation

---

## 🚀 Next Steps

### For Your Team:
1. Review the implementation in this demo
2. Test the pipeline: `./scripts/run_reporting_pipeline.sh`
3. Customize alert thresholds in `config/alert_thresholds.yaml`
4. Add more dashboard panels as needed
5. Integrate with Phase 0.2 (replay & failure injection)

### For Production:
- Replace mock Slack with real webhook URL
- Add authentication to Grafana
- Configure Prometheus persistent storage
- Set up metric retention policies
- Add more granular business metrics

---

**🎉 Phase 0.1.5 is complete and ready for team review!**

*All features implemented, tested, and documented.*
