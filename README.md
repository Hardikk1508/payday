# Payday

Recovering revenue that was already earned but never collected.

Track 3: AI Revenue Recovery

---

## The problem

Subscription businesses lose 5-9% of revenue to involuntary churn: customers
who wanted to keep paying, but whose payment did not go through. The card
expired. The balance was short that morning. The 3DS session timed out. None
of these customers chose to leave.

The standard response is a fixed retry schedule -- retry on day 1, day 3,
day 7, then cancel. That schedule is identical for every customer and every
failure reason, and that is where the money goes:

- Retrying an **expired card** three times fails three times. Guaranteed.
- Retrying an **insufficient-funds** decline on day 3 when the customer is
  paid on the 15th wastes the attempt.
- Retrying a **do-not-honor** card repeatedly makes the issuer warier, not
  more willing.

## What Payday does

For each failed charge, Payday establishes the cause and picks an action
fitted to that cause -- retry at a specific time, stop retrying and ask for
new card details, or switch payment instrument. Every decision is written to
a ledger with the reason it was taken.

The name is the thesis: for the largest failure category, the whole problem
reduces to waiting until the money exists.

## Result on a 5,000-subscriber cohort

```
345 failed charges   Rs 707,155 at risk   30-day horizon

                                      baseline        payday
--------------------------------------------------------------
recovered                           Rs 321,834    Rs 534,733
recovery rate                            48.1%         77.4%
retries spent                              804           432
customer contacts                          251           209

delta  Rs 212,899   lift  +66.2%   retries saved  372

by failure reason
--------------------------------------------------------------
                          baseline    payday           at risk
Insufficient funds           52.5%     78.3%        Rs 249,880
Card expired                  6.9%     73.6%        Rs 175,428
Do not honor                 39.7%     53.4%        Rs 108,942
3DS / auth timeout           68.8%     97.9%         Rs 90,952
Network error                89.4%     89.4%         Rs 81,953
```

Payday recovers 66% more revenue using **46% fewer retry attempts** and fewer
customer contacts. Network errors come out identical on both sides, which is
the expected result -- when the correct move is "retry immediately" and the
baseline happens to retry soon, there is nothing to gain. A model that showed
Payday winning every category would be a model with its thumb on the scale.

## Why the comparison is honest

Three properties make this a fair test rather than a demo:

1. **The policies cannot read the answer key.** Neither `baseline.py` nor
   `agent_policy.py` imports anything from `outcome_model.py`. The outcome
   model holds all the ground truth about when a retry clears; the policies
   only see the failure code and the customer record.

2. **Both sides face the same world.** Outcomes are seeded per
   `(charge, day, action)`. If both policies retry charge X on day 9, they
   get the same coin flip. Any difference comes from choosing different days
   or different actions.

3. **Guardrails apply to both.** The same retry cap, contact cap and horizon
   constrain each policy. A guardrail that bound only one side would not be
   a test.

## Architecture

```
failed charge -> diagnose -> decide -> act -> outcome ledger
                     ^                              |
                     +------- reweights ------------+
```

| Layer | Where | What it holds |
|---|---|---|
| Taxonomy | `app/data/failure_codes.py` | Five behavioural failure families |
| Ground truth | `app/simulator/outcome_model.py` | Whether an attempt actually clears |
| Baseline | `app/policy/baseline.py` | Fixed day 1/3/7 schedule |
| Payday | `app/policy/agent_policy.py` | Reason-aware, payday-aware plans |
| Guardrails | `app/policy/guardrails.py` | Retry, contact and spend caps |
| Engine | `app/simulator/engine.py` | Executes any policy day by day |
| Comparison | `app/simulator/compare.py` | Produces the headline number |

## Running it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# print the comparison
python -m app.simulator.compare

# write data/simulation.json for the dashboard
python -m scripts.run_comparison --customers 5000 --seed 42

# serve the API
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/failure-codes` | The taxonomy and what each code means |
| GET | `/simulate` | Full comparison, both policies |
| GET | `/decisions` | Per-charge audit trail with reasons |

## Scope

Payday addresses **involuntary** churn only -- payments that failed for
technical or timing reasons. A customer who deliberately cancels is a
different problem with a different solution, and is out of scope here.

## Data

All figures come from a seeded synthetic cohort, not from live payment data.
The failure-code distribution and the recovery behaviour encoded in
`outcome_model.py` follow publicly reported dunning patterns. Nothing here
touches a real card or a real customer.
