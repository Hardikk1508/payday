"""Core domain objects shared by the generator, the policies and the engine."""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import List, Optional, Dict, Any


HORIZON_DAYS = 30
DAYS_IN_MONTH = 30


class ActionKind(str, Enum):
    RETRY = "retry"
    SEND_CARD_UPDATE_LINK = "send_card_update_link"
    SWITCH_METHOD = "switch_method"
    OUTREACH = "outreach"


@dataclass
class Customer:
    id: str
    name: str
    email: str
    plan_amount: int
    payday: int
    months_active: int

    @property
    def lifetime_value(self) -> int:
        return self.plan_amount * self.months_active


@dataclass
class FailedCharge:
    id: str
    customer_id: str
    amount: int
    failure_code: str
    fail_day: int


@dataclass
class Action:
    kind: ActionKind
    day: int
    reason: str
    channel: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["kind"] = self.kind.value
        return d


@dataclass
class ChargeContext:
    """Mutable per-charge state the outcome model reads and writes."""

    card_updated: bool = False
    method_switched: bool = False
    nudged: bool = False
    retries: int = 0
    contacts: int = 0


@dataclass
class AttemptLog:
    day: int
    action: ActionKind
    succeeded: bool
    reason: str
    note: str


@dataclass
class ChargeResult:
    charge_id: str
    customer_id: str
    customer_name: str
    amount: int
    failure_code: str
    fail_day: int
    recovered: bool
    recovered_day: Optional[int]
    retries_used: int
    contacts_used: int
    attempts: List[AttemptLog] = field(default_factory=list)
    blocked_actions: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "charge_id": self.charge_id,
            "customer_id": self.customer_id,
            "customer_name": self.customer_name,
            "amount": self.amount,
            "failure_code": self.failure_code,
            "fail_day": self.fail_day,
            "recovered": self.recovered,
            "recovered_day": self.recovered_day,
            "retries_used": self.retries_used,
            "contacts_used": self.contacts_used,
            "attempts": [
                {
                    "day": a.day,
                    "action": a.action.value,
                    "succeeded": a.succeeded,
                    "reason": a.reason,
                    "note": a.note,
                }
                for a in self.attempts
            ],
            "blocked_actions": self.blocked_actions,
        }


def day_of_month(sim_day: int, start_dom: int = 1) -> int:
    """Map an absolute simulation day onto a calendar day-of-month."""
    return ((start_dom - 1 + sim_day) % DAYS_IN_MONTH) + 1


def next_payday(from_day: int, payday: int, start_dom: int = 1) -> int:
    """First simulation day on or after `from_day` that falls on `payday`."""
    for d in range(from_day, from_day + DAYS_IN_MONTH + 1):
        if day_of_month(d, start_dom) == payday:
            return d
    return from_day
