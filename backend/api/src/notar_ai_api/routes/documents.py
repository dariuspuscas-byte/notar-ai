from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Request
from notar_ai_core import (
    AppError,
    UploadDocumentInput,
    classify_document,
    list_documents,
    review_classification,
    upload_document_and_classify,
)
from notar_ai_core.classification import ConfirmReview, ReassignReview, RejectReview, ReviewDecisionInput
from starlette.datastructures import UploadFile

from ..util import json_body

router = APIRouter()

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB per file, generous for a phone photo/scan


@router.post("/cases/{case_id}/documents", status_code=201, response_model=None)
async def post_documents(case_id: str, request: Request) -> Any:
    """
    POST /api/v1/cases/{caseId}/documents — spec §3.3.
    Accepts the `files` (or `files[]`) multipart field, one or more files.
    Classification runs synchronously per file (spec §3.3's default); a
    per-file failure is reported via `classification_error` and never fails
    the whole request — the upload itself always succeeds if the file is
    saved.
    """
    form = await request.form()
    files = [
        value
        for key, value in form.multi_items()
        if key in ("files", "files[]") and isinstance(value, UploadFile)
    ]
    if not files:
        raise AppError.bad_request("no_files_uploaded", "At least one file is required in the 'files' field")

    uploaded_by_raw = form.get("uploaded_by")
    uploaded_by = uploaded_by_raw if isinstance(uploaded_by_raw, str) else None

    items = []
    for file in files:
        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise AppError.bad_request("upload_limit_file_size", f"File {file.filename} exceeds the 25MB upload limit")
        result = await upload_document_and_classify(
            UploadDocumentInput(
                case_id=case_id,
                buffer=data,
                original_filename=file.filename or "upload",
                mime_type=file.content_type or "application/octet-stream",
                uploaded_by=uploaded_by,
            )
        )
        item = asdict(result.document)
        if result.classification_error:
            item["classification_error"] = result.classification_error
        items.append(item)
    return {"items": items}


@router.get("/cases/{case_id}/documents", response_model=None)
async def get_documents(case_id: str) -> Any:
    """GET /api/v1/cases/{caseId}/documents — spec §3.3"""
    items = await list_documents(case_id)
    return {"items": items}


@router.post("/cases/{case_id}/documents/{document_id}/classify", response_model=None)
async def post_classify(case_id: str, document_id: str) -> Any:
    """POST /api/v1/cases/{caseId}/documents/{documentId}/classify — spec §3.4"""
    result = await classify_document(document_id)
    response = {
        "document": result.document,
        "classification_result": result.classification_result,
    }
    if result.classification_error:
        response["classification_error"] = result.classification_error
    return response


@router.post("/cases/{case_id}/documents/{document_id}/review", response_model=None)
async def post_review(case_id: str, document_id: str, request: Request) -> Any:
    """POST /api/v1/cases/{caseId}/documents/{documentId}/review — spec §3.4"""
    body = await json_body(request)
    decision = body.get("decision")

    input: ReviewDecisionInput
    if decision == "confirm":
        input = ConfirmReview()
    elif decision == "reassign":
        required_document_type_id = body.get("required_document_type_id")
        if not required_document_type_id:
            raise AppError.bad_request(
                "missing_required_document_type_id",
                "required_document_type_id is required for decision 'reassign'",
            )
        input = ReassignReview(required_document_type_id=required_document_type_id)
    elif decision == "reject":
        input = RejectReview(note=body.get("note"))
    else:
        raise AppError.bad_request("invalid_review_decision", "decision must be confirm, reassign, or reject")

    reviewed_by_raw = body.get("reviewed_by")
    reviewed_by = reviewed_by_raw if isinstance(reviewed_by_raw, str) else None
    document = await review_classification(document_id, input, reviewed_by)
    return document
