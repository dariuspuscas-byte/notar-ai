from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select

from . import storage
from ._time import to_iso_utc as _iso
from .cases import get_case_or_throw
from .cases.compute_status import recompute_case_status
from .db import get_session
from .errors import AppError
from .models import Document
from .types import DocumentDTO


def to_document_dto(row: Document) -> DocumentDTO:
    return DocumentDTO(
        id=row.id,
        case_id=row.case_id,
        # DTO field name (`matched_required_document_type_id`) is the frozen
        # wire contract, spec §3.3 — the ORM attribute it reads from was
        # renamed to `matched_document_type_id`, see models.py.
        matched_required_document_type_id=row.matched_document_type_id,
        original_filename=row.original_filename,
        mime_type=row.mime_type,
        file_size_bytes=row.file_size_bytes,
        status=row.status,  # type: ignore[arg-type]
        uploaded_at=_iso(row.uploaded_at),
        uploaded_by=row.uploaded_by,
    )


@dataclass
class UploadDocumentInput:
    case_id: str
    buffer: bytes
    original_filename: str
    mime_type: str
    uploaded_by: Optional[str] = None


async def upload_document(input: UploadDocumentInput) -> DocumentDTO:
    """
    Persists one uploaded file: DB row + saved bytes. Deliberately does NOT
    trigger classification itself — `documents` depends only on DB + storage
    (spec §1.3's module table). The upload-then-classify sequencing required
    by spec §3.3 is composed one level up, in `upload_orchestrator.py`
    (`upload_document_and_classify`), which is free to depend on both modules.
    """
    await get_case_or_throw(input.case_id)

    document_id = str(uuid.uuid4())
    relative_path = storage.build_document_relative_path(input.case_id, document_id, input.original_filename)
    await storage.save(input.buffer, relative_path)

    async with get_session() as session:
        created = Document(
            id=document_id,
            case_id=input.case_id,
            original_filename=input.original_filename,
            storage_path=relative_path,
            mime_type=input.mime_type,
            file_size_bytes=len(input.buffer),
            status="pending_classification",
            uploaded_by=input.uploaded_by,
        )
        session.add(created)
        await session.commit()
        await session.refresh(created)
        dto = to_document_dto(created)

    await recompute_case_status(input.case_id)
    return dto


async def get_document_or_throw(document_id: str) -> Document:
    async with get_session() as session:
        row = await session.get(Document, document_id)
        if row is None:
            raise AppError.not_found("document_not_found", f"Document {document_id} not found")
        return row


async def list_documents(case_id: str) -> list[DocumentDTO]:
    """GET /api/v1/cases/{caseId}/documents"""
    await get_case_or_throw(case_id)
    async with get_session() as session:
        result = await session.execute(
            select(Document).where(Document.case_id == case_id).order_by(Document.uploaded_at.asc())
        )
        rows = result.scalars().all()
        return [to_document_dto(r) for r in rows]


async def get_document_buffer(document_id: str) -> bytes:
    row = await get_document_or_throw(document_id)
    return await storage.read(row.storage_path)
