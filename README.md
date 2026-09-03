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
321 failed charges   Rs 738,679 at risk   30-day horizon

                                      baseline        payday
--------------------------------------------------------------
recovered                           Rs 394,838    Rs 541,259
recovery rate                            50.5%         75.1%
retries spent                              722           418
customer contacts                          220           178

delta  Rs 146,421   lift  +37.1%   retries saved  304

by failure reason
--------------------------------------------------------------
                          baseline    payday           at risk
Insufficient funds           55.6%     66.7%        Rs 224,401
Card expired                  6.1%     84.8%        Rs 133,434
Do not honor                 45.8%     50.0%        Rs 166,428
3DS / auth timeout           76.6%     97.9%        Rs 113,953
Network error                91.9%    100.0%        Rs 100,463
```

Payday recovers 37% more revenue using **42% fewer retry attempts** and fewer
customer contacts. Card expired is the clearest case: retries alone recover
6% of it because an expired card cannot clear, no matter how many times you
try; routing straight to a card-update request recovers 85%. A model that
showed Payday winning every category by a similar margin would be a model
with its thumb on the scale -- network error, where the right move is
"retry immediately" and the baseline already does that on day 1, is the
category with the least room to improve.

Regenerate this table any time with `python -m app.simulator.compare` --
every number above is reproducible from seed 42, not hand-picked.

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
              5,000-customer comparison (deterministic, reproducible)
failed charge --------> decide --------> act --------> outcome
              (failure_code            (guardrails    (seeded per
               already known,           applied to     charge/day/
               see note below)          both sides)     action)

              live, additive, not part of the scored comparison
raw decline text ---> diagnose (LLM) ---> Payday's plan for that family
action + reason  ---> outreach copy (LLM) ---> customer-facing message
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
| Diagnosis | `app/llm/diagnose.py` | Classifies a raw decline string via Groq, keyword heuristic if no key is set |
| Outreach copy | `app/llm/outreach.py` | Generates the customer-facing message for an outreach/card-update action |
| Ledger | `app/db/ledger.py`, `app/db/mongo.py` | Persists every live `/diagnose` and `/outreach-copy` call to MongoDB, read back by `GET /ledger` |

**Why the diagnose/outreach LLM calls are kept out of the 5,000-customer
loop:** that comparison has to stay deterministic -- same seed, same
numbers, every run -- and a live model call per charge would make it
neither reproducible nor fast (minutes instead of milliseconds for 300+
charges). So `FailedCharge.failure_code` in the simulated cohort is known
upfront, the way it would be *after* diagnosis. The `/diagnose` and
`/outreach-copy` endpoints are the real, callable version of that step,
exercised on demand against arbitrary input instead of baked into the bulk
run.

**The ledger persists real usage, not the simulated cohort.** Every live
call to `/diagnose` or `/outreach-copy` -- input, output, reasoning,
timestamp -- is written to MongoDB and readable back via `GET /ledger`.
Like the LLM layer, it degrades honestly: no `MONGODB_URI` configured, or
Mongo unreachable, means that call just isn't logged, never a broken
request. There's still no reweighting loop -- the ledger is a record of
what happened, nothing yet reads it back to change how `agent_policy.py`
decides. The `requirements.txt` entry for Redis is staged, not wired up.

## Running it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# fill in GROQ_API_KEY to get live LLM diagnosis/outreach copy; leave it
# blank and both features fall back to a deterministic heuristic/template
# instead of failing
# fill in MONGODB_URI to persist those calls to a real decision ledger;
# leave it blank and they still run live, just aren't saved

# print the comparison
python -m app.simulator.compare

# write data/simulation.json (currently unused by the frontend, which
# talks to the live API instead -- kept for offline/static demo use)
python -m scripts.run_comparison --customers 5000 --seed 42

# serve the API
uvicorn app.main:app --reload --port 8000
```

Frontend (needs the API running on :8000 -- the dev server proxies `/api` to it):

```bash
cd frontend
npm install
npm run dev
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, and whether the LLM/DB are configured |
| GET | `/failure-codes` | The taxonomy and what each code means |
| GET | `/simulate` | Full comparison, both policies |
| GET | `/decisions` | Per-charge audit trail with reasons |
| POST | `/diagnose` | Classify a raw decline string (live LLM call) |
| GET | `/diagnose/examples` | Sample raw decline strings for the demo UI |
| GET | `/outreach-copy` | Generate the customer-facing message for one logged action |
| GET | `/ledger` | Recently persisted diagnose/outreach calls (empty if no `MONGODB_URI`) |

## Scope

Payday addresses **involuntary** churn only -- payments that failed for
technical or timing reasons. A customer who deliberately cancels is a
different problem with a different solution, and is out of scope here.

## Data

All figures come from a seeded synthetic cohort, not from live payment data.
Nothing here touches a real card or a real customer. Two different kinds of
claim are mixed into `outcome_model.py`, worth telling apart:

- **The mechanisms are real, reported patterns.** An expired card cannot
  clear on retry. Insufficient-funds recovery correlates with proximity to
  the customer's income date. Repeated retries on a "do not honor" decline
  make the issuer warier, not more willing. 3DS/network failures are
  recoverable only in a short window right after they happen. These
  qualitative shapes are consistent with widely-cited dunning/involuntary-
  churn writeups from payments and billing companies (Stripe, Recurly,
  Chargebee, Baremetrics have all published versions of this).
- **The exact numbers are estimates, not citations.** The specific
  constants -- a 0.74 clear-probability on payday itself, a 0.72 per-day
  decay on 3DS timeouts, a 0.05 hardening penalty per do-not-honor retry --
  were calibrated by hand to produce a coherent, plausible simulation. No
  single source backs the number "0.74" specifically. Treat the *lift*
  Payday shows over baseline as an illustration of the mechanism, not a
  guaranteed real-world percentage.
