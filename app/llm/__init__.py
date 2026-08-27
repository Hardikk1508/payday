"""LLM-backed layer: decline classification and customer-facing copy.

Kept deliberately separate from app/policy and app/simulator. The bulk
5,000-customer comparison in compare.py must stay deterministic and fast --
seeding a live model call into that loop would make the headline numbers
unreproducible and would take minutes to run. Everything in this package is
an additive capability layered on top of the simulation, exercised through
its own endpoints (/diagnose, /outreach-copy), not through the policies
under test.
"""
