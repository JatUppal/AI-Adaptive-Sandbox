#!/bin/bash
set -e

echo "=========================================="
echo "AI Adaptive Sandbox - Reporting Pipeline"
echo "=========================================="
echo ""

# Configuration
BASELINE_FILE="data/baselines/normal_baseline.yaml"
FAILURE_FILE="data/baselines/failure_vs_normal.yaml"
REPORT_FILE="reports/summary_report.md"
ALERT_CONFIG="config/alert_thresholds.yaml"

# Step 1: Generate traffic (optional - can be run separately)
echo "📊 Step 1: Generating traffic..."
if [ "$SKIP_TRAFFIC" != "true" ]; then
    echo "Sending 50 requests to service-a..."
    for i in {1..50}; do
        curl -s http://localhost:8081/checkout > /dev/null || true
        sleep 0.1
    done
    echo "✅ Traffic generation complete"
else
    echo "⏭️  Skipping traffic generation (SKIP_TRAFFIC=true)"
fi
echo ""

# Step 2: Process captures and generate baseline (if capture file exists)
echo "📈 Step 2: Processing captures and generating baseline..."
if [ -f "data/captures/capture_001.ndjson" ]; then
    # Process OTLP format to add duration field
    python scripts/process_captures.py
    # Generate baseline from processed captures
    python scripts/make_baseline.py
    echo "✅ Baseline generated: $BASELINE_FILE"
else
    echo "⚠️  No capture file found. Skipping baseline generation."
    echo "   Run traffic first and ensure OpenTelemetry collector is capturing data."
fi
echo ""

# Step 3: Generate comparison report (if both files exist)
echo "📝 Step 3: Generating comparison report..."
if [ -f "$BASELINE_FILE" ]; then
    # If failure file doesn't exist, use baseline for both (self-comparison)
    if [ ! -f "$FAILURE_FILE" ]; then
        echo "⚠️  No failure baseline found. Using normal baseline for comparison."
        FAILURE_FILE="$BASELINE_FILE"
    fi
    
    python scripts/report_generator.py \
        --baseline "$BASELINE_FILE" \
        --compare "$FAILURE_FILE" \
        --output "$REPORT_FILE"
    
    echo "✅ Report generated: $REPORT_FILE"
    echo ""
    echo "Preview:"
    head -n 20 "$REPORT_FILE"
else
    echo "⚠️  Baseline file not found. Skipping report generation."
fi
echo ""

# Step 4: Check thresholds and send alerts
echo "🔔 Step 4: Checking thresholds and sending alerts..."
if [ -f "$BASELINE_FILE" ]; then
    python scripts/slack_notifier.py \
        --baseline "$BASELINE_FILE" \
        --config "$ALERT_CONFIG"
    
    ALERT_EXIT_CODE=$?
    if [ $ALERT_EXIT_CODE -eq 0 ]; then
        echo "✅ All metrics within thresholds"
    else
        echo "⚠️  Some metrics exceeded thresholds (exit code: $ALERT_EXIT_CODE)"
    fi
else
    echo "⚠️  Baseline file not found. Skipping alert check."
    ALERT_EXIT_CODE=0
fi
echo ""

# Summary
echo "=========================================="
echo "Pipeline Complete"
echo "=========================================="
echo ""
echo "📁 Generated files:"
[ -f "$BASELINE_FILE" ] && echo "  - $BASELINE_FILE"
[ -f "$REPORT_FILE" ] && echo "  - $REPORT_FILE"
echo ""
echo "🌐 View dashboards:"
echo "  - Grafana: http://localhost:3000"
echo "  - Prometheus: http://localhost:9090"
echo "  - Jaeger: http://localhost:16686"
echo ""

# Exit with alert status
exit $ALERT_EXIT_CODE
