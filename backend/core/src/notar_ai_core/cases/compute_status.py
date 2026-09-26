"""
The single place the §2.7 derivation rules live. Both the REST status
endpoints (and any future MCP status endpoint) call `get_case_status`/
`recompute_case_status`, and so does the classification pipeline after it
records a result (spec §2.7, last line).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy import select

from ..db import get_session
from ..errors import AppError
from ..models import Case, ChecklistOverride, ClassificationResult, Document, DocumentType
from ..types import CaseStatusDTO, ChecklistItemStatus, ChecklistItemStatusDTO, OverallStatus, OverrideStatus


@dataclass
class RequiredTypeRow:
    id: str
    code: str
    name: str
    is_mandatory: bool


@dataclass
class DocumentRow:
    id: str
    matched_document_type_id: Optional[str]
    status: str


@dataclass
class OverrideRow:
    document_type_id: str
    override_status: str
    set_at: datetime


@dataclass
class _LatestConfidence:
    document_id: str
    confidence: float


@dataclass
class ChecklistItemResult:
    status: ChecklistItemStatus
    matched_document_id: Optional[str]


def compute_checklist_item_status(
    required_type: RequiredTypeRow,
    documents: Sequence[DocumentRow],
    latest_override: Optional[OverrideRow],
) -> ChecklistItemResult:
    """
    Pure derivation, spec §2.7:

    1. A `checklist_overrides` row for this pair wins, full stop.
    2. Else a matched document with status in (classified_auto, confirmed) -> received.
    3. Else a matched document with status needs_review -> pending_review.
    4. Else -> missing.

    Kept as a standalone pure function (no DB access) so it's directly
    unit-testable against the §2.7 table without spinning up a real DB.
    """
    if latest_override is not None:
        # An override can substitute for a document match entirely (e.g.
        # "not_applicable" with no scan ever uploaded), so there's no
        # document to point to purely from the override itself.
        matched_document_id = next(
            (
                d.id
                for d in documents
                if d.matched_document_type_id == required_type.id
                and d.status in ("classified_auto", "confirmed")
            ),
            None,
        )
        return ChecklistItemResult(
            status=latest_override.override_status,  # type: ignore[arg-type]
            matched_document_id=matched_document_id,
        )

    matched_for_type = [d for d in documents if d.matched_document_type_id == required_type.id]

    received = next((d for d in matched_for_type if d.status in ("classified_auto", "confirmed")), None)
    if received:
        return ChecklistItemResult(status="received", matched_document_id=received.id)

    pending_review = next((d for d in matched_for_type if d.status == "needs_review"), None)
    if pending_review:
        return ChecklistItemResult(status="pending_review", matched_document_id=pending_review.id)

    return ChecklistItemResult(status="missing", matched_document_id=None)


def compute_overall_status(items: Sequence[tuple[bool, ChecklistItemStatus]]) -> OverallStatus:
    """
    Case-level `overall_status`, spec §2.7:
    - `ready_to_sign` iff every mandatory required type resolves to `received` or `not_applicable`.
    - otherwise `pending_review` if any mandatory item is `pending_review` (worse of the two blockers reported).
    - otherwise `missing_documents`.

    `items` is a sequence of (is_mandatory, status) pairs.
    """
    mandatory = [item for item in items if item[0]]
    all_satisfied = all(status in ("received", "not_applicable") for _, status in mandatory)
    if all_satisfied:
        return "ready_to_sign"

    has_pending_review = any(status == "pending_review" for _, status in mandatory)
    if has_pending_review:
        return "pending_review"

    return "missing_documents"


def _pick_latest_overrides(overrides: Sequence[OverrideRow]) -> dict[str, OverrideRow]:
    latest: dict[str, OverrideRow] = {}
    for o in overrides:
        existing = latest.get(o.document_type_id)
        if existing is None or o.set_at > existing.set_at:
            latest[o.document_type_id] = o
    return latest


async def _build_case_status(case_id: str) -> CaseStatusDTO:
    async with get_session() as session:
        case_row = await session.get(Case, case_id)
        if case_row is None:
            raise AppError.not_found("case_not_found", f"Case {case_id} not found")

        required_types_result = await session.execute(
            select(DocumentType)
            .where(DocumentType.act_type_id == case_row.act_type_id)
            .order_by(DocumentType.sort_order.asc())
        )
        required_types = required_types_result.scalars().all()

        documents_result = await session.execute(select(Document).where(Document.case_id == case_id))
        documents = documents_result.scalars().all()

        overrides_result = await session.execute(
            select(ChecklistOverride).where(ChecklistOverride.case_id == case_id)
        )
        overrides = overrides_result.scalars().all()

        document_ids = [d.id for d in documents]
        latest_confidence_by_document: dict[str, _LatestConfidence] = {}
        if document_ids:
            classifications_result = await session.execute(
                select(ClassificationResult)
                .where(ClassificationResult.document_id.in_(document_ids))
                .order_by(ClassificationResult.created_at.desc())
            )
            for c in classifications_result.scalars().all():
                if c.document_id not in latest_confidence_by_document:
                    latest_confidence_by_document[c.document_id] = _LatestConfidence(
                        document_id=c.document_id, confidence=c.confidence
                    )

    override_rows = [
        OverrideRow(document_type_id=o.document_type_id, override_status=o.override_status, set_at=o.set_at)
        for o in overrides
    ]
    latest_overrides = _pick_latest_overrides(override_rows)
    document_rows = [
        DocumentRow(id=d.id, matched_document_type_id=d.matched_document_type_id, status=d.status)
        for d in documents
    ]

    checklist: list[ChecklistItemStatusDTO] = []
    for rt in required_types:
        rt_row = RequiredTypeRow(id=rt.id, code=rt.code, name=rt.name, is_mandatory=rt.is_mandatory)
        result = compute_checklist_item_status(rt_row, document_rows, latest_overrides.get(rt.id))
        confidence = None
        if result.matched_document_id:
            latest = latest_confidence_by_document.get(result.matched_document_id)
            confidence = latest.confidence if latest else None
        checklist.append(
            ChecklistItemStatusDTO(
                required_document_type_id=rt.id,
                code=rt.code,
                name=rt.name,
                is_mandatory=rt.is_mandatory,
                status=result.status,
                matched_document_id=result.matched_document_id,
                confidence=confidence,
            )
        )

    overall_status = compute_overall_status([(i.is_mandatory, i.status) for i in checklist])
    missing_mandatory = [i.code for i in checklist if i.is_mandatory and i.status == "missing"]
    pending_review_count = sum(1 for i in checklist if i.status == "pending_review")

    return CaseStatusDTO(
        case_id=case_id,
        overall_status=overall_status,
        checklist=checklist,
        missing_mandatory=missing_mandatory,
        pending_review_count=pending_review_count,
    )


async def get_case_status(case_id: str) -> CaseStatusDTO:
    """GET /api/v1/cases/{caseId}/status — read-only, does not persist."""
    return await _build_case_status(case_id)


async def recompute_case_status(case_id: str) -> CaseStatusDTO:
    """
    POST /api/v1/cases/{caseId}/validate, and called internally after every
    mutation that can change checklist status (upload, classify, review,
    override) — recomputes and persists `cases.status` (spec §2.3/§2.7/§3.6).
    """
    result = await _build_case_status(case_id)
    async with get_session() as session:
        case_row = await session.get(Case, case_id)
        assert case_row is not None
        case_row.status = result.overall_status
        await session.commit()
    return result
