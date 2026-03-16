"""
Test that Person A can import and use our functions correctly.
"""

import sys
sys.path.append('.')

# This is how Person A will import
from root_cause_analyzer import analyze_root_causes
from pattern_matcher import find_similar_incidents

print("✅ Person A can import analyze_root_causes()")
print("✅ Person A can import find_similar_incidents()")

# Test the function signatures match what Person A expects
print("\nTesting function signatures...")

# Test analyze_root_causes
result = analyze_root_causes([], 100)
assert "test_id" in result
assert "status" in result
assert "root_causes" in result
print("✅ analyze_root_causes() returns correct format")

# Test find_similar_incidents
similar = find_similar_incidents({
    "error_rate": 0.18,
    "p95_latency": 1250,
    "failed_services_count": 1
})
assert isinstance(similar, list)
print("✅ find_similar_incidents() returns correct format")

print("\n🎉 Integration tests passed! Person A can use your functions.")