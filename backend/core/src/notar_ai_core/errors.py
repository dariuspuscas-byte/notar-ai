"""
A single error type used across all `notar_ai_core` use-cases. Adapters
(api, and any future MCP adapter) translate this into their transport's error
shape — for REST that's specs/ARCHITECTURE.md §3.8:
`{ "error": { "code": "...", "message": "..." } }`.
"""

from __future__ import annotations


class AppError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status

    @staticmethod
    def not_found(code: str, message: str) -> "AppError":
        return AppError(code, message, 404)

    @staticmethod
    def bad_request(code: str, message: str) -> "AppError":
        return AppError(code, message, 400)

    @staticmethod
    def conflict(code: str, message: str) -> "AppError":
        return AppError(code, message, 409)
