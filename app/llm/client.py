"""Thin Groq wrapper.

One place that knows how to talk to the model, so diagnose.py and
outreach.py stay focused on prompts rather than SDK plumbing. Every caller
must be able to run with no API key configured -- the demo should degrade to
a heuristic, not crash -- so `is_configured()` is checked before every call
site, never assumed.
"""

import json
import os
from functools import lru_cache
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


def is_configured() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


@lru_cache(maxsize=1)
def _client():
    from groq import Groq

    return Groq(api_key=os.environ["GROQ_API_KEY"])


def chat_json(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 400,
) -> Optional[Dict[str, Any]]:
    """Call the model and parse a JSON object back. None on any failure.

    Every caller treats None as "fall back to the heuristic" -- a flaky
    network or an expired key degrades the feature, it never 500s the API.
    """
    if not is_configured():
        return None

    try:
        response = _client().chat.completions.create(
            model=model or DEFAULT_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception:
        return None


def chat_text(
    system: str,
    user: str,
    *,
    model: Optional[str] = None,
    temperature: float = 0.4,
    max_tokens: int = 220,
) -> Optional[str]:
    if not is_configured():
        return None

    try:
        response = _client().chat.completions.create(
            model=model or DEFAULT_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return None
