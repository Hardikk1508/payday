"""Payday's collection policy.

One plan per failure family. The rule that matters most: never spend a retry
where the failure code says a retry cannot possibly work, and never spend one
on a day the money is unlikely to be there.

Every action carries a `reason` string. That string is what surfaces in the
decision log and what makes the system auditable -- if a customer asks why
they were charged on the 15th, the answer is on the record.
"""

from typing import Callable, Dict, List

from app.models.schemas import (
    Action,
    ActionKind,
    Customer,
    FailedCharge,
    next_payday,
)

NAME = "Diagnose, then time each retry"


def _insufficient_funds(charge: FailedCharge, customer: Customer) -> List[Action]:
    """The card works. The balance did not. Wait for income."""
    first = next_payday(charge.fail_day + 1, customer.payday)
    second = next_payday(first + 1, customer.payday)

    actions = [
        Action(
            kind=ActionKind.OUTREACH,
            day=max(charge.fail_day + 1, first - 1),
            reason=f"heads-up the day before payday ({customer.payday})",
            channel="email",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=first,
            reason=f"retry on payday ({customer.payday}), balance likely topped up",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=first + 1,
            reason="second pass one day after payday",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=second,
            reason="final pass on the following income date",
        ),
    ]
    return actions


def _card_expired(charge: FailedCharge, customer: Customer) -> List[Action]:
    """No retry will ever clear an expired card. Go straight to the customer."""
    return [
        Action(
            kind=ActionKind.SEND_CARD_UPDATE_LINK,
            day=charge.fail_day,
            reason="card past expiry, retries cannot succeed",
            channel="email",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day + 2,
            reason="check whether new card details landed",
        ),
        Action(
            kind=ActionKind.SEND_CARD_UPDATE_LINK,
            day=charge.fail_day + 5,
            reason="second prompt, no card update received",
            channel="sms",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day + 7,
            reason="check again after second prompt",
        ),
    ]


def _do_not_honor(charge: FailedCharge, customer: Customer) -> List[Action]:
    """Opaque issuer refusal. Retry sparingly, then change the instrument."""
    return [
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day + 2,
            reason="single retry in case the refusal was transient",
        ),
        Action(
            kind=ActionKind.SWITCH_METHOD,
            day=charge.fail_day + 3,
            reason="repeated retries harden the issuer, try another instrument",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day + 4,
            reason="retry on the alternate method",
        ),
    ]


def _auth_timeout(charge: FailedCharge, customer: Customer) -> List[Action]:
    """Authentication expired, nothing is wrong. Retry now, odds decay fast."""
    return [
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day,
            reason="auth session expired, immediate retry while odds are high",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day + 1,
            reason="one more pass before the window closes",
        ),
    ]


def _network_error(charge: FailedCharge, customer: Customer) -> List[Action]:
    """The issuer never saw the request. Nothing to diagnose."""
    return [
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day,
            reason="request never reached the issuer, retry immediately",
        ),
        Action(
            kind=ActionKind.RETRY,
            day=charge.fail_day + 1,
            reason="second pass if the outage persisted",
        ),
    ]


PLANS: Dict[str, Callable[[FailedCharge, Customer], List[Action]]] = {
    "insufficient_funds": _insufficient_funds,
    "card_expired": _card_expired,
    "do_not_honor": _do_not_honor,
    "auth_timeout": _auth_timeout,
    "network_error": _network_error,
}


def plan(charge: FailedCharge, customer: Customer) -> List[Action]:
    builder = PLANS.get(charge.failure_code)
    if builder is None:
        return [
            Action(
                kind=ActionKind.RETRY,
                day=charge.fail_day + 1,
                reason="unrecognised failure code, single conservative retry",
            )
        ]

    actions = builder(charge, customer)
    actions.sort(key=lambda a: (a.day, a.kind is ActionKind.RETRY))
    return actions
