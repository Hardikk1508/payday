"""MongoDB connection.

One place that knows how to reach the database, mirroring app/llm/client.py:
`is_configured()` gated before every call site, a short server-selection
timeout so an unreachable cluster fails fast instead of hanging a request,
and a cached client so we don't reconnect on every call.
"""

import os
from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.environ.get("MONGODB_URI", "")
MONGODB_DB = os.environ.get("MONGODB_DB", "payday")


def is_configured() -> bool:
    return bool(MONGODB_URI)


@lru_cache(maxsize=1)
def _client():
    from pymongo import MongoClient

    return MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)


def get_db():
    """None when no URI is configured -- every caller must check for that,
    never assume a database is available."""
    if not is_configured():
        return None
    return _client()[MONGODB_DB]
