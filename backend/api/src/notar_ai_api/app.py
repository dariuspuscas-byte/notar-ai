"""
FastAPI REST adapter (spec §1.1/§6). Thin: every route handler in `routes/*`
only parses/validates transport input and calls a `notar_ai_core` use-case
function — no business logic lives here.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from notar_ai_core import AppError

from .errors import app_error_handler, unhandled_error_handler
from .routes.act_types import router as act_types_router
from .routes.cases import router as cases_router
from .routes.checklist import router as checklist_router
from .routes.documents import router as documents_router


def create_app() -> FastAPI:
    app = FastAPI(title="notar-ai API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    base = "/api/v1"
    app.include_router(act_types_router, prefix=base)
    app.include_router(cases_router, prefix=base)
    app.include_router(documents_router, prefix=base)
    app.include_router(checklist_router, prefix=base)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
