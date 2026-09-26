from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from .._time import to_iso_utc as _iso
from ..db import get_session
from ..errors import AppError
from ..models import Case
from ..types import CaseDTO, OverallStatus
from ..act_types import get_act_type_or_throw
from .compute_status import recompute_case_status


def to_case_dto(row: Case) -> CaseDTO:
    return CaseDTO(
        id=row.id,
        act_type_id=row.act_type_id,
        client_name=row.client_name,
        notes=row.notes,
        status=row.status,  # type: ignore[arg-type]
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        created_by=row.created_by,
    )


@dataclass
class CreateCaseInput:
    act_type_id: str
    client_name: str
    notes: Optional[str] = None
    created_by: Optional[str] = None


async def create_case(input: CreateCaseInput) -> CaseDTO:
    """POST /api/v1/cases"""
    if not input.client_name or not input.client_name.strip():
        raise AppError.bad_request("invalid_client_name", "client_name is required")
    await get_act_type_or_throw(input.act_type_id)

    async with get_session() as session:
        created = Case(
            act_type_id=input.act_type_id,
            client_name=input.client_name.strip(),
            notes=input.notes,
            created_by=input.created_by,
        )
        session.add(created)
        await session.commit()
        await session.refresh(created)
        case_id = created.id

    # Set the correct initial `status` immediately (e.g. an act type with no
    # mandatory documents would otherwise misreport as missing_documents).
    await recompute_case_status(case_id)

    async with get_session() as session:
        fresh = await session.get(Case, case_id)
        assert fresh is not None
        return to_case_dto(fresh)


@dataclass
class UpdateCaseInput:
    """Fields left as None are not changed. `act_type_id` is immutable (§2.3)
    and `status` is derived (§2.7), so neither is updatable here."""

    client_name: Optional[str] = None
    notes: Optional[str] = None


async def update_case(case_id: str, input: UpdateCaseInput) -> CaseDTO:
    """PATCH /api/v1/cases/{caseId}"""
    client_name: Optional[str] = None
    if input.client_name is not None:
        client_name = input.client_name.strip()
        if not client_name:
            raise AppError.bad_request("invalid_client_name", "client_name is required")

    async with get_session() as session:
        row = await session.get(Case, case_id)
        if row is None:
            raise AppError.not_found("case_not_found", f"Case {case_id} not found")
        if client_name is None and input.notes is None:
            return to_case_dto(row)
        if client_name is not None:
            row.client_name = client_name
        if input.notes is not None:
            row.notes = input.notes
        # Set explicitly: the column's `onupdate` only fires when an UPDATE is
        # emitted, which SQLAlchemy skips if the submitted values are unchanged.
        row.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(row)
        return to_case_dto(row)


async def get_case_or_throw(case_id: str) -> Case:
    async with get_session() as session:
        row = await session.get(Case, case_id)
        if row is None:
            raise AppError.not_found("case_not_found", f"Case {case_id} not found")
        return row


async def get_case(case_id: str) -> CaseDTO:
    """GET /api/v1/cases/{caseId}"""
    row = await get_case_or_throw(case_id)
    return to_case_dto(row)


async def list_cases(status: Optional[OverallStatus] = None) -> list[CaseDTO]:
    """GET /api/v1/cases?status=..."""
    async with get_session() as session:
        stmt = select(Case).order_by(Case.created_at.desc())
        if status:
            stmt = stmt.where(Case.status == status)
        result = await session.execute(stmt)
        rows = result.scalars().all()
        return [to_case_dto(r) for r in rows]
