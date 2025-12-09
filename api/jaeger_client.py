#!/usr/bin/env python3
"""
Jaeger Client - Fetches traces from Jaeger's REST API and filters error spans.
"""

import os
import time
import requests
from typing import List, Dict, Any


# Environment variable for Jaeger URL
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
        # Calculate timestamps in microseconds
        end_time = int(time.time() * 1_000_000)
        start_time = end_time - (minutes_ago * 60 * 1_000_000)
        
        # Build Jaeger API URL
        url = f"{JAEGER_URL}/api/traces"
        params = {
            "service": service_name,
            "start": start_time,
            "end": end_time,
            "limit": 100
        }
        
        # Make GET request
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        # Return trace data
        data = response.json()
        return data.get("data", [])
    
    except requests.exceptions.RequestException as e:
        print(f"Error fetching traces from Jaeger: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error in fetch_traces: {e}")
        return []


def is_error_span(span: Dict[str, Any]) -> bool:
    """
    Check if a span represents an error.
    
    Checks both:
    - OTLP status code (2 = ERROR)
    - HTTP status code >= 400 in tags
    
    Args:
        span: Span object from Jaeger trace
    
    Returns:
        True if span represents an error, False otherwise
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
            status_code = tag.get("value")
            if isinstance(status_code, (int, float)) and status_code >= 400:
                return True
            # Handle string status codes
            if isinstance(status_code, str):
                try:
                    if int(status_code) >= 400:
                        return True
                except (ValueError, TypeError):
                    pass
    
    return False


def get_failed_spans(traces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extract all failed spans from a list of traces.
    
    Args:
        traces: List of trace objects from Jaeger
    
    Returns:
        List of span objects that represent errors
    """
    failed_spans = []
    
    try:
        for trace in traces:
            # Each trace has a list of spans
            spans = trace.get("spans", [])
            for span in spans:
                if is_error_span(span):
                    failed_spans.append(span)
    
    except Exception as e:
        print(f"Error processing traces: {e}")
        return []
    
    return failed_spans


if __name__ == "__main__":
    # Test the client
    print(f"Testing Jaeger client with URL: {JAEGER_URL}")
    traces = fetch_traces("service-a", minutes_ago=10)
    print(f"Fetched {len(traces)} traces")
    
    failed = get_failed_spans(traces)
    print(f"Found {len(failed)} failed spans")
