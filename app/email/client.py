"""Thin Resend wrapper. One HTTP call, no SDK dependency needed -- httpx is
already pulled in transitively by FastAPI/starlette."""

import os
from typing import Any, Dict

import httpx
from dotenv import load_dotenv

load_dotenv()

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_ADDRESS = os.environ.get("EMAIL_FROM", "Payday <onboarding@resend.dev>")

API_URL = "https://api.resend.com/emails"


def is_configured() -> bool:
    return bool(RESEND_API_KEY)


def send_email(to: str, subject: str, body: str) -> Dict[str, Any]:
    """Returns {"sent": bool, "id": str|None, "error": str|None}. Never
    raises -- the caller decides how to surface a failed send."""
    if not is_configured():
        return {"sent": False, "id": None, "error": "RESEND_API_KEY not set"}

    try:
        response = httpx.post(
            API_URL,
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={"from": FROM_ADDRESS, "to": [to], "subject": subject, "text": body},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        return {"sent": True, "id": data.get("id"), "error": None}
    except httpx.HTTPStatusError as e:
        # Resend's error body usually explains exactly what's wrong (e.g. the
        # sandbox-domain restriction to your own account email) -- surface it
        # verbatim rather than just the status code.
        try:
            detail = e.response.json().get("message", e.response.text)
        except Exception:
            detail = e.response.text
        return {"sent": False, "id": None, "error": detail}
    except Exception as e:
        return {"sent": False, "id": None, "error": str(e)}
