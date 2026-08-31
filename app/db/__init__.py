"""Persistence layer.

Everything in here is best-effort: no MONGODB_URI configured, or Mongo
unreachable, degrades to "not logged" rather than failing the request that
triggered it -- same philosophy as app/llm (no key configured degrades to a
heuristic, never a crash). See app/db/mongo.py and app/db/ledger.py.
"""
