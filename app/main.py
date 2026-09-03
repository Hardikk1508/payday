"""Payday API.

    uvicorn app.main:app --reload --port 8000

    GET  /health            -- liveness, and whether the LLM/DB are configured
    GET  /failure-codes     -- the taxonomy
    GET  /simulate          -- run both policies, return the comparison
    GET  /decisions         -- per-charge decision log with reasons
    POST /diagnose          -- classify a raw decline string (LLM, live)
    GET  /diagnose/examples -- sample decline strings for the demo UI
    GET  /outreach-copy     -- generate the customer-facing message for one action
    GET  /ledger            -- recently persisted diagnose/outreach calls
    POST /send-outreach-email -- actually send a generated message via Resend
"""

from functools import lru_cache
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.data.failure_codes import FAILURE_CODES
from app.db import ledger
from app.db.mongo import is_configured as db_configured
from app.email.client import is_configured as email_configured, send_email
from app.llm.client import is_configured as llm_configured
from app.llm.diagnose import SAMPLE_DECLINES, diagnose_decline
from app.llm.outreach import generate_outreach_copy
from app.models.schemas import Customer, FailedCharge
from app.policy import agent_policy
from app.simulator.compare import compare

app = FastAPI(title="Payday", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@lru_cache(maxsize=8)
def _cached_compare(customers: int, seed: int, outcome_seed: int) -> Dict[str, Any]:
    return compare(n_customers=customers, seed=seed, outcome_seed=outcome_seed)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "llm_configured": llm_configured(),
        "db_configured": db_configured(),
        "email_configured": email_configured(),
    }


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


class DiagnoseRequest(BaseModel):
    raw_text: str


# Stand-in customer used only to show what Payday's plan *would* look like
# for a classified failure code -- the raw decline text alone doesn't carry
# a real customer, so there's no real payday/plan/history to reason about.
_PREVIEW_CUSTOMER = Customer(
    id="preview", name="", email="", plan_amount=999, payday=1, months_active=6
)


@app.post("/diagnose")
def diagnose(payload: DiagnoseRequest) -> Dict[str, Any]:
    """Classify a raw, unlabelled decline string -- the step every real
    processor forces you to do before any policy can run. Live LLM call
    when GROQ_API_KEY is set, deterministic keyword heuristic otherwise."""
    diagnosis = diagnose_decline(payload.raw_text)

    preview_charge = FailedCharge(
        id="preview", customer_id="preview", amount=999,
        failure_code=diagnosis.code, fail_day=0,
    )
    recommended = agent_policy.plan(preview_charge, _PREVIEW_CUSTOMER)

    result = {
        "diagnosis": diagnosis.to_dict(),
        "recommended_plan": [a.to_dict() for a in recommended],
    }
    ledger.record("diagnose", {"raw_text": payload.raw_text}, result)
    return result


@app.get("/diagnose/examples")
def diagnose_examples() -> Dict[str, Any]:
    """Sample processor-style decline strings, for a demo UI to offer."""
    return SAMPLE_DECLINES


@app.get("/outreach-copy")
def outreach_copy(
    charge_id: str,
    day: int,
    kind: str,
    customers: int = Query(5000, ge=100, le=50000),
    seed: int = Query(42),
    outcome_seed: int = Query(20260905),
) -> Dict[str, Any]:
    """Generate the actual customer-facing message for one logged action.

    Looked up from the same cached comparison /decisions reads from, so the
    charge, amount and reason shown match the audit trail exactly.
    """
    report = _cached_compare(customers, seed, outcome_seed)
    result = next(
        (r for r in report["agent_results"] if r.charge_id == charge_id), None
    )
    if result is None:
        raise HTTPException(404, f"no charge {charge_id!r} in this cohort")

    attempt = next(
        (a for a in result.attempts if a.day == day and a.action.value == kind), None
    )
    if attempt is None:
        raise HTTPException(404, f"no {kind!r} action on day {day} for {charge_id!r}")

    copy = generate_outreach_copy(
        customer_name=result.customer_name,
        plan_amount=result.amount,
        action_kind=kind,
        reason=attempt.reason,
        failure_label=FAILURE_CODES[result.failure_code].label,
    )
    ledger.record(
        "outreach_copy",
        {"charge_id": charge_id, "day": day, "kind": kind, "customer_name": result.customer_name},
        copy,
    )
    return copy


@app.get("/ledger")
def ledger_recent(
    limit: int = Query(20, ge=1, le=200),
    kind: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Recently persisted /diagnose and /outreach-copy calls -- proof the
    decision ledger is a real, durable store and not just a per-request
    audit trail. Empty list (not an error) when no MONGODB_URI is set."""
    return {
        "db_configured": db_configured(),
        "entries": ledger.list_recent(limit=limit, kind=kind),
    }


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str


@app.post("/send-outreach-email")
def send_outreach_email(payload: SendEmailRequest) -> Dict[str, Any]:
    """Actually dispatch a generated outreach message via Resend.

    Deliberately separate from /outreach-copy: generating the copy is safe
    to do freely, sending it is a real, one-way action against a real
    inbox, so it only happens on an explicit second click with a recipient
    the caller typed in themselves -- never against the simulated cohort's
    @example.com addresses, which cannot receive mail at all.
    """
    if not email_configured():
        raise HTTPException(400, "RESEND_API_KEY not set -- add it to .env and restart the API")

    result = send_email(to=payload.to, subject=payload.subject, body=payload.body)
    ledger.record(
        "email_sent",
        {"to": payload.to, "subject": payload.subject},
        result,
    )
    if not result["sent"]:
        raise HTTPException(502, f"send failed: {result['error']}")
    return result
