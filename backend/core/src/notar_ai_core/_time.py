"""
Shared timestamp serialization helper. All `datetime` columns are always
written as UTC (`models.py`'s `_now()` uses `datetime.now(timezone.utc)`),
but SQLite has no real timezone-aware storage type — SQLAlchemy's
`DateTime(timezone=True)` round-trips through SQLite as a naive datetime on
read-back. This helper re-attaches the UTC assumption on the way out so
every DTO's timestamp fields serialize as a proper ISO-8601 string with a
`Z` suffix, matching the TypeScript build's `Date.toISOString()` output
exactly (spec §2: "All timestamps UTC ISO-8601").
"""

from __future__ import annotations

from datetime import datetime, timezone


def to_iso_utc(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")
