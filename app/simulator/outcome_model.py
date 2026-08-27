"""Ground-truth model of how the world responds to a collection attempt.

This is deliberately isolated from the policies. A policy proposes an action;
this module decides whether it worked. Neither baseline nor agent policy
imports anything from here, so the comparison in compare.py is honest -- the
agent has to earn its lift by reasoning about the failure code, not by
reading the answer.

The probabilities encode publicly reported dunning behaviour: expired cards
never clear on retry, insufficient-funds declines clear around income dates,
3DS timeouts are transient, and repeated retries on a "do not honor" card
harden the issuer against you.
"""

import random
from typing import Tuple

from app.models.schemas import (
    Action,
    ActionKind,
    ChargeContext,
    Customer,
    FailedCharge,
    day_of_month,
)


class OutcomeModel:
    def __init__(self, seed: int = 20260905):
        self._seed = seed

    def _rng(self, charge_id: str, day: int, kind: str) -> random.Random:
        """Deterministic per (charge, day, action) randomness.

        Seeding this way means both policies face an identical world: if the
        baseline and the agent both retry charge X on day 9, they get the
        same coin flip. Any difference in outcome comes from choosing
        different days or different actions.
        """
        return random.Random(f"{self._seed}:{charge_id}:{day}:{kind}")

    def attempt(
        self,
        charge: FailedCharge,
        customer: Customer,
        action: Action,
        ctx: ChargeContext,
    ) -> Tuple[bool, str]:
        rng = self._rng(charge.id, action.day, action.kind.value)

        if action.kind is ActionKind.SEND_CARD_UPDATE_LINK:
            ctx.contacts += 1
            delay = max(0, action.day - charge.fail_day)
            p = 0.62 * (0.93 ** delay)
            if rng.random() < p:
                ctx.card_updated = True
                return False, "customer updated their card"
            return False, "update link sent, no response yet"

        if action.kind is ActionKind.SWITCH_METHOD:
            if rng.random() < 0.70:
                ctx.method_switched = True
                return False, "backup payment method available"
            return False, "no backup method on file"

        if action.kind is ActionKind.OUTREACH:
            ctx.contacts += 1
            ctx.nudged = True
            return False, "reminder delivered"

        # From here on: an actual charge attempt.
        ctx.retries += 1
        p = self._retry_probability(charge, customer, action, ctx)

        if rng.random() < p:
            return True, f"charge cleared (p={p:.2f})"
        return False, f"declined again (p={p:.2f})"

    def _retry_probability(
        self,
        charge: FailedCharge,
        customer: Customer,
        action: Action,
        ctx: ChargeContext,
    ) -> float:
        code = charge.failure_code
        offset = action.day - charge.fail_day

        if ctx.card_updated:
            return 0.94

        if code == "card_expired":
            return 0.02

        if code == "insufficient_funds":
            dom = day_of_month(action.day)
            distance = min(
                abs(dom - customer.payday),
                30 - abs(dom - customer.payday),
            )
            if distance == 0:
                p = 0.74
            elif distance == 1:
                p = 0.66
            elif distance <= 3:
                p = 0.34
            else:
                p = 0.11
            if ctx.nudged:
                p += 0.06
            return min(p, 0.92)

        if code == "do_not_honor":
            if ctx.method_switched:
                return 0.46
            # Each additional retry on the same card makes the issuer warier.
            return max(0.05, 0.20 - 0.05 * (ctx.retries - 1))

        if code == "auth_timeout":
            return max(0.10, 0.82 * (0.72 ** offset))

        if code == "network_error":
            return max(0.15, 0.90 * (0.80 ** offset))

        return 0.15
