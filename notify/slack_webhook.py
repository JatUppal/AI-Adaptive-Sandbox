import os, json, sys, requests
WEBHOOK = os.getenv("SLACK_WEBHOOK_URL","")
payload = {"text": sys.argv[1] if len(sys.argv)>1 else "Sandbox alert"}
if WEBHOOK:
    requests.post(WEBHOOK, json=payload, timeout=5)
else:
    print("[dry-run]", payload)
