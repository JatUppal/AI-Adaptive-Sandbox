"""
Root Cause Analysis module for analyzing failed Jaeger spans.
Groups failures by pattern and ranks by confidence.
"""

from typing import List, Dict, Optional
from datetime import datetime
from collections import defaultdict
import openai


def classify_error(span: Dict) -> str:
    """
    Classify the type of error from a failed span.
    
    Args:
        span: Jaeger span dictionary with tags, status, logs
        
    Returns:
        Error type string (e.g., "connection_timeout", "bad_gateway")
    """
    # Extract HTTP status code from tags
    http_status = None
    tags = span.get("tags", [])
    for tag in tags:
        if tag.get("key") == "http.status_code":
            http_status = tag.get("value")
            break
    
    # Classify by HTTP status
    if http_status:
        http_status = int(http_status)
        if http_status == 502:
            return "bad_gateway"
        elif http_status == 503:
            return "service_unavailable"
        elif http_status == 504:
            return "gateway_timeout"
        elif http_status == 500:
            return "internal_server_error"
        elif http_status == 429:
            return "rate_limit_exceeded"
    
    # Check OTLP status code
    status = span.get("status", {})
    status_code = status.get("code")
    if status_code == 2 or status_code == "ERROR":
        # Check for timeout based on duration
        duration_us = span.get("duration", 0)
        duration_ms = duration_us / 1000.0
        
        if duration_ms > 1000:
            return "connection_timeout"
    
    # Check logs for connection refused
    logs = span.get("logs", [])
    for log in logs:
        fields = log.get("fields", [])
        for field in fields:
            value = str(field.get("value", "")).lower()
            if "connection refused" in value or "econnrefused" in value:
                return "connection_refused"
    
    return "unknown_error"

def group_failures_by_pattern(failed_spans: List[Dict]) -> Dict[str, List[Dict]]:
    """
    Group failed spans by service and error type pattern.
    
    Args:
        failed_spans: List of failed span dictionaries
        
    Returns:
        Dictionary mapping "service:error_type" to list of spans
    """
    patterns = defaultdict(list)
    
    for span in failed_spans:
        # Classify error type
        error_type = classify_error(span)
        
        # Extract service name
        process = span.get("process", {})
        service_name = process.get("serviceName", "unknown")
        
        # Create pattern key
        pattern_key = f"{service_name}:{error_type}"
        
        # Add span to this pattern
        patterns[pattern_key].append(span)
    
    return dict(patterns)

def calculate_confidence(pattern_spans: List[Dict], total_failed: int) -> float:
    """
    Calculate confidence score for a failure pattern.
    
    Args:
        pattern_spans: List of spans matching this pattern
        total_failed: Total number of failed spans
        
    Returns:
        Confidence score between 0.0 and 1.0
    """
    if total_failed == 0:
        return 0.0
    
    confidence = len(pattern_spans) / total_failed
    return round(confidence, 2)

def generate_evidence(pattern_spans: List[Dict], error_type: str, total_failed: int) -> str:
    """
    Generate human-readable evidence string for a failure pattern.
    
    Args:
        pattern_spans: List of spans matching this pattern
        error_type: The error classification
        total_failed: Total number of failed spans
        
    Returns:
        Evidence description string
    """
    count = len(pattern_spans)
    
    # Build evidence based on error type
    if "timeout" in error_type:
        return f"{count} out of {total_failed} failed traces show timeout"
    elif error_type in ["bad_gateway", "service_unavailable", "gateway_timeout"]:
        status_code = {
            "bad_gateway": "502",
            "service_unavailable": "503",
            "gateway_timeout": "504"
        }.get(error_type, "5xx")
        return f"{count} requests returned {status_code} status"
    elif "connection_refused" in error_type:
        return f"{count} requests failed to establish connection"
    elif "internal_server_error" in error_type:
        return f"{count} requests returned 500 internal server error"
    else:
        return f"{count} requests failed with {error_type}"
    
def rank_root_causes(failure_groups: Dict[str, List[Dict]], total_failed: int) -> List[Dict]:
    """
    Rank root causes by confidence score.
    
    Args:
        failure_groups: Dictionary from group_failures_by_pattern()
        total_failed: Total number of failed spans
        
    Returns:
        List of root cause dictionaries, sorted by confidence (highest first)
    """
    root_causes = []
    
    for pattern_key, span_list in failure_groups.items():
        # Split pattern key
        service, error_type = pattern_key.split(":", 1)
        
        # Calculate confidence
        confidence = calculate_confidence(span_list, total_failed)
        
        # Generate evidence
        evidence = generate_evidence(span_list, error_type, total_failed)
        
        # Extract trace IDs
        trace_ids = [span.get("traceID", "") for span in span_list if span.get("traceID")]
        
        # Get details from first span as example
        first_span = span_list[0]
        
        # Extract error message from logs
        error_message = "Error occurred"
        logs = first_span.get("logs", [])
        if logs:
            for log in logs:
                fields = log.get("fields", [])
                for field in fields:
                    if field.get("key") in ["error", "message", "error.message"]:
                        error_message = str(field.get("value", ""))
                        break
        
        # Extract operation name
        operation_name = first_span.get("operationName", "unknown")
        
        # Calculate average duration
        durations = [span.get("duration", 0) / 1000.0 for span in span_list]  # Convert to ms
        avg_duration_ms = sum(durations) / len(durations) if durations else 0.0
        
        # Build root cause object
        root_cause = {
            "rank": 0,  # Will be assigned after sorting
            "service": service,
            "issue": error_type,
            "confidence": confidence,
            "evidence": evidence,
            "trace_ids": trace_ids[:10],  # Limit to first 10 trace IDs
            "details": {
                "error_message": error_message,
                "affected_span": operation_name,
                "avg_duration_ms": round(avg_duration_ms, 1)
            }
        }
        
        root_causes.append(root_cause)
    
    # Sort by confidence (highest first)
    root_causes.sort(key=lambda x: x["confidence"], reverse=True)
    
    # Assign ranks
    for i, cause in enumerate(root_causes, start=1):
        cause["rank"] = i
    
    return root_causes

