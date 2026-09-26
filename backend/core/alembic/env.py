"""
Alembic migration environment. Starts fresh (spec-authorized: no real
production data existed under the TypeScript/Prisma build — see the task
brief) rather than translating Prisma's migration history.

Runs migrations with a *synchronous* driver even though the app itself uses
an async dialect at runtime (notar_ai_core/db.py) — this is the standard
Alembic pattern (migrations are one-shot, sequential DDL, so there is no
benefit to running them through the async engine) and keeps env.py simple.
`_sync_database_url()` below swaps the async driver for its sync counterpart:
`sqlite+aiosqlite` -> stdlib `sqlite3`, `postgresql+asyncpg` -> `psycopg2`
(local dev Postgres instance; the spec's documented default is still
SQLite — see backend/README.md for why a Postgres `DATABASE_URL` is in use
here).
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `notar_ai_core` importable when Alembic is invoked from backend/core/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from notar_ai_core.config import config as app_config  # noqa: E402
from notar_ai_core.models import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_database_url() -> str:
    # notar_ai_core.config.database_url is the async URL the app uses at
    # runtime; Alembic wants a plain sync driver for the same database.
    url = app_config.database_url
    url = url.replace("sqlite+aiosqlite://", "sqlite://")
    url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    return url


def run_migrations_offline() -> None:
    url = _sync_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _sync_database_url()
    connectable = engine_from_config(configuration, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
