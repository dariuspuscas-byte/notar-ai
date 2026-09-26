"""
Thin typed wrapper around Ollama's local HTTP API (spec §4.2/§4.3/§6 — "no
official SDK dependency needed"). This is the only file that knows Ollama's
wire format; everything else in `classification` works with plain Python
types. Uses `httpx.AsyncClient` (async, per the stack decision) so a slow
local model call never blocks the event loop.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from .config import classification_config


@dataclass
class OllamaChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str
    images: Optional[list[str]] = None


@dataclass
class OllamaChatResponse:
    model: str
    message: dict[str, Any]
    done: bool
    raw: dict[str, Any] = field(default_factory=dict)


class OllamaUnavailableError(Exception):
    pass


class OllamaTimeoutError(Exception):
    pass


class OllamaMalformedResponseError(Exception):
    pass


async def call_ollama_chat(
    messages: list[OllamaChatMessage],
    format: dict[str, Any],
    options: Optional[dict[str, Any]] = None,
    model: Optional[str] = None,
) -> OllamaChatResponse:
    """
    Calls Ollama's `POST /api/chat` (spec §4.3). Never raises anything but the
    three error types above, so `classification/__init__.py` can pattern
    -match on failure mode for the §4.4 "Ollama unreachable/timeout" row.
    """
    body = {
        "model": model or classification_config.model,
        "messages": [
            {"role": m.role, "content": m.content, **({"images": m.images} if m.images is not None else {})}
            for m in messages
        ],
        "format": format,
        "options": options,
        "keep_alive": classification_config.keep_alive,
        "stream": False,
    }

    timeout = httpx.Timeout(classification_config.timeout_ms / 1000)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{classification_config.ollama_base_url}/api/chat", json=body)
    except httpx.TimeoutException as err:
        raise OllamaTimeoutError(
            f"Ollama request timed out after {classification_config.timeout_ms}ms"
        ) from err
    except httpx.HTTPError as err:
        raise OllamaUnavailableError(
            f"Could not reach Ollama at {classification_config.ollama_base_url}: {err}"
        ) from err

    if response.status_code >= 400:
        raise OllamaUnavailableError(
            f"Ollama returned {response.status_code} {response.reason_phrase}: {response.text}"
        )

    try:
        json_body = response.json()
    except ValueError as err:
        raise OllamaMalformedResponseError(f"Ollama response was not valid JSON: {err}") from err

    return OllamaChatResponse(
        model=json_body.get("model", ""),
        message=json_body.get("message", {}),
        done=json_body.get("done", False),
        raw=json_body,
    )
