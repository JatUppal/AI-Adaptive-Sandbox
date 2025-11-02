from fastapi import FastAPI
from prometheus_client import Gauge, CONTENT_TYPE_LATEST, generate_latest
from prometheus_client import CollectorRegistry
from fastapi.responses import Response, JSONResponse
import os, json, time

# --- Model loading is optional now; we stub if not present ---
MODEL_PATH = os.getenv("MODEL_PATH", "models/failure_predictor.pkl")
COLS_PATH  = os.getenv("COLS_PATH",  "models/feature_columns.json")

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
    # model stays None; we’ll return a dummy score
    pass

# Prometheus registry and metric
registry = CollectorRegistry()
risk_gauge = Gauge("failure_risk_score", "Predicted failure risk [0..1]",
                   ["service"], registry=registry)

app = FastAPI()

@app.get("/health")
def health():
    return {"ok": True, "model_loaded": bool(model)}

def _get_live_features():
    """
    TODO(Person C): replace with live Prometheus queries.
    For now we return a safe dummy vector so the service runs.
    """
    # you can tune these to see the gauge move
    return {"req_rate": 0.2, "err_rate": 0.0, "p50_ms": 150, "p95_ms": 650, "toxic_active": 0}

@app.get("/predict")
def predict(service: str = "service-a"):
    feats = _get_live_features()
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
    if risk >= 0.8: status = "HIGH"
    elif risk >= 0.5: status = "MEDIUM"

    # update gauge
    risk_gauge.labels(service=service).set(risk)

    return JSONResponse({
        "service": service,
        "risk_score": risk,
        "status": status,
        "features": feats,
        "model_loaded": bool(model)
    })

@app.get("/metrics")
def metrics():
    return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)
