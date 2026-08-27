"""Decline classification: raw processor text -> a failure-code family.

Everywhere else in this codebase, `FailedCharge.failure_code` is handed to
the policy already labelled -- the synthetic generator knows the ground
truth because it wrote it. A real processor doesn't hand you a clean label;
it hands you a decline string like "Do Not Honor (05)" or "51: insufficient
funds -- retry after settlement" and you have to work out which of the five
behavioural families it belongs to before any policy can act on it. This
module is that step, done for real: an LLM call when a key is configured,
a keyword heuristic when it isn't.
"""

from dataclasses import dataclass
from typing import Any, Dict, List

from app.data.failure_codes import FAILURE_CODES
from app.llm.client import chat_json

VALID_CODES = list(FAILURE_CODES.keys())

# Realistic, noisy processor-style strings for the "try an example" UI --
# not the clean enum key the simulator uses internally.
SAMPLE_DECLINES: Dict[str, List[str]] = {
    "insufficient_funds": [
        "Decline code 51: Insufficient funds in account",
        "NSF -- available balance below transaction amount",
        "Issuer declined: not enough funds to cover Rs 999.00 debit",
    ],
    "card_expired": [
        "Decline code 54: Expired card",
        "Card expiration date 03/24 has passed",
        "Issuer response: expired_card, please obtain updated card details",
    ],
    "do_not_honor": [
        "Decline code 05: Do not honor",
        "Generic decline -- issuer gave no further detail",
        "Response 05: transaction not permitted by cardholder's bank",
    ],
    "auth_timeout": [
        "3DS challenge not completed -- session expired after 300s",
        "Decline code 91: Authentication timeout",
        "SCA step-up abandoned by cardholder, no liability shift",
    ],
    "network_error": [
        "Gateway timeout -- no response from issuer within 30s",
        "Error 96: system malfunction, request not processed",
        "Connection reset while awaiting authorization response",
    ],
}

_KEYWORDS = {
    "card_expired": ["expired", "expiry", "54", "past its"],
    "do_not_honor": ["do not honor", "do_not_honor", "05:", "no further detail", "not permitted"],
    "auth_timeout": ["3ds", "authentication", "auth timeout", "sca", "challenge", "91:"],
    "network_error": ["timeout", "gateway", "network", "connection reset", "96:", "malfunction"],
    "insufficient_funds": ["insufficient", "nsf", "balance", "51:", "not enough funds"],
}


@dataclass
class Diagnosis:
    code: str
    label: str
    confidence: float
    reasoning: str
    source: str  # "llm" | "heuristic"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "label": self.label,
            "confidence": round(self.confidence, 2),
            "reasoning": self.reasoning,
            "source": self.source,
        }


def _heuristic_classify(raw_text: str) -> Diagnosis:
    text = raw_text.lower()
    for code, words in _KEYWORDS.items():
        if any(w in text for w in words):
            return Diagnosis(
                code=code,
                label=FAILURE_CODES[code].label,
                confidence=0.6,
                reasoning=f"Matched keyword pattern for {FAILURE_CODES[code].label.lower()}.",
                source="heuristic",
            )
    return Diagnosis(
        code="do_not_honor",
        label=FAILURE_CODES["do_not_honor"].label,
        confidence=0.3,
        reasoning="No pattern matched; defaulting to the generic-refusal family.",
        source="heuristic",
    )


def _taxonomy_prompt() -> str:
    lines = ["You classify payment decline messages into exactly one of these families:"]
    for key, fc in FAILURE_CODES.items():
        lines.append(f'- "{key}": {fc.label} -- {fc.description}')
    lines.append(
        "\nRespond with a JSON object: "
        '{"code": one of the keys above exactly, '
        '"confidence": number 0-1, '
        '"reasoning": one sentence explaining the classification}.'
    )
    return "\n".join(lines)


def diagnose_decline(raw_text: str) -> Diagnosis:
    raw_text = (raw_text or "").strip()
    if not raw_text:
        return Diagnosis(
            code="do_not_honor",
            label=FAILURE_CODES["do_not_honor"].label,
            confidence=0.0,
            reasoning="Empty input.",
            source="heuristic",
        )

    result = chat_json(system=_taxonomy_prompt(), user=raw_text)

    if result and result.get("code") in VALID_CODES:
        code = result["code"]
        return Diagnosis(
            code=code,
            label=FAILURE_CODES[code].label,
            confidence=float(result.get("confidence", 0.7)),
            reasoning=str(result.get("reasoning", "")).strip() or "Classified by model.",
            source="llm",
        )

    # Model not configured, errored, or returned something off-schema.
    return _heuristic_classify(raw_text)
