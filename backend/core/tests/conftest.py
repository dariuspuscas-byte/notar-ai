"""
Test bootstrap. Mirrors the TypeScript suite's pattern of setting
`DATABASE_URL`/`DOCUMENTS_ROOT` before `core` is ever imported (see the
comments in the old `classifyDocument.test.ts`/`reviewClassification.test.ts`:
"core modules must only be imported (even transitively) AFTER DATABASE_URL /
DOCUMENTS_ROOT are set, since core/src/db.ts and core/src/config.ts read
those env vars at module-evaluation time"). The Python port has the same
constraint (`notar_ai_core.config`/`notar_ai_core.db` read env vars and build
the SQLAlchemy engine at import time), so these env vars are set here, at
module scope, which pytest guarantees runs before any test file in this
directory is collected/imported.

Unlike vitest (which isolates the module registry per test file, so each
TypeScript test file could safely set its own temp DB path), a single pytest
process shares one Python module cache for the whole session. So this suite
uses ONE shared throwaway SQLite DB + documents directory for every test
module, and each test creates its own uniquely-coded act type/case fixtures
(same approach the original TS tests already used *within* a file, e.g.
`test_act_${Date.now()}_${Math.random()}`) to avoid cross-test collisions.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import uuid
from pathlib import Path

_tmp_dir = Path(tempfile.mkdtemp(prefix="notar-ai-test-"))
_db_path = _tmp_dir / "test.db"
_documents_root = _tmp_dir / "documents"
_documents_root.mkdir(parents=True, exist_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["DOCUMENTS_ROOT"] = str(_documents_root)
# Deliberately conservative threshold matching the spec's rollout note,
# exercised explicitly by the "low confidence" assertions in the tests below.
os.environ["CLASSIFICATION_CONFIDENCE_THRESHOLD"] = "0.85"

from notar_ai_core.db import engine  # noqa: E402
from notar_ai_core.models import Base  # noqa: E402


async def _create_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


asyncio.run(_create_schema())


def unique_code(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"
