"""Payday API.

    uvicorn app.main:app --reload --port 8000

Three endpoints, no more than the dashboard needs:
    GET /health
    GET /simulate    -- run both policies, return the comparison
    GET /decisions   -- per-charge decision log with reasons
"""

from functools import lru_cache
from typing import Any, Dict, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from app.data.failure_codes import FAILURE_CODES
from app.simulator.compare import compare

app = FastAPI(title="Payday", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=8)
def _cached_compare(customers: int, seed: int, outcome_seed: int) -> Dict[str, Any]:
    return compare(n_customers=customers, seed=seed, outcome_seed=outcome_seed)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/failure-codes")
def failure_codes() -> Dict[str, Any]:
    return {
        key: {
            "label": fc.label,
            "share": fc.share,
            "retry_alone_works": fc.retry_alone_works,
            "needs_customer_action": fc.needs_customer_action,
            "description": fc.description,
        }
        for key, fc in FAILURE_CODES.items()
    }


@app.get("/simulate")
def simulate(
    customers: int = Query(5000, ge=100, le=50000),
    seed: int = Query(42),
    outcome_seed: int = Query(20260905),
    stream_limit: int = Query(400, ge=0, le=2000),
) -> Dict[str, Any]:
    report = _cached_compare(customers, seed, outcome_seed)

    return {
        "seed": report["seed"],
        "horizon_days": report["horizon_days"],
        "delta_recovered": report["delta_recovered"],
        "lift": report["lift"],
        "retries_saved": report["retries_saved"],
        "baseline": report["baseline"],
        "agent": report["agent"],
        "stream": {
            "baseline": [r.to_dict() for r in report["baseline_results"][:stream_limit]],
            "agent": [r.to_dict() for r in report["agent_results"][:stream_limit]],
        },
    }


@app.get("/decisions")
def decisions(
    customers: int = Query(5000, ge=100, le=50000),
    seed: int = Query(42),
    outcome_seed: int = Query(20260905),
    failure_code: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> Dict[str, Any]:
    """Per-charge audit trail: what Payday did, and the reason it gave."""
    report = _cached_compare(customers, seed, outcome_seed)
    results = report["agent_results"]

    if failure_code:
        results = [r for r in results if r.failure_code == failure_code]

    return {
        "count": len(results),
        "decisions": [r.to_dict() for r in results[:limit]],
    }
