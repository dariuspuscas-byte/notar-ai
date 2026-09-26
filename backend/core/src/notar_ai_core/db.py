"""
Single async SQLAlchemy engine/session-factory for the whole process. Only
`notar_ai_core` modules touch this — `api` (and any future adapter) never
talks to the DB directly (spec §1.1).

Async engine, driver taken from `config.database_url` (`sqlite+aiosqlite` per
spec §5/§6's default, or `postgresql+asyncpg` when `DATABASE_URL` points at
Postgres — see `config.py`/`backend/README.md`) so `core`'s use-case
functions are `async def` throughout, matching the "async-native" rationale
for choosing FastAPI/httpx (specs/ARCHITECTURE.md task brief) — DB I/O,
Ollama HTTP calls, and file I/O all yield the event loop instead of blocking
it.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import config

engine = create_async_engine(config.database_url, future=True)
_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    async with _session_factory() as session:
        yield session
