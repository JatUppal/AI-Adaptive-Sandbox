import httpx, time

URL = "http://localhost:8081/checkout"

ok = 0
for i in range(30):
    try:
        r = httpx.get(URL, timeout=5.0)
        if r.status_code == 200:
            ok += 1
    except Exception:
        pass
    time.sleep(0.05)

print("done, ok:", ok)
