"""
Test AI summary generation - see the magic!
"""

from root_cause_analyzer import analyze_root_causes
import json


def test_ai_summary_display():
    """Test that shows the actual AI summary output."""
    print("=" * 70)
    print("🤖 TESTING AI-POWERED SUMMARY")
    print("=" * 70 + "\n")
    
    # Create realistic failed spans
    failed_spans = [
        {
            "traceID": "trace001",
            "duration": 2500000,  # 2500ms
            "tags": [{"key": "http.status_code", "value": 502}],
            "status": {"code": 2},
            "process": {"serviceName": "service-a"},
            "operationName": "GET /checkout",
            "logs": [{"fields": [{"key": "error", "value": "Upstream service unavailable"}]}]
        },
        {
            "traceID": "trace002",
            "duration": 2600000,
            "tags": [{"key": "http.status_code", "value": 502}],
            "status": {"code": 2},
            "process": {"serviceName": "service-a"},
            "operationName": "GET /checkout",
            "logs": [{"fields": [{"key": "error", "value": "Bad gateway error"}]}]
        },
        {
            "traceID": "trace003",
            "duration": 2400000,
            "tags": [{"key": "http.status_code", "value": 502}],
            "status": {"code": 2},
            "process": {"serviceName": "service-a"},
            "operationName": "POST /payment",
            "logs": []
        },
        {
            "traceID": "trace004",
            "duration": 1500000,
            "tags": [{"key": "http.status_code", "value": 503}],
            "status": {"code": 2},
            "process": {"serviceName": "service-b"},
            "operationName": "GET /inventory",
            "logs": [{"fields": [{"key": "error", "value": "Service temporarily unavailable"}]}]
        },
        {
            "traceID": "trace005",
            "duration": 3200000,  # 3200ms - timeout!
            "tags": [],
            "status": {"code": 2},
            "process": {"serviceName": "service-c"},
            "operationName": "GET /database",
            "logs": [{"fields": [{"key": "error", "value": "Connection timeout after 3000ms"}]}]
        }
    ]
    
    # Analyze with your RCA engine
    print("📊 Analyzing 5 failed requests out of 50 total...\n")
    result = analyze_root_causes(failed_spans, total_traces=50)
    
    # Display the complete analysis
    print("=" * 70)
    print("📋 ANALYSIS RESULTS")
    print("=" * 70)
    print(f"Test ID: {result['test_id']}")
    print(f"Status: {result['status']}")
    print(f"Error Rate: {result['error_rate']:.1%} ({result['failed_traces']}/{result['total_traces']} requests)")
    print()
    
    # Show root causes
    print("🔍 ROOT CAUSES (Ranked by Confidence):")
    print("-" * 70)
    for cause in result['root_causes']:
        print(f"\n#{cause['rank']} - {cause['service']} ({cause['confidence']:.0%} confidence)")
        print(f"   Issue: {cause['issue'].replace('_', ' ').title()}")
        print(f"   Evidence: {cause['evidence']}")
        print(f"   Affected: {cause['details']['affected_span']}")
        print(f"   Avg Duration: {cause['details']['avg_duration_ms']}ms")
    
    print()
    print("=" * 70)
    print("🤖 AI-POWERED SUMMARY (Natural Language)")
    print("=" * 70)
    print(f"\n{result['ai_summary']}\n")
    
    print("=" * 70)
    print("💡 ACTIONABLE RECOMMENDATIONS")
    print("=" * 70)
    for i, rec in enumerate(result['recommendations'], 1):
        print(f"{i}. {rec}")
    
    print()
    print("=" * 70)
    print("✅ COMPLETE JSON RESPONSE (What Person A's API returns):")
    print("=" * 70)
    print(json.dumps(result, indent=2))
    print()


if __name__ == "__main__":
    test_ai_summary_display()