import json, statistics, yaml
from pathlib import Path

CAPTURE = Path("data/captures/capture_001.ndjson")
BASELINE = Path("data/baselines/normal_baseline.yaml")

durations_ms = []
errors = 0
total = 0

with CAPTURE.open() as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            span = json.loads(line)
        except:
            continue
        dur_ns = span.get("duration", None)
        if isinstance(dur_ns, int):
            durations_ms.append(dur_ns / 1_000_000)
        status = span.get("status", {}).get("code")
        if status and str(status).lower() != "status_code_unset":
            errors += 1
        total += 1

p50 = statistics.median(durations_ms) if durations_ms else 0

try:
    p95 = statistics.quantiles(durations_ms, n=100)[94] if len(durations_ms) >= 20 else max(durations_ms or [0])
except Exception:
    durations_ms.sort()
    idx = int(0.95 * (len(durations_ms)-1)) if durations_ms else 0
    p95 = durations_ms[idx] if durations_ms else 0

error_rate = (errors / total) if total else 0.0

BASELINE.parent.mkdir(parents=True, exist_ok=True)
yaml.safe_dump(
    {"p50_ms": round(p50,2), "p95_ms": round(p95,2), "error_rate": round(error_rate,4)},
    BASELINE.open("w")
)

print("Wrote baseline:", BASELINE.read_text())
