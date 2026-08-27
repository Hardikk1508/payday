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

DEFAULT_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

# gpt-oss is a reasoning model: its internal "thinking" tokens are billed
# against max_tokens before the visible answer, and it will happily spend
# the entire budget thinking and return an empty completion (finish_reason
# "length") if you don't rein it in. reasoning_effort="low" is enough for
# a five-way classification or a three-sentence email -- there's no
# multi-step problem here that needs a deeper budget.
REASONING_EFFORT = "low"


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
            extra_body={"reasoning_effort": REASONING_EFFORT},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = response.choices[0].message.content
        return json.loads(content) if content else None
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
            extra_body={"reasoning_effort": REASONING_EFFORT},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = response.choices[0].message.content
        return content.strip() if content else None
    except Exception:
        return None
