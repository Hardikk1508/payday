"""Failure-code taxonomy.

Payment processors return dozens of decline codes. Payday groups them into
five behavioural families, because the correct response depends on *why* the
charge failed, not on the raw code string.

This module is reference data only. It holds no policy and no probabilities
used to decide outcomes -- those live in app/simulator/outcome_model.py so
that the policy under test can never read the answer key.
"""

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class FailureCode:
    key: str
    label: str
    share: float
    retry_alone_works: bool
    needs_customer_action: bool
    time_sensitive: bool
    description: str


FAILURE_CODES: Dict[str, FailureCode] = {
    "insufficient_funds": FailureCode(
        key="insufficient_funds",
        label="Insufficient funds",
        share=0.34,
        retry_alone_works=True,
        needs_customer_action=False,
        time_sensitive=True,
        description=(
            "The card is valid but the balance was short on the day of the "
            "charge. Recovery depends almost entirely on when the retry "
            "lands relative to the customer's income date."
        ),
    ),
    "card_expired": FailureCode(
        key="card_expired",
        label="Card expired",
        share=0.22,
        retry_alone_works=False,
        needs_customer_action=True,
        time_sensitive=False,
        description=(
            "The stored card is past its expiry date. No number of retries "
            "will ever succeed. The only path to recovery is getting the "
            "customer to supply new card details."
        ),
    ),
    "do_not_honor": FailureCode(
        key="do_not_honor",
        label="Do not honor",
        share=0.18,
        retry_alone_works=True,
        needs_customer_action=False,
        time_sensitive=False,
        description=(
            "A generic issuer refusal with no stated reason. Sometimes "
            "transient, often not. Repeated retries on the same card raise "
            "the issuer's suspicion rather than the odds of success."
        ),
    ),
    "auth_timeout": FailureCode(
        key="auth_timeout",
        label="3DS / auth timeout",
        share=0.14,
        retry_alone_works=True,
        needs_customer_action=False,
        time_sensitive=True,
        description=(
            "The authentication step expired before completion. The card is "
            "fine. An immediate retry usually clears; the odds decay sharply "
            "the longer the delay."
        ),
    ),
    "network_error": FailureCode(
        key="network_error",
        label="Network error",
        share=0.12,
        retry_alone_works=True,
        needs_customer_action=False,
        time_sensitive=True,
        description=(
            "The request never reached the issuer. Nothing is wrong with the "
            "customer or the card. Retry as soon as possible."
        ),
    ),
}


def weighted_keys():
    """Return (keys, weights) suitable for random.choices."""
    keys = list(FAILURE_CODES.keys())
    weights = [FAILURE_CODES[k].share for k in keys]
    return keys, weights


def get(key: str) -> FailureCode:
    return FAILURE_CODES[key]
