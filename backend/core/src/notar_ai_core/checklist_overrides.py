from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, get_args

from .cases import get_case_or_throw
from .cases.compute_status import recompute_case_status
from .act_types import get_document_type_or_throw
from ._time import to_iso_utc as _iso
from .db import get_session
from .errors import AppError
from .models import ChecklistOverride
from .types import ChecklistOverrideDTO, OverrideStatus

VALID_STATUSES: tuple[str, ...] = get_args(OverrideStatus)


def to_checklist_override_dto(row: ChecklistOverride) -> ChecklistOverrideDTO:
    return ChecklistOverrideDTO(
        id=row.id,
        case_id=row.case_id,
        # DTO field name (`required_document_type_id`) is the frozen wire
        # contract, spec §3.5 — the ORM attribute was renamed to
        # `document_type_id`, see models.py.
        required_document_type_id=row.document_type_id,
        override_status=row.override_status,  # type: ignore[arg-type]
        note=row.note,
        set_by=row.set_by,
        set_at=_iso(row.set_at),
    )


@dataclass
class SetChecklistOverrideInput:
    case_id: str
    document_type_id: str
    override_status: str
    note: Optional[str] = None
    set_by: Optional[str] = None


async def set_checklist_override(input: SetChecklistOverrideInput) -> ChecklistOverrideDTO:
    """
    POST /api/v1/cases/{caseId}/checklist/{requiredDocumentTypeId}/override

    Inserts a new row rather than updating in place — only the latest row per
    (case_id, document_type_id) is effective, history is kept
    (spec §2.6). This alone makes V1 usable end-to-end with no AI (spec §8
    Phase 1 backend item 4).
    """
    if input.override_status not in VALID_STATUSES:
        raise AppError.bad_request(
            "invalid_override_status", f"override_status must be one of {', '.join(VALID_STATUSES)}"
        )
    case_row = await get_case_or_throw(input.case_id)
    document_type = await get_document_type_or_throw(input.document_type_id)
    if document_type.act_type_id != case_row.act_type_id:
        raise AppError.bad_request(
            "required_document_type_mismatch",
            "This required document type does not belong to the case's act type",
        )

    async with get_session() as session:
        created = ChecklistOverride(
            case_id=input.case_id,
            document_type_id=input.document_type_id,
            override_status=input.override_status,
            note=input.note,
            set_by=input.set_by,
        )
        session.add(created)
        await session.commit()
        await session.refresh(created)
        dto = to_checklist_override_dto(created)

    await recompute_case_status(input.case_id)
    return dto
