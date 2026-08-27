"""Baseline dunning policy: the industry-standard fixed retry schedule.

Every failed charge gets the same treatment regardless of why it failed --
retry on day 1, 3 and 7, with one generic reminder email in the middle. This
is what most subscription billing stacks ship with, and it is the number
Payday has to beat.
"""

from typing import List

from app.models.schemas import Action, ActionKind, Customer, FailedCharge

RETRY_OFFSETS = [1, 3, 7]
REMINDER_OFFSET = 3

NAME = "Fixed retries on day 1, 3, 7"


def plan(charge: FailedCharge, customer: Customer) -> List[Action]:
    actions: List[Action] = []

    for offset in RETRY_OFFSETS:
        actions.append(
            Action(
                kind=ActionKind.RETRY,
                day=charge.fail_day + offset,
                reason=f"scheduled retry, day +{offset}",
            )
        )

    actions.append(
        Action(
            kind=ActionKind.OUTREACH,
            day=charge.fail_day + REMINDER_OFFSET,
            reason="generic payment failure notice",
            channel="email",
        )
    )

    actions.sort(key=lambda a: (a.day, a.kind is not ActionKind.OUTREACH))
    return actions
