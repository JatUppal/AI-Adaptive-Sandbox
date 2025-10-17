import argparse
import json
import random
import time
import requests
from pathlib import Path

def load_capture(path):
    """Load NDJSON capture file and return a list of JSON objects."""
    entries = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                entries.append(obj)
            except json.JSONDecodeError:
                continue
    return entries


def replay_requests(capture, count, output_path, base_url="http://localhost:8081/checkout"):
    """Replay captured requests to service-a and save results."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    results = []

    print(f"Replaying {count} requests to {base_url} ...")

    for i in range(count):
        # Randomly select a captured span to replay
        sample = random.choice(capture)
        payload = extract_payload(sample)

        try:
            start = time.time()
            resp = requests.get(base_url, timeout=10)
            duration_ms = (time.time() - start) * 1000

            result = {
                "index": i + 1,
                "url": base_url,
                "status_code": resp.status_code,
                "duration_ms": round(duration_ms, 2),
                "success": resp.ok,
            }
            results.append(result)
            print(f"[{i+1}/{count}] {resp.status_code} - {duration_ms:.1f}ms")

        except Exception as e:
            result = {"index": i + 1, "url": base_url, "error": str(e)}
            results.append(result)
            print(f"[{i+1}/{count}] ERROR: {e}")

        time.sleep(0.2)  # small delay between requests

    # Save replay results
    with open(output_path, "w") as out:
        for r in results:
            out.write(json.dumps(r) + "\n")

    print(f"\n✅ Replay complete. Results saved to {output_path}")


def extract_payload(sample):
    """Try to extract HTTP request payload or simulate one if unavailable."""
    try:
        # Some captures store request attributes in span attributes
        for rs in sample.get("resourceSpans", []):
            for ss in rs.get("scopeSpans", []):
                for span in ss.get("spans", []):
                    attrs = span.get("attributes", [])
                    for a in attrs:
                        if a.get("key") == "http.request.body":
                            v = a.get("value", {}).get("stringValue")
                            if v:
                                return json.loads(v)
    except Exception:
        pass

    # Default fallback payload if not found
    return {"user_id": random.randint(1, 1000), "items": [{"sku": "ABC123", "qty": 1}]}


def main():
    parser = argparse.ArgumentParser(description="Replay captured traffic to service-a.")
    parser.add_argument("--input", required=True, help="Input NDJSON capture file")
    parser.add_argument("--output", required=True, help="Output NDJSON replay file")
    parser.add_argument("--count", type=int, default=20, help="Number of requests to replay")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise SystemExit(f"❌ Input capture not found: {input_path}")

    capture = load_capture(input_path)
    if not capture:
        raise SystemExit("❌ No valid entries found in capture file.")

    replay_requests(capture, args.count, output_path)


if __name__ == "__main__":
    main()
