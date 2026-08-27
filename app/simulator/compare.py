"""Runs both policies over the same cohort and reports the difference.

This module produces the one number the whole pitch rests on. Both sides see
identical charges, identical customers, identical guardrails and identical
random outcomes for any (charge, day, action) triple. The only variable is
which days and which actions each policy chooses.
"""

from typing import Any, Dict, List

from app.data.failure_codes import FAILURE_CODES
from app.data.generator import generate_cohort
from app.models.schemas import ChargeResult, HORIZON_DAYS
from app.policy import agent_policy, baseline
from app.policy.guardrails import DEFAULT as DEFAULT_GUARDRAILS
from app.simulator.engine import run_policy
from app.simulator.outcome_model import OutcomeModel


def summarise(results: List[ChargeResult], label: str) -> Dict[str, Any]:
    at_risk = sum(r.amount for r in results)
    recovered = sum(r.amount for r in results if r.recovered)
    recovered_count = sum(1 for r in results if r.recovered)

    by_code: Dict[str, Dict[str, Any]] = {}
    for code in FAILURE_CODES:
        subset = [r for r in results if r.failure_code == code]
        if not subset:
            continue
        by_code[code] = {
            "label": FAILURE_CODES[code].label,
            "charges": len(subset),
            "at_risk": sum(r.amount for r in subset),
            "recovered": sum(r.amount for r in subset if r.recovered),
            "recovery_rate": sum(1 for r in subset if r.recovered) / len(subset),
        }

    daily = []
    running = 0
    running_count = 0
    for day in range(HORIZON_DAYS + 1):
        landed = [r for r in results if r.recovered and r.recovered_day == day]
        running += sum(r.amount for r in landed)
        running_count += len(landed)
        daily.append({"day": day, "recovered": running, "recovered_count": running_count})

    return {
        "label": label,
        "charges": len(results),
        "at_risk": at_risk,
        "recovered": recovered,
        "recovered_count": recovered_count,
        "recovery_rate": recovered_count / len(results) if results else 0.0,
        "retries_spent": sum(r.retries_used for r in results),
        "contacts_spent": sum(r.contacts_used for r in results),
        "by_code": by_code,
        "daily": daily,
    }


def compare(
    n_customers: int = 5000,
    seed: int = 42,
    outcome_seed: int = 20260905,
) -> Dict[str, Any]:
    customers, charges = generate_cohort(n_customers=n_customers, seed=seed)
    outcomes = OutcomeModel(seed=outcome_seed)

    base_results = run_policy(
        charges, customers, baseline.plan, outcomes, DEFAULT_GUARDRAILS
    )
    agent_results = run_policy(
        charges, customers, agent_policy.plan, outcomes, DEFAULT_GUARDRAILS
    )

    base = summarise(base_results, baseline.NAME)
    agent = summarise(agent_results, agent_policy.NAME)

    lift = (
        (agent["recovered"] - base["recovered"]) / base["recovered"]
        if base["recovered"]
        else 0.0
    )

    return {
        "seed": seed,
        "horizon_days": HORIZON_DAYS,
        "baseline": base,
        "agent": agent,
        "delta_recovered": agent["recovered"] - base["recovered"],
        "lift": lift,
        "retries_saved": base["retries_spent"] - agent["retries_spent"],
        "baseline_results": base_results,
        "agent_results": agent_results,
    }


def render_report(report: Dict[str, Any]) -> str:
    base = report["baseline"]
    agent = report["agent"]
    lines: List[str] = []

    lines.append("")
    lines.append("PAYDAY  -  recovery comparison")
    lines.append("=" * 62)
    lines.append(
        f"{base['charges']} failed charges   Rs {base['at_risk']:,} at risk   "
        f"{report['horizon_days']}-day horizon"
    )
    lines.append("")

    header = f"{'':32}{'baseline':>14}{'payday':>14}"
    lines.append(header)
    lines.append("-" * 62)

    def row(name: str, a: Any, b: Any) -> str:
        return f"{name:32}{a:>14}{b:>14}"

    lines.append(row("recovered", f"Rs {base['recovered']:,}", f"Rs {agent['recovered']:,}"))
    lines.append(
        row(
            "recovery rate",
            f"{base['recovery_rate']*100:.1f}%",
            f"{agent['recovery_rate']*100:.1f}%",
        )
    )
    lines.append(row("retries spent", f"{base['retries_spent']:,}", f"{agent['retries_spent']:,}"))
    lines.append(
        row("customer contacts", f"{base['contacts_spent']:,}", f"{agent['contacts_spent']:,}")
    )
    lines.append("")
    lines.append(
        f"delta  Rs {report['delta_recovered']:,}   "
        f"lift  {report['lift']*100:+.1f}%   "
        f"retries saved  {report['retries_saved']:,}"
    )
    lines.append("")
    lines.append("by failure reason")
    lines.append("-" * 62)
    lines.append(f"{'':24}{'baseline':>10}{'payday':>10}{'at risk':>18}")

    for code, stats in agent["by_code"].items():
        b = base["by_code"][code]
        lines.append(
            f"{stats['label']:24}"
            f"{b['recovery_rate']*100:>9.1f}%"
            f"{stats['recovery_rate']*100:>9.1f}%"
            f"{'Rs ' + format(stats['at_risk'], ','):>18}"
        )

    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    print(render_report(compare()))
