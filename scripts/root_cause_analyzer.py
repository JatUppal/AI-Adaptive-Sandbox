"""
Root Cause Analysis module for analyzing failed Jaeger spans.
Groups failures by pattern and ranks by confidence.
"""

import os
from typing import List, Dict, Optional
from datetime import datetime
from collections import defaultdict

# --- Conditional OpenAI import ---
try:
    import openai
    _HAS_OPENAI = True
except ImportError:
    _HAS_OPENAI = False


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
    if http_status is not None:
        try:
            http_status = int(http_status)
        except (ValueError, TypeError):
            http_status = None

    if http_status:
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
        error_type = classify_error(span)

        # Extract service name
        process = span.get("process", {})
        service_name = process.get("serviceName", "unknown")

        pattern_key = f"{service_name}:{error_type}"
        patterns[pattern_key].append(span)

    return dict(patterns)


def calculate_confidence(pattern_spans: List[Dict], total_failed: int) -> float:
    """
    Calculate confidence score for a failure pattern.
    """
    if total_failed == 0:
        return 0.0
    confidence = len(pattern_spans) / total_failed
    return round(confidence, 2)


def generate_evidence(pattern_spans: List[Dict], error_type: str, total_failed: int) -> str:
    """
    Generate human-readable evidence string for a failure pattern.
    """
    count = len(pattern_spans)

    if "timeout" in error_type:
        return f"{count} out of {total_failed} failed traces show timeout"
    elif error_type in ["bad_gateway", "service_unavailable", "gateway_timeout"]:
        status_code = {
            "bad_gateway": "502",
            "service_unavailable": "503",
            "gateway_timeout": "504",
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
    """
    root_causes = []

    for pattern_key, span_list in failure_groups.items():
        service, error_type = pattern_key.split(":", 1)
        confidence = calculate_confidence(span_list, total_failed)
        evidence = generate_evidence(span_list, error_type, total_failed)
        trace_ids = [
            span.get("traceID", "") for span in span_list if span.get("traceID")
        ]

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

        operation_name = first_span.get("operationName", "unknown")

        # Calculate average duration
        durations = [span.get("duration", 0) / 1000.0 for span in span_list]
        avg_duration_ms = sum(durations) / len(durations) if durations else 0.0

        root_cause = {
            "rank": 0,
            "service": service,
            "issue": error_type,
            "confidence": confidence,
            "evidence": evidence,
            "trace_ids": trace_ids[:10],
            "details": {
                "error_message": error_message,
                "affected_span": operation_name,
                "avg_duration_ms": round(avg_duration_ms, 1),
            },
        }

        root_causes.append(root_cause)

    # Sort by confidence (highest first)
    root_causes.sort(key=lambda x: x["confidence"], reverse=True)

    for i, cause in enumerate(root_causes, start=1):
        cause["rank"] = i

    return root_causes


# ---------------------------------------------------------------------------
# AI Summary — works with or without OpenAI
# ---------------------------------------------------------------------------

def _rule_based_summary(root_causes: List[Dict], error_rate: float) -> str:
    """
    Generate a useful natural-language summary without any LLM call.
    This is the default fallback and is always available.
    """
    if not root_causes:
        return "No failures detected — system is healthy."

    parts: List[str] = []
    parts.append(
        f"The system is experiencing a {error_rate:.1%} error rate."
    )

    top = root_causes[0]
    issue_pretty = top["issue"].replace("_", " ")
    parts.append(
        f"The primary root cause is {issue_pretty} on {top['service']} "
        f"({top['confidence']:.0%} confidence). {top['evidence']}."
    )

    if len(root_causes) > 1:
        secondary = root_causes[1]
        sec_issue = secondary["issue"].replace("_", " ")
        parts.append(
            f"A secondary issue is {sec_issue} on {secondary['service']} "
            f"({secondary['confidence']:.0%} confidence)."
        )

    # Actionable hint based on top issue
    issue = top["issue"]
    if "timeout" in issue:
        parts.append(
            "Recommendation: check downstream service health and consider "
            "increasing timeout thresholds or adding retries with back-off."
        )
    elif issue in ("bad_gateway", "service_unavailable"):
        parts.append(
            "Recommendation: verify the upstream service is running, check "
            "resource limits (CPU/memory), and review recent deployments."
        )
    elif "connection_refused" in issue:
        parts.append(
            "Recommendation: confirm the target service is running and that "
            "network policies allow the connection."
        )
    else:
        parts.append(
            "Recommendation: review application logs around the failure window "
            "and check for resource exhaustion or configuration drift."
        )

    return " ".join(parts)


def _openai_summary(root_causes: List[Dict], error_rate: float) -> Optional[str]:
    """
    Try to generate a richer summary via OpenAI.  Returns None on any failure
    so the caller can fall back to the rule-based version.
    """
    if not _HAS_OPENAI:
        return None

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    # Build context
    context = f"System experienced {error_rate:.1%} error rate.\n\nTop root causes:\n"
    for cause in root_causes[:3]:
        context += (
            f"- {cause['service']}: {cause['issue']} "
            f"({cause['confidence']:.0%} confidence)\n"
            f"  Evidence: {cause['evidence']}\n"
        )

    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior DevOps engineer analyzing production failures. "
                        "Provide actionable insights in 2-3 sentences."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Analyze this failure pattern and suggest fixes:\n{context}",
                },
            ],
            max_tokens=200,
            timeout=10,
        )
        return response.choices[0].message.content
    except Exception:
        return None


def generate_ai_summary(root_causes: List[Dict], error_rate: float) -> str:
    """
    Public entry point.  Tries OpenAI first; falls back to rule-based.
    """
    llm_summary = _openai_summary(root_causes, error_rate)
    if llm_summary:
        return llm_summary
    return _rule_based_summary(root_causes, error_rate)


def generate_recommendations(root_causes: List[Dict]) -> List[str]:
    """
    Generate actionable recommendations based on root causes.
    """
    recommendations = []

    for cause in root_causes[:3]:
        issue = cause["issue"]
        service = cause["service"]

        if "timeout" in issue:
            recommendations.append(
                f"⚡ Increase timeout threshold for {service} or optimize downstream dependencies"
            )
        elif "bad_gateway" in issue:
            recommendations.append(
                f"🔧 Check {service} health and restart if necessary. "
                "Verify upstream service availability."
            )
        elif "service_unavailable" in issue:
            recommendations.append(
                f"📈 Scale {service} horizontally or investigate resource exhaustion (CPU/memory)"
            )
        elif "connection_refused" in issue:
            recommendations.append(
                f"🔌 Verify {service} is running and network policies allow connections"
            )
        elif "internal_server_error" in issue:
            recommendations.append(
                f"🔍 Review application logs for {service} — look for unhandled exceptions or DB errors"
            )
        else:
            recommendations.append(
                f"📋 Investigate {service} logs around the failure window for {issue}"
            )

    return recommendations


# ---------------------------------------------------------------------------
# Main entry point — called by the API gateway
# ---------------------------------------------------------------------------

def analyze_root_causes(
    failed_spans: List[Dict],
    total_traces: int,
    project_config: Dict = None,
) -> Dict:
    """
    Main entry point for root cause analysis.

    Args:
        failed_spans: List of failed span dictionaries from Jaeger
        total_traces: Total number of traces (failed + successful)
        project_config: Optional project configuration for multi-tenant support

    Returns:
        Complete analysis dictionary with root causes, AI summary, and recommendations
    """
    if project_config:
        known_services = project_config.get("services", [])
        project_name = project_config.get("project_name", "default")
    else:
        known_services = ["service-a", "service-b", "service-c"]
        project_name = "default"

    test_id = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # --- No failures ---
    if not failed_spans:
        return {
            "test_id": test_id,
            "project_name": project_name,
            "analyzed_services": known_services,
            "status": "success",
            "error_rate": 0.0,
            "total_traces": total_traces,
            "failed_traces": 0,
            "root_causes": [],
            "ai_summary": "No failures detected — system is healthy.",
            "recommendations": [],
        }

    # 1. Group failures by pattern
    failure_groups = group_failures_by_pattern(failed_spans)

    # 2. Rank root causes
    root_causes = rank_root_causes(failure_groups, len(failed_spans))

    # 3. Error rate
    error_rate = len(failed_spans) / total_traces if total_traces > 0 else 0.0

    # 4. Status
    status = "failed" if error_rate > 0 else "success"

    # 5. AI summary (LLM or rule-based)
    ai_summary = generate_ai_summary(root_causes, error_rate)

    # 6. Recommendations
    recommendations = generate_recommendations(root_causes)

    return {
        "test_id": test_id,
        "project_name": project_name,
        "analyzed_services": known_services,
        "status": status,
        "error_rate": round(error_rate, 4),
        "total_traces": total_traces,
        "failed_traces": len(failed_spans),
        "root_causes": root_causes,
        "ai_summary": ai_summary,
        "recommendations": recommendations,
    }