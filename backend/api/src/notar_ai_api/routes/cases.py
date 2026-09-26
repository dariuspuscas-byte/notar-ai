from typing import Any, Optional, get_args

from fastapi import APIRouter, Request
from notar_ai_core import (
    AppError,
    CreateCaseInput,
    UpdateCaseInput,
    OverallStatus,
    create_case,
    get_case,
    get_case_status,
    list_cases,
    recompute_case_status,
    update_case,
)

from ..util import json_body

router = APIRouter()

VALID_OVERALL_STATUSES: tuple[str, ...] = get_args(OverallStatus)


@router.post("/cases", status_code=201, response_model=None)
async def post_case(request: Request) -> Any:
    """POST /api/v1/cases — spec §3.2"""
    body = await json_body(request)
    act_type_id: Optional[str] = body.get("act_type_id")
    client_name: Optional[str] = body.get("client_name")
    notes = body.get("notes")
    created_by = body.get("created_by")
    if not act_type_id:
        raise AppError.bad_request("invalid_act_type_id", "act_type_id is required")
    created = await create_case(
        CreateCaseInput(act_type_id=act_type_id, client_name=client_name or "", notes=notes, created_by=created_by)
    )
    return created


@router.get("/cases", response_model=None)
async def get_cases(status: Optional[str] = None) -> Any:
    """GET /api/v1/cases?status=... — spec §3.2"""
    if status and status not in VALID_OVERALL_STATUSES:
        raise AppError.bad_request(
            "invalid_status_filter", f"status must be one of {', '.join(VALID_OVERALL_STATUSES)}"
        )
    items = await list_cases(status)
    return {"items": items}


@router.get("/cases/{case_id}", response_model=None)
async def get_case_by_id(case_id: str) -> Any:
    """GET /api/v1/cases/{caseId} — spec §3.2"""
    return await get_case(case_id)


@router.patch("/cases/{case_id}", response_model=None)
async def patch_case(case_id: str, request: Request) -> Any:
    """PATCH /api/v1/cases/{caseId} — spec §3.2. Only client_name/notes are
    updatable; other body fields (act_type_id, status, ...) are ignored."""
    body = await json_body(request)
    client_name = body.get("client_name")
    notes = body.get("notes")
    if client_name is not None and not isinstance(client_name, str):
        raise AppError.bad_request("invalid_client_name", "client_name must be a string")
    if notes is not None and not isinstance(notes, str):
        raise AppError.bad_request("invalid_notes", "notes must be a string")
    return await update_case(case_id, UpdateCaseInput(client_name=client_name, notes=notes))


@router.get("/cases/{case_id}/status", response_model=None)
async def get_case_status_route(case_id: str) -> Any:
    """GET /api/v1/cases/{caseId}/status — spec §3.7"""
    return await get_case_status(case_id)


@router.post("/cases/{case_id}/validate", response_model=None)
async def post_case_validate(case_id: str) -> Any:
    """POST /api/v1/cases/{caseId}/validate — spec §3.6"""
    return await recompute_case_status(case_id)
