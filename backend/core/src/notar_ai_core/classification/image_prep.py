"""
Turns an uploaded file's raw bytes into a single base64-encoded image ready
for Ollama's `images` array (spec §4.3).

- Images: downscaled so the long edge is ~1568px (don't feed full-res phone
  photos to a local model). Uses Pillow (equivalent to the TypeScript build's
  `sharp` usage).
- PDFs: rasterize page 1 only for MVP (the identifying header — document
  type, title, stamp — is almost always on the first page). Later pages are a
  known limitation, flagged in the README rather than redesigned now. Still
  shells out to `pdftoppm` (poppler) via `subprocess`, same external tool
  dependency as the TypeScript build.
"""

from __future__ import annotations

import asyncio
import base64
import io
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

from .config import classification_config


class UnsupportedDocumentError(Exception):
    pass


SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


def _downscale_image_sync(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as opened:
        rgb = opened.convert("RGB")
        edge = classification_config.max_image_edge_px
        rgb.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        rgb.save(out, format="JPEG", quality=85)
        return out.getvalue()


def _rasterize_pdf_first_page_sync(data: bytes) -> bytes:
    """
    Rasterizes page 1 of a PDF to PNG via the `pdftoppm` CLI (poppler-utils).
    Raises `UnsupportedDocumentError` if the tool isn't installed on this
    machine — that surfaces as a classification error and leaves the
    document `pending_classification` (spec §4.4's "never guess" row), which
    is preferable to silently failing in a more confusing way.
    """
    with tempfile.TemporaryDirectory(prefix="notar-ai-pdf-") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        input_path = tmp_dir / "input.pdf"
        output_prefix = tmp_dir / "page"
        input_path.write_bytes(data)
        try:
            subprocess.run(
                ["pdftoppm", "-png", "-f", "1", "-l", "1", "-r", "150", str(input_path), str(output_prefix)],
                check=True,
                capture_output=True,
            )
        except (OSError, subprocess.CalledProcessError) as err:
            raise UnsupportedDocumentError(
                f"Could not rasterize PDF page 1 (is 'pdftoppm' from poppler-utils installed?): {err}"
            ) from err

        # pdftoppm names single-page output either "page-1.png" or
        # "page-01.png" depending on version; find whatever it produced.
        page_file = next(
            (f for f in tmp_dir.iterdir() if f.name.startswith("page") and f.suffix == ".png"), None
        )
        if page_file is None:
            raise UnsupportedDocumentError("pdftoppm did not produce an output image")

        rasterized = page_file.read_bytes()
        return _downscale_image_sync(rasterized)


def _prepare_sync(data: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        prepared = _rasterize_pdf_first_page_sync(data)
    elif mime_type in SUPPORTED_IMAGE_TYPES:
        prepared = _downscale_image_sync(data)
    else:
        raise UnsupportedDocumentError(f"Unsupported mime type for classification: {mime_type}")
    return base64.b64encode(prepared).decode("ascii")


async def prepare_image_for_classification(data: bytes, mime_type: str) -> str:
    """
    :returns: base64-encoded, downscaled image bytes suitable for Ollama's
        `images` array (no `data:` prefix — Ollama expects raw base64).

    Pillow and the `pdftoppm` subprocess call are both blocking, so this work
    runs in a worker thread via `asyncio.to_thread` to keep the event loop
    free for concurrent requests.
    """
    return await asyncio.to_thread(_prepare_sync, data, mime_type)
