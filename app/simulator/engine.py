"""Runs a collection policy against the outcome model.

The engine is policy-agnostic on purpose: it takes any callable with the
signature (charge, customer) -> List[Action] and executes the resulting plan
day by day, stopping the moment a charge clears.
"""

from typing import Callable, Dict, List

from app.models.schemas import (
    Action,
    ActionKind,
    AttemptLog,
    ChargeContext,
    ChargeResult,
    Customer,
    FailedCharge,
)
from app.policy.guardrails import Guardrails, DEFAULT as DEFAULT_GUARDRAILS
from app.simulator.outcome_model import OutcomeModel

PolicyFn = Callable[[FailedCharge, Customer], List[Action]]


def run_charge(
    charge: FailedCharge,
    customer: Customer,
    policy: PolicyFn,
    outcomes: OutcomeModel,
    guardrails: Guardrails = DEFAULT_GUARDRAILS,
) -> ChargeResult:
    ctx = ChargeContext()
    result = ChargeResult(
        charge_id=charge.id,
        customer_id=customer.id,
        customer_name=customer.name,
        amount=charge.amount,
        failure_code=charge.failure_code,
        fail_day=charge.fail_day,
        recovered=False,
        recovered_day=None,
        retries_used=0,
        contacts_used=0,
    )

    for action in policy(charge, customer):
        allowed, block_reason = guardrails.check(action, charge, customer, ctx)
        if not allowed:
            result.blocked_actions.append(f"day {action.day} {action.kind.value}: {block_reason}")
            continue

        succeeded, note = outcomes.attempt(charge, customer, action, ctx)
        result.attempts.append(
            AttemptLog(
                day=action.day,
                action=action.kind,
                succeeded=succeeded,
                reason=action.reason,
                note=note,
            )
        )

        if succeeded:
            result.recovered = True
            result.recovered_day = action.day
            break

    result.retries_used = ctx.retries
    result.contacts_used = ctx.contacts
    return result


def run_policy(
    charges: List[FailedCharge],
    customers: List[Customer],
    policy: PolicyFn,
    outcomes: OutcomeModel,
    guardrails: Guardrails = DEFAULT_GUARDRAILS,
) -> List[ChargeResult]:
    index: Dict[str, Customer] = {c.id: c for c in customers}
    return [
        run_charge(charge, index[charge.customer_id], policy, outcomes, guardrails)
        for charge in charges
    ]
