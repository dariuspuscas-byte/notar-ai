"""
Filesystem read/write abstraction (spec §5). Callers never touch the
filesystem directly — this is the one implementation to swap for S3/object
storage later without changing any caller.

Blocking file I/O is offloaded to a worker thread via `asyncio.to_thread` so
callers (async use-case functions) never block the event loop on disk I/O.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

from .config import config

_UNSAFE_CHARS = re.compile(r"[/\\]")


def _resolve_within_root(relative_path: str) -> Path:
    root = config.documents_root.resolve()
    resolved = (root / relative_path).resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"Refusing to access path outside documents root: {relative_path}")
    return resolved


def build_document_relative_path(case_id: str, document_id: str, original_filename: str) -> str:
    """`backend/data/documents/{case_id}/{document_id}__{original_filename}` (spec §5)."""
    safe_name = _UNSAFE_CHARS.sub("_", original_filename)
    return str(Path(case_id) / f"{document_id}__{safe_name}")


def _save_sync(data: bytes, relative_path: str) -> None:
    full_path = _resolve_within_root(relative_path)
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(data)


def _read_sync(relative_path: str) -> bytes:
    full_path = _resolve_within_root(relative_path)
    return full_path.read_bytes()


def _remove_sync(relative_path: str) -> None:
    full_path = _resolve_within_root(relative_path)
    full_path.unlink(missing_ok=True)


async def save(data: bytes, relative_path: str) -> None:
    await asyncio.to_thread(_save_sync, data, relative_path)


async def read(relative_path: str) -> bytes:
    return await asyncio.to_thread(_read_sync, relative_path)


async def remove(relative_path: str) -> None:
    await asyncio.to_thread(_remove_sync, relative_path)
