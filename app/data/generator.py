"""Synthetic dataset generator.

Produces a cohort of subscribers and the charges that failed for them over a
30-day window. Everything is seeded, so a given seed always yields the same
cohort -- important when you want the demo to behave identically in the
recording and in the live judging session.
"""

import random
from typing import List, Tuple

from app.data.failure_codes import weighted_keys
from app.models.schemas import Customer, FailedCharge

PLAN_TIERS = [499, 999, 1999, 4999, 9999]
PLAN_WEIGHTS = [0.30, 0.28, 0.22, 0.14, 0.06]

try:
    from faker import Faker

    _faker_available = True
except ImportError:  # keeps the module runnable before pip install
    _faker_available = False

_FALLBACK_NAMES = [
    "Aarav Mehta", "Priya Nair", "Rohan Iyer", "Sana Qureshi", "Vikram Rao",
    "Ishita Bose", "Karan Malhotra", "Neha Pillai", "Aditya Shah",
    "Meera Krishnan", "Farhan Ali", "Divya Reddy", "Siddharth Jain",
    "Ananya Ghosh", "Rahul Menon", "Tara Kapoor", "Nikhil Verma",
    "Kavya Subramanian", "Arjun Desai", "Riya Chatterjee",
]


def generate_cohort(
    n_customers: int = 5000,
    failure_rate: float = 0.062,
    seed: int = 42,
) -> Tuple[List[Customer], List[FailedCharge]]:
    """Build subscribers and the subset of charges that failed.

    failure_rate defaults to 6.2%, the middle of the commonly cited 5-9%
    involuntary churn band for subscription businesses.
    """
    rng = random.Random(seed)

    if _faker_available:
        fake = Faker("en_IN")
        fake.seed_instance(seed)

    customers: List[Customer] = []
    for i in range(n_customers):
        if _faker_available:
            name = fake.name()
        else:
            name = _FALLBACK_NAMES[rng.randrange(len(_FALLBACK_NAMES))]

        plan = rng.choices(PLAN_TIERS, weights=PLAN_WEIGHTS, k=1)[0]
        handle = name.lower().replace(" ", ".").replace("'", "")

        customers.append(
            Customer(
                id=f"cus_{i:05d}",
                name=name,
                email=f"{handle}{i}@example.com",
                plan_amount=plan,
                # Salaried customers cluster on the 1st; the rest are paid
                # mid-month. This is the signal the agent has to discover.
                payday=1 if rng.random() < 0.58 else 15,
                months_active=rng.randint(1, 36),
            )
        )

    keys, weights = weighted_keys()
    charges: List[FailedCharge] = []
    idx = 0
    for cust in customers:
        if rng.random() >= failure_rate:
            continue
        charges.append(
            FailedCharge(
                id=f"chg_{idx:05d}",
                customer_id=cust.id,
                amount=cust.plan_amount,
                failure_code=rng.choices(keys, weights=weights, k=1)[0],
                # Failures land in the first 20 days so every charge has a
                # fair window to be recovered inside the 30-day horizon.
                fail_day=rng.randint(0, 19),
            )
        )
        idx += 1

    return customers, charges


if __name__ == "__main__":
    customers, charges = generate_cohort()
    at_risk = sum(c.amount for c in charges)
    print(f"{len(customers)} subscribers")
    print(f"{len(charges)} failed charges")
    print(f"Rs {at_risk:,} at risk")
