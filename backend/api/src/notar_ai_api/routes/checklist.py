from typing import Any

from fastapi import APIRouter, Request
from notar_ai_core import AppError, SetChecklistOverrideInput, set_checklist_override

from ..util import json_body

router = APIRouter()


@router.post("/cases/{case_id}/checklist/{required_document_type_id}/override", response_model=None)
async def post_checklist_override(case_id: str, required_document_type_id: str, request: Request) -> Any:
    """POST /api/v1/cases/{caseId}/checklist/{requiredDocumentTypeId}/override — spec §3.5"""
    body = await json_body(request)
    override_status = body.get("override_status")
    if not override_status:
        raise AppError.bad_request("missing_override_status", "override_status is required")
    result = await set_checklist_override(
        SetChecklistOverrideInput(
            case_id=case_id,
            # Route path parameter name/URL is the frozen wire contract
            # (spec §3.5); `SetChecklistOverrideInput`'s field was renamed to
            # `document_type_id` internally, see checklist_overrides.py.
            document_type_id=required_document_type_id,
            override_status=override_status,
            note=body.get("note"),
            set_by=body.get("set_by"),
        )
    )
    return result
