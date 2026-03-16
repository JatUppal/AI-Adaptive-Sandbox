#!/usr/bin/env python3
"""
Jaeger Client - Fetches traces from Jaeger's REST API and filters error spans.

Jaeger's trace format:
  {
    "traceID": "...",
    "spans": [ { "spanID": "...", "processID": "p1", ... } ],
    "processes": { "p1": { "serviceName": "service-a", ... } }
  }

Each span references a process by ID. This module resolves that reference
so downstream consumers (like root_cause_analyzer) get a "process" dict
with "serviceName" directly on each span.
"""

import os
import time
import requests
from typing import List, Dict, Any


JAEGER_URL = os.getenv("JAEGER_URL", "http://jaeger:16686")


def fetch_traces(service_name: str, minutes_ago: int = 5) -> List[Dict[str, Any]]:
    """
    Fetch traces from Jaeger for a specific service within a time window.

    Args:
        service_name: Name of the service to fetch traces for
        minutes_ago: How many minutes back to fetch traces (default: 5)

    Returns:
        List of trace objects from Jaeger
    """
    try:
        end_time = int(time.time() * 1_000_000)
        start_time = end_time - (minutes_ago * 60 * 1_000_000)

        url = f"{JAEGER_URL}/api/traces"
        params = {
            "service": service_name,
            "start": start_time,
            "end": end_time,
            "limit": 100,
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()
        return data.get("data", [])

    except requests.exceptions.RequestException as e:
        print(f"Error fetching traces from Jaeger: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error in fetch_traces: {e}")
        return []


def _resolve_process(span: Dict[str, Any], processes: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolve the processID reference on a span and embed the full process
    dict so downstream code can do span["process"]["serviceName"].

    If the span already has a "process" dict (non-Jaeger source), leave it alone.
    """
    if "process" in span and isinstance(span.get("process"), dict):
        return span  # already resolved

    process_id = span.get("processID")
    if process_id and processes:
        process_data = processes.get(process_id, {})
        span["process"] = process_data
    else:
        span["process"] = {"serviceName": "unknown"}

    return span


def is_error_span(span: Dict[str, Any]) -> bool:
    """
    Check if a span represents an error.

    Checks both:
    - OTLP status code (2 = ERROR)
    - HTTP status code >= 400 in tags
    """
    # Check OTLP status code
    status = span.get("status", {})
    status_code = status.get("code")
    if status_code == 2 or status_code == "ERROR":
        return True

    # Check HTTP status code in tags
    tags = span.get("tags", [])
    for tag in tags:
        if tag.get("key") == "http.status_code":
            val = tag.get("value")
            if isinstance(val, (int, float)) and val >= 400:
                return True
            if isinstance(val, str):
                try:
                    if int(val) >= 400:
                        return True
                except (ValueError, TypeError):
                    pass

    return False


def get_failed_spans(traces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extract all failed spans from a list of traces.

    Resolves the Jaeger processID -> process mapping so each returned span
    has span["process"]["serviceName"] set correctly.

    Returns:
        List of span objects that represent errors, with process resolved.
    """
    failed_spans = []

    try:
        for trace in traces:
            spans = trace.get("spans", [])
            processes = trace.get("processes", {})

            for span in spans:
                if is_error_span(span):
                    resolved = _resolve_process(span, processes)
                    failed_spans.append(resolved)

    except Exception as e:
        print(f"Error processing traces: {e}")
        return []

    return failed_spans


if __name__ == "__main__":
    print(f"Testing Jaeger client with URL: {JAEGER_URL}")
    traces = fetch_traces("service-a", minutes_ago=10)
    print(f"Fetched {len(traces)} traces")

    failed = get_failed_spans(traces)
    print(f"Found {len(failed)} failed spans")

    for span in failed[:3]:
        svc = span.get("process", {}).get("serviceName", "?")
        op = span.get("operationName", "?")
        print(f"  {svc} -> {op}")