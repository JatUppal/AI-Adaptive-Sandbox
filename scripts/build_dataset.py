#!/usr/bin/env python3
"""
Build a labeled dataset from Prometheus metrics for failure prediction.

Usage:
    python scripts/build_dataset.py --minutes 30 --out data/phase2/metrics_dataset.csv
"""
import argparse
import requests
import pandas as pd
from datetime import datetime, timedelta
import time
import sys


def query_prometheus(prom_url: str, query: str, start: float, end: float, step: str = "15s"):
    """Query Prometheus range API."""
    url = f"{prom_url}/api/v1/query_range"
    params = {
        "query": query,
        "start": start,
        "end": end,
        "step": step
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "success":
            print(f"Warning: Query failed: {query}", file=sys.stderr)
            return []
        return data.get("data", {}).get("result", [])
    except Exception as e:
        print(f"Error querying Prometheus: {e}", file=sys.stderr)
        return []


def build_dataset(prom_url: str, minutes: int, output_path: str):
    """Build a dataset from Prometheus metrics."""
    print(f"Building dataset from last {minutes} minutes of Prometheus data...")
    
    # Time range
    end_time = time.time()
    start_time = end_time - (minutes * 60)
    
    # Queries for features (1-minute windows)
    queries = {
        "req_rate": 'sum by (service) (rate(request_count_total{service="service-a"}[1m]))',
        "err_rate": 'sum by (service) (rate(error_count_total{service="service-a"}[1m])) / sum by (service) (rate(request_count_total{service="service-a"}[1m]))',
        "p50_ms": 'histogram_quantile(0.50, sum(rate(request_latency_seconds_bucket{service="service-a"}[1m])) by (le)) * 1000',
        "p95_ms": 'histogram_quantile(0.95, sum(rate(request_latency_seconds_bucket{service="service-a"}[1m])) by (le)) * 1000',
    }
    
    # Collect all metrics
    all_data = {}
    for metric_name, query in queries.items():
        print(f"Querying {metric_name}...")
        results = query_prometheus(prom_url, query, start_time, end_time, step="15s")
        
        if results:
            # Take first result series
            series = results[0]
            values = series.get("values", [])
            
            # Store as {timestamp: value}
            for ts, val in values:
                ts_key = float(ts)
                if ts_key not in all_data:
                    all_data[ts_key] = {"timestamp": ts_key}
                
                # Handle NaN and convert to float
                try:
                    all_data[ts_key][metric_name] = float(val) if val != "NaN" else 0.0
                except (ValueError, TypeError):
                    all_data[ts_key][metric_name] = 0.0
    
    if not all_data:
        print("Error: No data collected from Prometheus. Make sure services are running and generating metrics.")
        sys.exit(1)
    
    # Convert to DataFrame
    df = pd.DataFrame(list(all_data.values()))
    df = df.sort_values("timestamp").reset_index(drop=True)
    
    # Fill missing values
    for col in ["req_rate", "err_rate", "p50_ms", "p95_ms"]:
        if col not in df.columns:
            df[col] = 0.0
        else:
            df[col] = df[col].fillna(0.0)
    
    # Create synthetic "failure" label based on heuristics
    # Label as failure (1) if: error_rate > 0.1 OR p95 > 800ms
    df["failure"] = ((df["err_rate"] > 0.1) | (df["p95_ms"] > 800)).astype(int)
    
    # Add a "toxic_active" feature (0 for now, can be enhanced later)
    df["toxic_active"] = 0
    
    # Reorder columns
    feature_cols = ["req_rate", "err_rate", "p50_ms", "p95_ms", "toxic_active"]
    df = df[["timestamp"] + feature_cols + ["failure"]]
    
    # Save
    df.to_csv(output_path, index=False)
    print(f"\n✓ Dataset saved to {output_path}")
    print(f"  Rows: {len(df)}")
    print(f"  Failures: {df['failure'].sum()} ({df['failure'].mean()*100:.1f}%)")
    print(f"\nFeature summary:")
    print(df[feature_cols].describe())
    
    return df


def main():
    parser = argparse.ArgumentParser(description="Build failure prediction dataset from Prometheus")
    parser.add_argument("--minutes", type=int, default=30, help="Minutes of history to fetch")
    parser.add_argument("--out", type=str, default="data/phase2/metrics_dataset.csv", help="Output CSV path")
    parser.add_argument("--prom-url", type=str, default="http://localhost:9090", help="Prometheus URL")
    
    args = parser.parse_args()
    
    # Ensure output directory exists
    import os
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    
    build_dataset(args.prom_url, args.minutes, args.out)


if __name__ == "__main__":
    main()
