"""Customer-facing copy for outreach and card-update actions.

The policy layer decides *that* a customer should be nudged and *why*
(`Action.reason`, a string meant for the internal audit log). This module
turns that internal reason into something you'd actually put in front of a
customer -- a short email. Generated lazily, per action, not as part of the
5,000-customer comparison: see app/llm/__init__.py for why that loop stays
deterministic and LLM-free.
"""

from functools import lru_cache
from typing import Any, Dict

from app.llm.client import chat_text

_SYSTEM = (
    "You write short customer-facing payment-failure emails for a "
    "subscription product. Tone: plain, warm, zero guilt-tripping, no "
    "urgency tricks. 2-3 sentences. End with the concrete next step the "
    "customer should expect or take. No subject line boilerplate like "
    "'Dear Customer' -- use the first name. Output plain text only, no "
    "markdown, no quotes around it."
)

_TEMPLATES = {
    "send_card_update_link": (
        "Hi {name}, the card on file for your Rs {amount} plan has expired, "
        "so we couldn't process your last payment. Update your card details "
        "whenever you get a chance and we'll take it from there -- no other "
        "action needed."
    ),
    "outreach": (
        "Hi {name}, heads up -- your last payment of Rs {amount} didn't go "
        "through. {reason_clause} No action needed from you right now, "
        "we'll retry automatically."
    ),
}

_SUBJECTS = {
    "send_card_update_link": "Update your card to keep your subscription active",
    "outreach": "About your recent payment",
}


@lru_cache(maxsize=512)
def generate_outreach_copy(
    customer_name: str,
    plan_amount: int,
    action_kind: str,
    reason: str,
    failure_label: str,
) -> Dict[str, Any]:
    first_name = customer_name.split(" ")[0]

    body = chat_text(
        system=_SYSTEM,
        user=(
            f"Customer first name: {first_name}\n"
            f"Plan amount: Rs {plan_amount}\n"
            f"Failure reason (internal): {failure_label}\n"
            f"Action being taken: {action_kind}\n"
            f"Internal note for why: {reason}"
        ),
    )

    if body:
        return {
            "subject": _SUBJECTS.get(action_kind, "About your recent payment"),
            "body": body,
            "source": "llm",
        }

    template = _TEMPLATES.get(action_kind, _TEMPLATES["outreach"])
    fallback_body = template.format(
        name=first_name,
        amount=f"{plan_amount:,}",
        reason_clause=f"Reason: {failure_label.lower()}.",
    )
    return {
        "subject": _SUBJECTS.get(action_kind, "About your recent payment"),
        "body": fallback_body,
        "source": "template",
    }
