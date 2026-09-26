from typing import Any

from fastapi import Request


async def json_body(request: Request) -> dict[str, Any]:
    """
    Parses the request body as JSON, tolerating an empty/missing body the
    same way Express's `req.body ?? {}` did in the TypeScript routes.
    """
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}
