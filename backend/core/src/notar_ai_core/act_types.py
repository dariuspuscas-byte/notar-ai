from __future__ import annotations

import json
from typing import cast

from sqlalchemy import select

from ._time import to_iso_utc as _iso
from .db import get_session
from .errors import AppError
from .models import ActType, DocumentType
from .types import ActTypeDTO, ActTypeStatus, RequiredDocumentTypeDTO


def to_act_type_dto(row: ActType) -> ActTypeDTO:
    return ActTypeDTO(
        id=row.id,
        code=row.code,
        name=row.name,
        description=row.description,
        status=cast(ActTypeStatus, row.status),
        created_at=_iso(row.created_at),
    )


def to_document_type_dto(row: DocumentType) -> RequiredDocumentTypeDTO:
    """
    Builds the wire DTO for a document type. The DTO class name
    (`RequiredDocumentTypeDTO`) is kept as-is (internal-only rename judgment
    call, same as the ORM class it reads from, `DocumentType`, formerly
    `RequiredDocumentType` — see models.py). Its `name` field, however, IS a
    wire contract change: `name_ro`/`name_en` were collapsed to `name`
    (Romanian content kept) — see the contract-changing-rename note in
    models.py and specs/ARCHITECTURE.md §2.1/§2.2/§3.
    """
    hints: list[str] = []
    if row.classification_hints:
        try:
            parsed = json.loads(row.classification_hints)
            if isinstance(parsed, list):
                hints = parsed
        except (ValueError, TypeError):
            hints = []
    return RequiredDocumentTypeDTO(
        id=row.id,
        act_type_id=row.act_type_id,
        code=row.code,
        name=row.name,
        description=row.description,
        is_mandatory=row.is_mandatory,
        allow_multiple=row.allow_multiple,
        sort_order=row.sort_order,
        classification_hints=hints,
    )


async def list_act_types() -> list[ActTypeDTO]:
    """GET /api/v1/act-types"""
    async with get_session() as session:
        result = await session.execute(
            select(ActType).order_by(ActType.name.asc())
        )
        rows = result.scalars().all()
        return [to_act_type_dto(r) for r in rows]


async def get_act_type_or_throw(act_type_id: str) -> ActType:
    async with get_session() as session:
        row = await session.get(ActType, act_type_id)
        if row is None:
            raise AppError.not_found("act_type_not_found", f"Act type {act_type_id} not found")
        return row


async def get_checklist(act_type_id: str) -> list[RequiredDocumentTypeDTO]:
    """GET /api/v1/act-types/{actTypeId}/checklist"""
    await get_act_type_or_throw(act_type_id)
    async with get_session() as session:
        result = await session.execute(
            select(DocumentType)
            .where(DocumentType.act_type_id == act_type_id)
            .order_by(DocumentType.sort_order.asc())
        )
        rows = result.scalars().all()
        return [to_document_type_dto(r) for r in rows]


async def list_document_types_for_act_type(act_type_id: str) -> list[DocumentType]:
    async with get_session() as session:
        result = await session.execute(
            select(DocumentType)
            .where(DocumentType.act_type_id == act_type_id)
            .order_by(DocumentType.sort_order.asc())
        )
        return list(result.scalars().all())


async def get_document_type_or_throw(id_: str) -> DocumentType:
    async with get_session() as session:
        row = await session.get(DocumentType, id_)
        if row is None:
            raise AppError.not_found(
                "required_document_type_not_found", f"Required document type {id_} not found"
            )
        return row
