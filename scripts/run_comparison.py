"""Run the comparison and write results to disk.

    python -m scripts.run_comparison
    python -m scripts.run_comparison --customers 20000 --seed 7

Writes data/simulation.json, which the frontend loads directly. Run this
before recording the demo so the numbers on screen are fixed and reproducible.
"""

import argparse
import json
import os

from app.simulator.compare import compare, render_report

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def main() -> None:
    parser = argparse.ArgumentParser(description="Payday recovery comparison")
    parser.add_argument("--customers", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--outcome-seed", type=int, default=20260905)
    parser.add_argument("--stream-limit", type=int, default=400,
                        help="charges included in the per-charge stream")
    args = parser.parse_args()

    report = compare(
        n_customers=args.customers,
        seed=args.seed,
        outcome_seed=args.outcome_seed,
    )

    print(render_report(report))

    payload = {
        "seed": report["seed"],
        "horizon_days": report["horizon_days"],
        "delta_recovered": report["delta_recovered"],
        "lift": report["lift"],
        "retries_saved": report["retries_saved"],
        "baseline": {k: v for k, v in report["baseline"].items()},
        "agent": {k: v for k, v in report["agent"].items()},
        "stream": {
            "baseline": [
                r.to_dict() for r in report["baseline_results"][: args.stream_limit]
            ],
            "agent": [
                r.to_dict() for r in report["agent_results"][: args.stream_limit]
            ],
        },
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, "simulation.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)

    size_kb = os.path.getsize(path) / 1024
    print(f"wrote {path}  ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
