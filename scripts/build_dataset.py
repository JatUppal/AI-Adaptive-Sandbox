"""
scripts/build_dataset.py

Pull recent metrics from Prometheus, engineer features per time window, and write a labeled CSV at data/phase2/metrics_dataset.csv.

Usage example:
python scripts/build_dataset.py --prom http://localhost:9090 --window 60 --minutes 60 --service service-a 
--threshold_p95_ms 700 --out data/phase2/metrics_dataset.csv
"""

import argparse
import csv
import os
import time
from datetime import datetime, timedelta, timezone

import pytz
import requests


# Helpers for Prometheus queries
def prom_query(prom, query, ts):
    """Query Prometheus instant API at time `ts` (unix seconds) and return float value or 0.0"""
    url = f"{prom.rstrip('/')}/api/v1/query"
    params = {"query": query, "time": str(int(ts))}
    try:
        r = requests.get(url, params=params, timeout=5)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "success":
            return 0.0
        results = data.get("data", {}).get("result", [])
        if not results:
            return 0.0
        # take first result value
        val = results[0].get("value", [None, "0"])[1]
        return float(val)
    except Exception:
        return 0.0
    

def toxic_active(prom_tox, proxies=("ab", "bc")):
    """Return 1 if any toxic is enabled on ab or bc proxies, else 0. Uses toxiproxy admin API base URL."""
    active = 0
    if not prom_tox:
        return 0
    for p in proxies:
        try:
            url = f"{prom_tox.rstrip('/')}/proxies/{p}"
            r = requests.get(url, timeout=3)
            r.raise_for_status()
            data = r.json()
            if data and data.get("toxics"):
                # if any toxic exists and is enabled, consider active
                for t in data.get("toxics", []):
                    if t.get("enabled", True):
                        active = 1
                        return 1
        except Exception:
            continue
    return active


def build_rows(prom, window, minutes, service, threshold_p95_ms, toxiproxy_url=None):
    """Build dataset rows for the given time range. Returns list of dict rows."""
    rows = []
    end = datetime.now(timezone.utc)
    start = end - timedelta(minutes=minutes)

    # iterate by window seconds (choose minute-aligned timestamps)
    step = timedelta(seconds=window)
    # align start to nearest step
    cur = start.replace(second=0, microsecond=0)
    while cur < end:
        ts = int(cur.timestamp())
        # PromQL queries (instant)
        # request rate per second (sum of rate over 1m) -> sum(rate(...[1m]))
        req_q = f'sum(rate(request_count_total{{service="{service}"}}[1m]))'
        err_q = f'sum(rate(error_count_total{{service="{service}"}}[1m]))'
        p50_q = f'histogram_quantile(0.50, sum by (le) (rate(request_latency_seconds_bucket{{service="{service}"}}[1m])))'
        p95_q = f'histogram_quantile(0.95, sum by (le) (rate(request_latency_seconds_bucket{{service="{service}"}}[1m])))'

        req_rate = prom_query(prom, req_q, ts)
        err_rate = prom_query(prom, err_q, ts)
        p50 = prom_query(prom, p50_q, ts)
        p95 = prom_query(prom, p95_q, ts)

        # convert seconds -> milliseconds
        p50_ms = float(p50) * 1000.0
        p95_ms = float(p95) * 1000.0

        tox_active = toxic_active(toxiproxy_url) if toxiproxy_url else 0

        label = int((err_rate > 0) or (p95_ms > threshold_p95_ms))

        rows.append({
        "timestamp": datetime.fromtimestamp(ts, timezone.utc).isoformat(),
        "service": service,
        "req_rate": float(req_rate),
        "err_rate": float(err_rate),
        "p50_ms": round(p50_ms, 3),
        "p95_ms": round(p95_ms, 3),
        "toxic_active": int(tox_active),
        "label": label,
        })

        cur += step
    return rows

def write_csv(out_path, rows):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    fieldnames = ["timestamp", "service", "req_rate", "err_rate", "p50_ms", "p95_ms", "toxic_active", "label"]
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prom", default="http://localhost:9090")
    parser.add_argument("--window", type=int, default=60)
    parser.add_argument("--minutes", type=int, default=60)
    parser.add_argument("--service", default="service-a")
    parser.add_argument("--threshold_p95_ms", type=float, default=700.0)
    parser.add_argument("--toxiproxy", default=None, help="Toxiproxy admin URL e.g. http://localhost:8474")
    parser.add_argument("--out", default="data/phase2/metrics_dataset.csv")
    args = parser.parse_args()

    rows = build_rows(args.prom, args.window, args.minutes, args.service, args.threshold_p95_ms, args.toxiproxy)
    write_csv(args.out, rows)
    print(f"Wrote {len(rows)} rows to {args.out}")

if __name__ == "__main__":
    main()