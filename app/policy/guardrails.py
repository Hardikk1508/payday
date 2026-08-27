"""Guardrails.

Anything that proposes actions against a real customer needs limits that the
proposer cannot talk its way past. These are applied by the engine after a
policy produces its plan, and they apply identically to the baseline and to
Payday -- a guardrail that only constrains one side would not be a fair test.

Every blocked action is recorded on the result, so "what stopped the agent
from emailing this person forty times" has an answer you can show.
"""

from dataclasses import dataclass
from typing import List, Tuple

from app.models.schemas import (
    Action,
    ActionKind,
    ChargeContext,
    Customer,
    FailedCharge,
    HORIZON_DAYS,
)


@dataclass(frozen=True)
class Guardrails:
    max_retries: int = 4
    max_contacts: int = 2
    max_discount_fraction_of_ltv: float = 0.15
    horizon_days: int = HORIZON_DAYS

    def check(
        self,
        action: Action,
        charge: FailedCharge,
        customer: Customer,
        ctx: ChargeContext,
    ) -> Tuple[bool, str]:
        """Return (allowed, reason_if_blocked)."""
        if action.day > self.horizon_days:
            return False, "beyond collection horizon"

        if action.day < charge.fail_day:
            return False, "action scheduled before the charge failed"

        if action.kind is ActionKind.RETRY and ctx.retries >= self.max_retries:
            return False, f"retry cap reached ({self.max_retries})"

        contact_kinds = (ActionKind.OUTREACH, ActionKind.SEND_CARD_UPDATE_LINK)
        if action.kind in contact_kinds and ctx.contacts >= self.max_contacts:
            return False, f"contact cap reached ({self.max_contacts})"

        return True, ""

    def max_discount(self, customer: Customer) -> int:
        """Ceiling on any win-back offer, expressed in whole rupees."""
        return int(customer.lifetime_value * self.max_discount_fraction_of_ltv)


DEFAULT = Guardrails()
