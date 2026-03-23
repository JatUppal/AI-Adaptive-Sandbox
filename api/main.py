#!/usr/bin/env python3
"""
Prometheon RCA API v2.0 — Phase 2A
  - JWT auth (register / login / protected endpoints)
  - PostgreSQL persistence (test results, chaos configs)
  - Redis caching (idempotent RCA analysis)
  - All Phase 1.5 endpoints preserved
"""

import subprocess
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, init_db, close_db
from models import TestResult, ChaosConfig
from auth import get_current_user
from auth_routes import router as auth_router
from sandbox_proxy import router as sandbox_proxy_router
from cache import (
    get_cached_analysis,
    set_cached_analysis,
    invalidate_tenant_cache,
    close_redis,
)
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
# Lifespan — startup + shutdown hooks
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[rca-api] Initializing database tables...")
    await init_db()
    print("[rca-api] Database ready.")
    yield
    # Shutdown
    await close_db()
    await close_redis()
    print("[rca-api] Shutdown complete.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Prometheon RCA API", version="2.0.0", lifespan=lifespan)

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

# Mount auth routes
app.include_router(auth_router)
app.include_router(sandbox_proxy_router)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "rca-api",
        "version": "2.0.0",
        "analyzer_loaded": _analyzer_available,
    }


# ---------------------------------------------------------------------------
# 1. Predict Impact (wraps scripts/predict_failure.py)
# ---------------------------------------------------------------------------
@app.post("/api/predict-impact")
def predict_impact(payload: Dict[str, Any]):
    """Predict failure impact using the trained ML model."""
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
            raise HTTPException(status_code=500, detail=f"Prediction script failed: {result.stderr}")

        prediction = json.loads(result.stdout)
        risk_score = prediction.get("risk_score", 0.0)

        affected = []
        if "a_to_b" in fault_target:
            affected.append({"service_name": "service-a", "failure_probability": round(risk_score * 0.9, 3), "reason": "Direct upstream impact"})
            affected.append({"service_name": "service-b", "failure_probability": round(risk_score * 0.7, 3), "reason": "Downstream cascade"})
        elif "b_to_c" in fault_target:
            affected.append({"service_name": "service-b", "failure_probability": round(risk_score * 0.9, 3), "reason": "Direct upstream impact"})
            affected.append({"service_name": "service-c", "failure_probability": round(risk_score * 0.7, 3), "reason": "Downstream cascade"})

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
        raise HTTPException(status_code=500, detail=f"Failed to parse prediction: {e}")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Prediction timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


