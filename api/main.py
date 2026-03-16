#!/usr/bin/env python3
"""
Prometheon RCA API - Root Cause Analysis API Gateway
Wraps existing scripts and provides Jaeger trace analysis endpoints.
"""

import subprocess
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from jaeger_client import fetch_traces, get_failed_spans

# ---------------------------------------------------------------------------
# Import the RCA analyzer from /scripts (Docker volume mount)
# ---------------------------------------------------------------------------
SCRIPTS_DIR = os.getenv("SCRIPTS_DIR", "/scripts")
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

_analyzer_available = False
try:
    from root_cause_analyzer import analyze_root_causes
    _analyzer_available = True
    print(f"[rca-api] root_cause_analyzer loaded from {SCRIPTS_DIR}")
except ImportError as exc:
    print(f"[rca-api] WARNING: Could not import root_cause_analyzer: {exc}")
    print(f"[rca-api] Falling back to basic trace statistics.")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Prometheon RCA API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "rca-api",
        "analyzer_loaded": _analyzer_available,
    }


# ---------------------------------------------------------------------------
# 1. Predict Impact  (wraps scripts/predict_failure.py)
# ---------------------------------------------------------------------------
@app.post("/api/predict-impact")
def predict_impact(payload: Dict[str, Any]):
    """
    Predict failure impact using the trained ML model.
    """
    try:
        fault_type = payload.get("fault_type", "latency")
        fault_target = payload.get("fault_target", "a_to_b")
        fault_magnitude = payload.get("fault_magnitude", 0)

        features = {
            "req_rate": 0.5,
            "err_rate": 0.0,
            "p50_ms": 150 + (fault_magnitude if fault_type == "latency" else 0),
            "p95_ms": 600 + (fault_magnitude if fault_type == "latency" else 0),
            "toxic_active": 1,
        }

        result = subprocess.run(
            [
                "python",
                f"{SCRIPTS_DIR}/predict_failure.py",
                "--model", "/models/failure_predictor.pkl",
                "--cols", "/models/feature_columns.json",
                "--row", json.dumps(features),
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Prediction script failed: {result.stderr}",
            )

        prediction = json.loads(result.stdout)
        risk_score = prediction.get("risk_score", 0.0)

        # Build affected services list
        affected = []
        if "a_to_b" in fault_target:
            affected.append(
                {"service_name": "service-a", "failure_probability": round(risk_score * 0.9, 3), "reason": "Direct upstream impact"}
            )
            affected.append(
                {"service_name": "service-b", "failure_probability": round(risk_score * 0.7, 3), "reason": "Downstream cascade"}
            )
        elif "b_to_c" in fault_target:
            affected.append(
                {"service_name": "service-b", "failure_probability": round(risk_score * 0.9, 3), "reason": "Direct upstream impact"}
            )
            affected.append(
                {"service_name": "service-c", "failure_probability": round(risk_score * 0.7, 3), "reason": "Downstream cascade"}
            )

        if risk_score >= 0.7:
            recommendation = "High failure risk. Consider reducing magnitude."
        elif risk_score >= 0.4:
            recommendation = "Moderate risk. Monitor closely."
        else:
            recommendation = "Low risk. Safe to proceed."

        return {
            "predicted_failure_probability": round(risk_score, 3),
            "affected_services": affected,
            "recommendation": recommendation,
        }

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse prediction output: {e}")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Prediction script timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


# ---------------------------------------------------------------------------
# 2. Analyze Failure  (calls root_cause_analyzer directly)
# ---------------------------------------------------------------------------
@app.post("/api/analyze-failure")
def analyze_failure(payload: Dict[str, Any]):
    """
    Analyze failures using Jaeger traces + root cause analyzer.

    Returns the FULL ranked analysis including:
      - root_causes (ranked by confidence)
      - ai_summary  (LLM or rule-based)
      - recommendations
    """
    try:
        service = payload.get("service", "service-a")
        minutes = payload.get("time_window_minutes", 5)

        # 1. Fetch traces from Jaeger
        traces = fetch_traces(service, minutes)
        failed_spans = get_failed_spans(traces)

        # 2. Run full RCA if analyzer is available
        if _analyzer_available:
            analysis = analyze_root_causes(
                failed_spans=failed_spans,
                total_traces=len(traces),
                project_config={
                    "project_name": "default",
                    "services": ["service-a", "service-b", "service-c"],
                },
            )
            # Enrich with query params so the frontend knows what was requested
            analysis["service"] = service
            analysis["time_window_minutes"] = minutes
            return analysis

        # 3. Fallback: basic trace statistics
        return {
            "test_id": f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "status": "success" if len(failed_spans) == 0 else "failed",
            "error_rate": round(len(failed_spans) / max(len(traces), 1), 4),
            "total_traces": len(traces),
            "failed_traces": len(failed_spans),
            "service": service,
            "time_window_minutes": minutes,
            "root_causes": [],
            "ai_summary": (
                "Root cause analyzer module not loaded. "
                "Showing basic trace statistics only."
            ),
            "recommendations": [],
            "failed_span_details": [
                {
                    "span_id": span.get("spanID", "unknown"),
                    "operation": span.get("operationName", "unknown"),
                    "duration_ms": span.get("duration", 0) / 1000,
                }
                for span in failed_spans[:10]
            ],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


# ---------------------------------------------------------------------------
# 3. Generate Report
# ---------------------------------------------------------------------------
@app.post("/api/generate-report")
def generate_report(payload: Dict[str, Any]):
    """Generate comparison report using report_generator.py."""
    try:
        test_id = payload.get("test_id", "latest")

        result = subprocess.run(
            [
                "python",
                f"{SCRIPTS_DIR}/report_generator.py",
                "--baseline", "/data/baselines/normal_baseline.yaml",
                "--compare", "/data/baselines/normal_baseline.yaml",
                "--output", f"/reports/{test_id}_report.md",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Report generation failed: {result.stderr}",
            )

        return {"filename": f"{test_id}_report.md"}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Report generation timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Report generation error: {str(e)}",
        )


# ---------------------------------------------------------------------------
# 4. List Reports
# ---------------------------------------------------------------------------
@app.get("/api/reports")
def list_reports():
    """List all generated reports in the reports directory."""
    try:
        reports_dir = Path("/reports")
        if not reports_dir.exists():
            return []

        reports = []
        for file in reports_dir.glob("*.md"):
            stat = file.stat()
            reports.append(
                {
                    "filename": file.name,
                    "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "size_mb": round(stat.st_size / 1_000_000, 2),
                    "download_url": f"http://localhost:8000/api/reports/{file.name}",
                }
            )

        reports.sort(key=lambda x: x["created_at"], reverse=True)
        return reports

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list reports: {str(e)}",
        )


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)