"""
Quick test for root cause analyzer.
"""

from root_cause_analyzer import analyze_root_causes, classify_error
from pattern_matcher import find_similar_incidents, calculate_cosine_similarity, format_duration


def test_classify_error():
    """Test error classification."""
    print("Testing classify_error()...")
    
    # Test HTTP 502
    span_502 = {
        "tags": [{"key": "http.status_code", "value": 502}],
        "status": {"code": 2}
    }
    assert classify_error(span_502) == "bad_gateway", "HTTP 502 classification failed"
    print("  ✓ HTTP 502 correctly classified as bad_gateway")
    
    # Test timeout
    span_timeout = {
        "tags": [],
        "status": {"code": 2},
        "duration": 2000000  # 2000ms in microseconds
    }
    assert classify_error(span_timeout) == "connection_timeout", "Timeout classification failed"
    print("  ✓ Timeout correctly classified")
    
    print("✅ classify_error() tests passed!\n")


def test_cosine_similarity():
    """Test similarity calculation."""
    print("Testing calculate_cosine_similarity()...")
    
    vec1 = [0.18, 1.25, 1]
    vec2 = [0.20, 1.30, 1]
    similarity = calculate_cosine_similarity(vec1, vec2)
    
    assert 0.99 < similarity < 1.0, f"Expected high similarity, got {similarity}"
    print(f"  ✓ Similar vectors: {similarity:.4f}")
    
    # Test orthogonal vectors
    vec3 = [1, 0, 0]
    vec4 = [0, 1, 0]
    similarity2 = calculate_cosine_similarity(vec3, vec4)
    assert similarity2 == 0.0, f"Expected 0.0 for orthogonal vectors, got {similarity2}"
    print(f"  ✓ Orthogonal vectors: {similarity2:.4f}")
    
    print("✅ calculate_cosine_similarity() tests passed!\n")


def test_format_duration():
    """Test duration formatting."""
    print("Testing format_duration()...")
    
    assert format_duration(45) == "45min"
    print("  ✓ 45min formatted correctly")
    
    assert format_duration(134) == "2h 14min"
    print("  ✓ 2h 14min formatted correctly")
    
    assert format_duration(1500) == "1d 1h"
    print("  ✓ 1d 1h formatted correctly")
    
    print("✅ format_duration() tests passed!\n")


def test_analyze_root_causes():
    """Test full root cause analysis."""
    print("Testing analyze_root_causes()...")
    
    # Create mock failed spans
    failed_spans = [
        {
            "traceID": "trace001",
            "duration": 2500000,  # 2500ms
            "tags": [{"key": "http.status_code", "value": 502}],
            "status": {"code": 2},
            "process": {"serviceName": "service-a"},
            "operationName": "GET /checkout",
            "logs": [{"fields": [{"key": "error", "value": "Connection timeout"}]}]
        },
        {
            "traceID": "trace002",
            "duration": 2600000,
            "tags": [{"key": "http.status_code", "value": 502}],
            "status": {"code": 2},
            "process": {"serviceName": "service-a"},
            "operationName": "GET /checkout",
            "logs": []
        },
        {
            "traceID": "trace003",
            "duration": 1500000,
            "tags": [{"key": "http.status_code", "value": 503}],
            "status": {"code": 2},
            "process": {"serviceName": "service-b"},
            "operationName": "GET /charge",
            "logs": []
        }
    ]
    
    # Analyze
    result = analyze_root_causes(failed_spans, 100)
    
    # Verify structure
    assert "test_id" in result
    assert result["status"] == "failed"
    assert result["error_rate"] == 0.03  # 3/100
    assert result["total_traces"] == 100
    assert result["failed_traces"] == 3
    assert len(result["root_causes"]) == 2  # Two patterns
    
    print(f"  ✓ Analysis returned correct structure")
    print(f"  ✓ Error rate: {result['error_rate']}")
    print(f"  ✓ Found {len(result['root_causes'])} root causes")
    
    # Verify ranking
    top_cause = result["root_causes"][0]
    assert top_cause["rank"] == 1
    assert top_cause["confidence"] > 0.0
    print(f"  ✓ Top cause: {top_cause['service']}:{top_cause['issue']} (confidence: {top_cause['confidence']})")
    
    print("✅ analyze_root_causes() tests passed!\n")


def test_find_similar_incidents():
    """Test pattern matching."""
    print("Testing find_similar_incidents()...")
    
    current_metrics = {
        "error_rate": 0.18,
        "p95_latency": 1250,
        "failed_services_count": 1
    }
    
    similar = find_similar_incidents(current_metrics)
    
    print(f"  ✓ Found {len(similar)} similar incidents")
    
    if similar:
        top_match = similar[0]
        print(f"  ✓ Top match: {top_match['incident_id']} (similarity: {top_match['similarity']:.2f})")
        assert "incident_id" in top_match
        assert "similarity" in top_match
        assert "duration" in top_match
    
    print("✅ find_similar_incidents() tests passed!\n")


if __name__ == "__main__":
    print("=" * 60)
    print("Running Root Cause Analysis Tests")
    print("=" * 60 + "\n")
    
    test_classify_error()
    test_cosine_similarity()
    test_format_duration()
    test_analyze_root_causes()
    test_find_similar_incidents()
    
    print("=" * 60)
    print("🎉 ALL TESTS PASSED!")
    print("=" * 60)