# ---------------------------------------------------------------------------
# 2. Analyze Failure — NOW with caching + persistence
# ---------------------------------------------------------------------------
@app.post("/api/analyze-failure")
async def analyze_failure(
    payload: Dict[str, Any],
    current_user: Optional[dict] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze failures using Jaeger traces + root cause analyzer.
    - Checks Redis cache first (idempotent within TTL)
    - Persists results to PostgreSQL
    - Scoped to the authenticated user's tenant
    """
    try:
        service = payload.get("service", "service-a")
        minutes = payload.get("time_window_minutes", 5)
        tenant_id = current_user["tenant_id"]

        # 1. Check cache
        cached = await get_cached_analysis(tenant_id, service, minutes)
        if cached:
            cached["_cached"] = True
            return cached

        # 2. Fetch traces from Jaeger
        traces = fetch_traces(service, minutes)
        failed_spans = get_failed_spans(traces)

        # 3. Run full RCA if analyzer is available
        if _analyzer_available:
            analysis = analyze_root_causes(
                failed_spans=failed_spans,
                total_traces=len(traces),
                project_config={
                    "project_name": "default",
                    "services": ["service-a", "service-b", "service-c"],
                },
            )
            analysis["service"] = service
            analysis["time_window_minutes"] = minutes
        else:
            analysis = {
                "test_id": f"test_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
                "status": "success" if len(failed_spans) == 0 else "failed",
                "error_rate": round(len(failed_spans) / max(len(traces), 1), 4),
                "total_traces": len(traces),
                "failed_traces": len(failed_spans),
                "service": service,
                "time_window_minutes": minutes,
                "root_causes": [],
                "ai_summary": "Root cause analyzer not loaded. Basic trace statistics only.",
                "recommendations": [],
            }

        # 4. Persist to PostgreSQL
        test_result = TestResult(
            tenant_id=tenant_id,
            test_id=analysis.get("test_id", f"test_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"),
            service=service,
            status=analysis.get("status", "unknown"),
            error_rate=analysis.get("error_rate", 0.0),
            total_traces=analysis.get("total_traces", 0),
            failed_traces=analysis.get("failed_traces", 0),
            root_causes=analysis.get("root_causes", []),
            ai_summary=analysis.get("ai_summary", ""),
            recommendations=analysis.get("recommendations", []),
            time_window_minutes=minutes,
            raw_response=analysis,
        )
        db.add(test_result)
        await db.flush()

        # Add the persisted ID to the response
        analysis["result_id"] = str(test_result.id)

        # 5. Cache the result
        await set_cached_analysis(tenant_id, service, minutes, analysis)

        return analysis

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


# ---------------------------------------------------------------------------
# 3. List Test Results (history) — tenant-scoped
# ---------------------------------------------------------------------------
@app.get("/api/test-results")
async def list_test_results(
    limit: int = 20,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List past test results for the current tenant."""
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(TestResult)
        .where(TestResult.tenant_id == tenant_id)
        .order_by(desc(TestResult.created_at))
        .limit(limit)
        .offset(offset)
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "test_id": r.test_id,
            "service": r.service,
            "status": r.status,
            "error_rate": r.error_rate,
            "total_traces": r.total_traces,
            "failed_traces": r.failed_traces,
            "root_cause_count": len(r.root_causes) if r.root_causes else 0,
            "ai_summary": r.ai_summary[:200] if r.ai_summary else "",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# 4. Get Single Test Result — tenant-scoped
# ---------------------------------------------------------------------------
@app.get("/api/test-results/{result_id}")
async def get_test_result(
    result_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full details of a specific test result."""
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(TestResult).where(
            TestResult.id == result_id,
            TestResult.tenant_id == tenant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Test result not found")
    return row.raw_response or {
        "test_id": row.test_id,
        "service": row.service,
        "status": row.status,
        "error_rate": row.error_rate,
        "root_causes": row.root_causes,
        "ai_summary": row.ai_summary,
        "recommendations": row.recommendations,
    }


# ---------------------------------------------------------------------------
# 5. Chaos Config CRUD — tenant-scoped
# ---------------------------------------------------------------------------
@app.get("/api/chaos-configs")
async def list_chaos_configs(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved chaos injection presets for the current tenant."""
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(ChaosConfig)
        .where(ChaosConfig.tenant_id == tenant_id)
        .order_by(desc(ChaosConfig.created_at))
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "proxy": r.proxy,
            "toxic_type": r.toxic_type,
            "attributes": r.attributes,
            "is_default": r.is_default,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@app.post("/api/chaos-configs", status_code=201)
async def create_chaos_config(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a chaos injection preset."""
    tenant_id = current_user["tenant_id"]
    config = ChaosConfig(
        tenant_id=tenant_id,
        name=payload["name"],
        description=payload.get("description", ""),
        proxy=payload["proxy"],
        toxic_type=payload["toxic_type"],
        attributes=payload.get("attributes", {}),
    )
    db.add(config)
    await db.flush()

    # Invalidate cache — new injection config may change analysis
    await invalidate_tenant_cache(tenant_id)

    return {"id": str(config.id), "name": config.name}


@app.delete("/api/chaos-configs/{config_id}")
async def delete_chaos_config(
    config_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved chaos injection preset."""
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(ChaosConfig).where(
            ChaosConfig.id == config_id,
            ChaosConfig.tenant_id == tenant_id,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    await db.delete(config)
    return {"deleted": True}


# ---------------------------------------------------------------------------
# 6. Generate Report (unchanged from Phase 1.5)
# ---------------------------------------------------------------------------
@app.post("/api/generate-report")
def generate_report(payload: Dict[str, Any]):
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
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Report generation failed: {result.stderr}")
        return {"filename": f"{test_id}_report.md"}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Report generation timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report error: {str(e)}")


@app.get("/api/reports")
def list_reports():
    try:
        reports_dir = Path("/reports")
        if not reports_dir.exists():
            return []
        reports = []
        for file in reports_dir.glob("*.md"):
            stat = file.stat()
            reports.append({
                "filename": file.name,
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "size_mb": round(stat.st_size / 1_000_000, 2),
            })
        reports.sort(key=lambda x: x["created_at"], reverse=True)
        return reports
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list reports: {str(e)}")


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