def analyze_root_causes(
    failed_spans: List[Dict], 
    total_traces: int, 
    project_config: Dict = None
) -> Dict:
    """
    Main entry point for root cause analysis.
    Enhanced with AI summary and recommendations.
    
    This is the function Person A's API will call.
    
    Args:
        failed_spans: List of failed span dictionaries from Jaeger
        total_traces: Total number of traces (failed + successful)
        project_config: Optional project configuration for multi-tenant support
        
    Returns:
        Complete analysis dictionary with root causes, AI summary, and recommendations
    """
    # Extract known services from config
    if project_config:
        known_services = project_config.get('services', [])
        project_name = project_config.get('project_name', 'default')
    else:
        known_services = ['service-a', 'service-b', 'service-c']
        project_name = 'default'

    # Generate test ID with timestamp
    test_id = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    # Handle case with no failures - EARLY RETURN
    if not failed_spans or len(failed_spans) == 0:
        return {
            "test_id": test_id,
            "project_name": project_name,
            "analyzed_services": known_services,
            "status": "success",
            "error_rate": 0.0,
            "total_traces": total_traces,
            "failed_traces": 0,
            "root_causes": [],
            "ai_summary": "No failures detected - system is healthy.",
            "recommendations": []
        }
    
    # STEP 1: Group failures by pattern
    failure_groups = group_failures_by_pattern(failed_spans)
    
    # STEP 2: Rank root causes - CREATE THIS FIRST!
    root_causes = rank_root_causes(failure_groups, len(failed_spans))
    
    # STEP 3: Calculate error rate
    error_rate = len(failed_spans) / total_traces if total_traces > 0 else 0.0
    
    # STEP 4: Determine status
    status = "failed" if error_rate > 0 else "success"
    
    # STEP 5: Generate AI summary - root_causes exists now!
    ai_summary = generate_ai_summary(root_causes, error_rate)
    
    # STEP 6: Generate recommendations - root_causes exists now!
    recommendations = generate_recommendations(root_causes)
    
    # STEP 7: Build final response
    analysis = {
        "test_id": test_id,
        "project_name": project_name,
        "analyzed_services": known_services,
        "status": status,
        "error_rate": round(error_rate, 4),
        "total_traces": total_traces,
        "failed_traces": len(failed_spans),
        "root_causes": root_causes,
        "ai_summary": ai_summary,
        "recommendations": recommendations
    }
    
    return analysis


def generate_ai_summary(root_causes: List[Dict], error_rate: float) -> str:
    """
    Generate natural language summary using OpenAI.
    
    Makes the analysis more actionable for developers.
    """
    # Build context for GPT
    context = f"""
    System experienced {error_rate:.1%} error rate.
    
    Top root causes:
    """
    
    for cause in root_causes[:3]:  # Top 3
        context += f"\n- {cause['service']}: {cause['issue']} ({cause['confidence']:.0%} confidence)"
        context += f"\n  Evidence: {cause['evidence']}"
    
    # Call OpenAI
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a senior DevOps engineer analyzing production failures. Provide actionable insights in 2-3 sentences."
                },
                {
                    "role": "user",
                    "content": f"Analyze this failure pattern and suggest fixes:\n{context}"
                }
            ],
            max_tokens=150
        )
        
        return response.choices[0].message.content
    except Exception as e:
        return f"Unable to generate AI summary: {str(e)}"



def generate_recommendations(root_causes: List[Dict]) -> List[str]:
    """
    Generate actionable recommendations based on root causes.
    """
    recommendations = []
    
    for cause in root_causes[:3]:
        issue = cause['issue']
        service = cause['service']
        
        if 'timeout' in issue:
            recommendations.append(
                f"⚡ Increase timeout threshold for {service} or optimize downstream dependencies"
            )
        elif 'bad_gateway' in issue:
            recommendations.append(
                f"🔧 Check {service} health and restart if necessary. Verify upstream service availability."
            )
        elif 'service_unavailable' in issue:
            recommendations.append(
                f"📈 Scale {service} horizontally or investigate resource exhaustion (CPU/memory)"
            )
        elif 'connection_refused' in issue:
            recommendations.append(
                f"🔌 Verify {service} is running and network policies allow connections"
            )
    
    return recommendations