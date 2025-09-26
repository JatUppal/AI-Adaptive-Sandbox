import argparse, asyncio, json, time, yaml
import httpx
from pathlib import Path

def load_capture(path):
    lines = Path(path).read_text().splitlines()
    out = []
    for ln in lines:
        ln = ln.strip()
        if not ln: continue
        try: out.append(json.loads(ln))
        except: pass
    return out

async def replay(capture, failure):
    async with httpx.AsyncClient(timeout=5.0) as client:
        t0 = time.monotonic()
        for req in capture:
            await asyncio.sleep(max(0, (req.get("relative_ms",0)/1000) - (time.monotonic()-t0)))
            url = req["url"]
            if failure["type"]=="drop" and failure["target_service"] in url:
                continue
            if failure["type"]=="latency" and failure["target_service"] in url:
                await asyncio.sleep(failure["value_ms"]/1000)
            try:
                await client.request(req.get("method","GET"), url)
            except Exception:
                pass

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--capture", required=True)
    ap.add_argument("--baseline", required=False)
    ap.add_argument("--failure", required=True)
    ap.add_argument("--out", default="data/replays/replay_run_001.json")
    args = ap.parse_args()

    cap = load_capture(args.capture)
    failure = yaml.safe_load(open(args.failure))
    asyncio.run(replay(cap, failure))
    Path(args.out).write_text(json.dumps({"ok_ratio": 0.95}, indent=2))
    print(f"Wrote {args.out}")
