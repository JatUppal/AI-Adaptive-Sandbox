import json, statistics, yaml
from pathlib import Path

CAPTURE = Path("data/captures/capture_001.ndjson")
BASELINE = Path("data/baselines/normal_baseline.yaml")

def attr_value(attr):
    v = attr.get("value", {})
    for k in ("stringValue", "intValue", "doubleValue", "boolValue", "bytesValue"):
        if k in v:
            return v[k]
    return None

def get_attr(attributes, key):
    for a in attributes or []:
        if a.get("key") == key:
            return attr_value(a)
    return None

def span_duration_ms(span):
    if "duration" in span and isinstance(span["duration"], int):
        return span["duration"] / 1_000_000.0
    try:
        start = int(span.get("startTimeUnixNano", "0"))
        end = int(span.get("endTimeUnixNano", "0"))
        if end > start and start > 0:
            return (end - start) / 1_000_000.0
    except Exception:
        pass
    return None

def is_error(span, attributes):
    code = (span.get("status") or {}).get("code")
    if isinstance(code, str):
        if code.upper() not in ("STATUS_CODE_OK", "STATUS_CODE_UNSET"):
            return True
    elif isinstance(code, int):
        # OTLP enum: 0=UNSET, 1=OK, 2=ERROR
        if code == 2:
            return True
    http_status = get_attr(attributes, "http.status_code")
    try:
        if http_status is not None and int(http_status) >= 400:
            return True
    except Exception:
        pass
    return False

def is_server_kind(kind):
    # Accept both enum ints and string representations
    if isinstance(kind, int):
        return kind == 2  # 2 == SERVER in OTLP
    if isinstance(kind, str):
        return "SERVER" in kind.upper()
    return False

durations_ms, errors, total = [], 0, 0

if not CAPTURE.exists():
    raise SystemExit(f"Capture not found: {CAPTURE}")

with CAPTURE.open() as f:
    for raw in f:
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue

        for rs in obj.get("resourceSpans", []):
            res_attrs = rs.get("resource", {}).get("attributes", [])
            service_name = get_attr(res_attrs, "service.name")

            for ss in rs.get("scopeSpans", []):
                for span in ss.get("spans", []):
                    name = (span.get("name") or "")
                    kind = span.get("kind")
                    attrs = span.get("attributes", [])
                    route = get_attr(attrs, "http.route") or get_attr(attrs, "http.target")

                    is_service_a = (service_name == "service-a")
                    looks_like_checkout = (route == "/checkout") or ("/checkout" in name)
                    if is_service_a and looks_like_checkout and is_server_kind(kind):
                        dms = span_duration_ms(span)
                        if dms is not None:
                            durations_ms.append(dms)
                            total += 1
                            if is_error(span, attrs):
                                errors += 1

# Metrics
if durations_ms:
    p50 = round(statistics.median(durations_ms), 2)
    try:
        p95 = round(statistics.quantiles(durations_ms, n=100)[94], 2) if len(durations_ms) >= 20 else round(max(durations_ms), 2)
    except Exception:
        durations_ms.sort()
        idx = int(0.95 * (len(durations_ms) - 1))
        p95 = round(durations_ms[idx], 2)
else:
    p50 = 0.0
    p95 = 0.0

error_rate = round((errors / total), 4) if total else 0.0

BASELINE.parent.mkdir(parents=True, exist_ok=True)
with BASELINE.open("w") as out:
    yaml.safe_dump(
        {"sample_count": int(total), "p50_ms": float(p50), "p95_ms": float(p95), "error_rate": float(error_rate)},
        out,
        sort_keys=False,
    )

print(f"Wrote baseline to {BASELINE}")
print(f" samples={total}, p50_ms={p50}, p95_ms={p95}, error_rate={error_rate}")
