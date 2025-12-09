#!/usr/bin/env python3
"""
Prometheon RCA API - Root Cause Analysis API Gateway
Wraps existing scripts and provides Jaeger trace analysis endpoints.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List

from jaeger_client import fetch_traces, get_failed_spans


# Initialize FastAPI app
app = FastAPI(title="Prometheon RCA API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "rca-api"}


@app.post("/api/predict-impact")
def predict_impact(payload: Dict[str, Any]):
    """
    Predict failure impact using the trained ML model.
    
    Calls scripts/predict_failure.py with feature engineering.
    
    Request body:
    {
        "fault_type": "latency",
        "fault_target": "a_to_b", 
        "fault_magnitude": 1000
    }
    
    Response:
    {
        "predicted_failure_probability": 0.85,
        "affected_services": [...],
        "recommendation": "..."
    }
    """
    try:
        # Extract payload
        fault_type = payload.get("fault_type", "latency")
        fault_target = payload.get("fault_target", "a_to_b")
        fault_magnitude = payload.get("fault_magnitude", 0)
        
        # Build feature vector
        features = {
            "req_rate": 0.5,
            "err_rate": 0.0,
            "p50_ms": 150 + (fault_magnitude if fault_type == "latency" else 0),
            "p95_ms": 600 + (fault_magnitude if fault_type == "latency" else 0),
            "toxic_active": 1
        }
        
        # Call existing script
        result = subprocess.run(
            [
                "python", "../scripts/predict_failure.py",
                "--model", "../models/failure_predictor.pkl",
                "--cols", "../models/feature_columns.json",
                "--row", json.dumps(features)
            ],
            capture_output=True,
            text=True,
            cwd="/app"
        )
        
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Prediction script failed: {result.stderr}"
            )
        
        # Parse prediction result
        prediction = json.loads(result.stdout)
        risk_score = prediction.get("risk_score", 0.0)
        
        # Build affected services list
        affected = []
        if "a_to_b" in fault_target:
            affected.append({
                "service_name": "service-a",
                "failure_probability": round(risk_score * 0.9, 3),
                "reason": "Direct upstream impact"
            })
            affected.append({
                "service_name": "service-b",
                "failure_probability": round(risk_score * 0.7, 3),
                "reason": "Downstream cascade"
            })
        elif "b_to_c" in fault_target:
            affected.append({
                "service_name": "service-b",
                "failure_probability": round(risk_score * 0.9, 3),
                "reason": "Direct upstream impact"
            })
            affected.append({
                "service_name": "service-c",
                "failure_probability": round(risk_score * 0.7, 3),
                "reason": "Downstream cascade"
            })
        
        # Generate recommendation
        if risk_score >= 0.7:
            recommendation = "High failure risk. Consider reducing magnitude."
        elif risk_score >= 0.4:
            recommendation = "Moderate risk. Monitor closely."
        else:
            recommendation = "Low risk. Safe to proceed."
        
        return {
            "predicted_failure_probability": round(risk_score, 3),
            "affected_services": affected,
            "recommendation": recommendation
        }
    
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse prediction output: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@app.post("/api/analyze-failure")
def analyze_failure(payload: Dict[str, Any]):
    """
    Analyze failure using Jaeger traces and root cause analyzer.
    
    Request body:
    {
        "test_id": "latest",
        "service": "service-a",
        "time_window_minutes": 5
    }
    
    Response:
    {
        "root_causes": [...],
        "affected_services": [...],
        "recommendations": [...]
    }
    """
    try:
        service = payload.get("service", "service-a")
        minutes = payload.get("time_window_minutes", 5)
        
        # Fetch traces from Jaeger
        traces = fetch_traces(service, minutes)
        failed_spans = get_failed_spans(traces)
        
        # Import Person B's analyzer (if it exists)
        try:
            sys.path.append("../scripts")
            from root_cause_analyzer import analyze_root_causes
            
            # Analyze using Person B's function
            analysis = analyze_root_causes(failed_spans, len(traces))
            return analysis
        
        except ImportError:
            # Fallback: Return basic analysis if analyzer doesn't exist yet
            return {
                "total_traces": len(traces),
                "failed_spans": len(failed_spans),
                "service": service,
                "time_window_minutes": minutes,
                "message": "Root cause analyzer not yet implemented. Showing basic trace statistics.",
                "failed_span_details": [
                    {
                        "span_id": span.get("spanID", "unknown"),
                        "operation": span.get("operationName", "unknown"),
                        "duration_ms": span.get("duration", 0) / 1000
                    }
                    for span in failed_spans[:10]  # Limit to first 10
                ]
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@app.post("/api/generate-report")
def generate_report(payload: Dict[str, Any]):
    """
    Generate comparison report using existing report_generator.py script.
    
    Request body:
    {
        "test_id": "latest"
    }
    
    Response:
    {
        "filename": "latest_report.md"
    }
    """
    try:
        test_id = payload.get("test_id", "latest")
        
        # Call existing report generator script
        result = subprocess.run(
            [
                "python", "../scripts/report_generator.py",
                "--baseline", "../data/baselines/normal_baseline.yaml",
                "--compare", "../data/baselines/normal_baseline.yaml",
                "--output", f"../reports/{test_id}_report.md"
            ],
            capture_output=True,
            text=True,
            cwd="/app"
        )
        
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Report generation failed: {result.stderr}"
            )
        
        return {"filename": f"{test_id}_report.md"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation error: {str(e)}")


@app.get("/api/reports")
def list_reports():
    """
    List all generated reports in the reports directory.
    
    Response:
    [
        {
            "filename": "report.md",
            "created_at": "2025-12-08T20:00:00",
            "size_mb": 0.05,
            "download_url": "http://localhost:8000/api/reports/report.md"
        }
    ]
    """
    try:
        reports_dir = Path("../reports")
        
        if not reports_dir.exists():
            return []
        
        reports = []
        for file in reports_dir.glob("*.md"):
            stat = file.stat()
            reports.append({
                "filename": file.name,
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "size_mb": round(stat.st_size / 1_000_000, 2),
                "download_url": f"http://localhost:8000/api/reports/{file.name}"
            })
        
        # Sort by creation time, newest first
        reports.sort(key=lambda x: x["created_at"], reverse=True)
        
        return reports
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list reports: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
