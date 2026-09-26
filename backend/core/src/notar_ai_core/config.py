"""
Central runtime configuration (specs/ARCHITECTURE.md §4.2/§6). Reads
`backend/.env`, the same file the TypeScript implementation read (spec
ambiguity carried forward on purpose — one env file for the whole backend,
regardless of which language runs it).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# backend/core/src/notar_ai_core/config.py -> ../../../.. == backend/
_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _THIS_DIR.parents[2]

load_dotenv(_BACKEND_ROOT / ".env")


def _env_int(name: str, fallback: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def _env_float(name: str, fallback: float) -> float:
    raw = os.environ.get(name)
    if not raw:
        return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


def _documents_root() -> Path:
    raw = os.environ.get("DOCUMENTS_ROOT", "./data/documents")
    path = Path(raw)
    if path.is_absolute():
        return path
    return (_BACKEND_ROOT / raw).resolve()


def _database_url() -> str:
    """
    Spec §5/§6 documents SQLite as the default; that's still what you get if
    `DATABASE_URL` is unset (backend/data/notar-ai.db, matching the original
    TypeScript implementation's default exactly — same physical file, same
    location on disk). Set `DATABASE_URL` in backend/.env to point at Postgres
    instead (`postgresql+asyncpg://user:pass@host:port/dbname`) — this repo's
    local dev instance currently runs that way against a Docker container;
    see backend/README.md for how/why.
    """
    raw = os.environ.get("DATABASE_URL")
    if raw:
        return raw
    db_path = (_BACKEND_ROOT / "data" / "notar-ai.db").resolve()
    return f"sqlite+aiosqlite:///{db_path}"


@dataclass(frozen=True)
class Config:
    ollama_base_url: str
    ollama_model: str
    ollama_keep_alive: str
    ollama_timeout_ms: int
    classification_confidence_threshold: float
    port: int
    documents_root: Path
    database_url: str


config = Config(
    ollama_base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    ollama_model=os.environ.get("OLLAMA_MODEL", "llama3.2-vision:11b"),
    ollama_keep_alive=os.environ.get("OLLAMA_KEEP_ALIVE", "30m"),
    ollama_timeout_ms=_env_int("OLLAMA_TIMEOUT_MS", 60_000),
    # Confidence policy threshold, spec §4.4. Ship conservative/high until
    # this office's real-document accuracy is measured (spec's rollout note).
    classification_confidence_threshold=_env_float(
        "CLASSIFICATION_CONFIDENCE_THRESHOLD", 0.85
    ),
    port=_env_int("PORT", 3000),
    documents_root=_documents_root(),
    database_url=_database_url(),
)
