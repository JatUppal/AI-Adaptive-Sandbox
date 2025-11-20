from fastapi import FastAPI
from prometheus_client import Gauge, CONTENT_TYPE_LATEST, generate_latest
from prometheus_client import CollectorRegistry
from fastapi.responses import Response, JSONResponse
import os, json, time
import requests

# --- Model loading is optional now; we stub if not present ---
MODEL_PATH = os.getenv("MODEL_PATH", "models/failure_predictor.pkl")
COLS_PATH  = os.getenv("COLS_PATH",  "models/feature_columns.json")
PROM_URL = os.getenv("PROM_URL", "http://prometheus:9090")

model = None
feature_cols = ["req_rate","err_rate","p50_ms","p95_ms","toxic_active"]

try:
    import joblib, json
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
    if os.path.exists(COLS_PATH):
        with open(COLS_PATH) as f:
            feature_cols = json.load(f)
except Exception as e:
    # model stays None; we'll return a dummy score
    pass

# Prometheus registry and metric
registry = CollectorRegistry()
risk_gauge = Gauge("failure_risk_score", "Predicted failure risk [0..1]",
                   ["service"], registry=registry)

app = FastAPI()

@app.get("/health")
def health():
    return {"ok": True, "model_loaded": bool(model), "prom_url": PROM_URL}

def _query_prometheus(query: str):
    """Query Prometheus instant API."""
    try:
        url = f"{PROM_URL}/api/v1/query"
        resp = requests.get(url, params={"query": query}, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "success":
            result = data.get("data", {}).get("result", [])
            if result:
                value = result[0].get("value", [None, "0"])[1]
                return float(value) if value != "NaN" else 0.0
        return 0.0
    except Exception as e:
        # Return 0 on error to keep service running
        return 0.0

def _get_live_features(service: str = "service-a"):
    """
    Query live metrics from Prometheus for the specified service.
    Uses 1-minute rate windows matching training data.
    """
    queries = {
        "req_rate": f'sum(rate(request_count_total{{service="{service}"}}[1m]))',
        "err_rate": f'sum(rate(error_count_total{{service="{service}"}}[1m])) / sum(rate(request_count_total{{service="{service}"}}[1m]))',
        "p50_ms": f'histogram_quantile(0.50, sum(rate(request_latency_seconds_bucket{{service="{service}"}}[1m])) by (le)) * 1000',
        "p95_ms": f'histogram_quantile(0.95, sum(rate(request_latency_seconds_bucket{{service="{service}"}}[1m])) by (le)) * 1000',
    }
    
    features = {}
    for name, query in queries.items():
        features[name] = _query_prometheus(query)
    
    # toxic_active: check if there are any active toxics (stub for now)
    features["toxic_active"] = 0
    
    return features

@app.get("/predict")
def predict(service: str = "service-a"):
    feats = _get_live_features(service)
    x = [feats.get(c, 0.0) for c in feature_cols]
    risk = 0.2  # default stub

    if model is not None:
        try:
            import numpy as np
            p = model.predict_proba([x])[0][1]
            risk = float(p)
        except Exception:
            pass

    status = "LOW"
    if risk >= 0.8: status = "HIGH_RISK"
    elif risk >= 0.5: status = "MEDIUM"

    # update gauge
    risk_gauge.labels(service=service).set(risk)

    return JSONResponse({
        "service": service,
        "risk_score": risk,
        "status": status,
        "reason": f"err_rate={feats.get('err_rate', 0):.3f}, p95={feats.get('p95_ms', 0):.0f}ms",
        "features": feats,
        "model_loaded": bool(model)
    })

@app.get("/metrics")
def metrics():
    return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)
