"""The decision ledger.

Every live /diagnose and /outreach-copy call gets written here: what was
asked, what came back, and whether it was actually the model or a fallback.
This is what makes "every decision is written to a ledger with the reason
it was taken" (README) literally true instead of just a description of the
in-memory audit trail on a single request.

Writes are fire-and-forget from the caller's point of view: `record` never
raises, so a Mongo hiccup degrades to "this one call didn't get logged",
never a 500 on the endpoint that triggered it. Reads back the same way --
`list_recent` returns an empty list rather than erroring, so GET /ledger is
always safe to poll from the UI.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.mongo import get_db

COLLECTION = "decisions"


def record(kind: str, input_data: Dict[str, Any], output_data: Dict[str, Any]) -> None:
    db = get_db()
    if db is None:
        return
    try:
        db[COLLECTION].insert_one(
            {
                "kind": kind,  # "diagnose" | "outreach_copy"
                "input": input_data,
                "output": output_data,
                "created_at": datetime.now(timezone.utc),
            }
        )
    except Exception:
        pass


def list_recent(limit: int = 20, kind: Optional[str] = None) -> List[Dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    try:
        query = {"kind": kind} if kind else {}
        cursor = db[COLLECTION].find(query).sort("created_at", -1).limit(limit)
        entries = []
        for doc in cursor:
            doc["id"] = str(doc.pop("_id"))
            doc["created_at"] = doc["created_at"].isoformat()
            entries.append(doc)
        return entries
    except Exception:
        return []
