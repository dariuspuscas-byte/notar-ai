"""Uniform error shape for every endpoint, spec §3.8."""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from notar_ai_core import AppError

logger = logging.getLogger("notar_ai_api")


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content={"error": {"code": exc.code, "message": exc.message}})


async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unexpected server error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "Unexpected server error"}},
    )
