"""
Shared domain types. SQLite has no native enum type, so the ORM models
(models.py) store these as plain strings — these Literal aliases are the
single source of truth for the legal values, checked at the boundaries (see
errors.py / validation in each use-case module).

Spec references: §2.3 (Case.status), §2.4 (Document.status),
§2.5 (ClassificationResult.decision), §2.6 (ChecklistOverride.overrideStatus),
§2.7 (derived checklist item status / overall_status).

DTOs are plain dataclasses (frozen) rather than Pydantic models: `core` is
framework-agnostic per spec §1.1/§1.3 ("api is a thin adapter... zero
business logic"), and FastAPI natively serializes stdlib dataclasses as JSON,
so no translation layer is needed at the API boundary. Field names are
already snake_case, matching the wire format in spec §3 exactly.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

# §2.1: act_types.status (replaced the former `is_active` boolean)
ActTypeStatus = Literal["draft", "in_progress", "ready", "completed"]

# §2.7: cases.status / GET .../status "overall_status" — enum renamed per §2.7's note.
OverallStatus = Literal["ready_to_sign", "missing_documents", "pending_review"]

# §2.4
DocumentStatus = Literal[
    "pending_classification",
    "classified_auto",
    "needs_review",
    "confirmed",
    "rejected",
]

# §2.5
ClassificationDecision = Literal["auto_accepted", "needs_review", "rejected_unknown"]

# §2.6
OverrideStatus = Literal["received", "missing", "not_applicable"]

# §2.7 per-checklist-item derived status
ChecklistItemStatus = Literal["received", "missing", "not_applicable", "pending_review"]

# §3.4 review decisions
ReviewDecision = Literal["confirm", "reassign", "reject"]


@dataclass(frozen=True)
class ActTypeDTO:
    id: str
    code: str
    name: str
    description: Optional[str]
    status: ActTypeStatus
    created_at: str


@dataclass(frozen=True)
class RequiredDocumentTypeDTO:
    id: str
    act_type_id: str
    code: str
    name: str
    description: Optional[str]
    is_mandatory: bool
    allow_multiple: bool
    sort_order: int
    classification_hints: list[str]


@dataclass(frozen=True)
class CaseDTO:
    id: str
    act_type_id: str
    client_name: str
    notes: Optional[str]
    status: OverallStatus
    created_at: str
    updated_at: str
    created_by: Optional[str]


@dataclass(frozen=True)
class DocumentDTO:
    """
    Note: `classification_error` (spec §3.3) is deliberately NOT a field here
    — `to_document_dto` never sets it, and TypeScript's `JSON.stringify`
    drops `undefined` fields entirely, so the field only ever appears in a
    wire response when an upload/classify actually failed. To reproduce that
    "present only on failure" behavior in Python (where a dataclass field
    would always serialize, even as `null`), the API route layer adds
    `classification_error` to the response dict conditionally instead of it
    living on this DTO — see notar_ai_api/routes/documents.py.
    """

    id: str
    case_id: str
    matched_required_document_type_id: Optional[str]
    original_filename: str
    mime_type: str
    file_size_bytes: int
    status: DocumentStatus
    uploaded_at: str
    uploaded_by: Optional[str]


@dataclass(frozen=True)
class ClassificationResultDTO:
    id: str
    document_id: str
    predicted_required_document_type_id: Optional[str]
    predicted_type_code_raw: str
    confidence: float
    alternative_type_code_raw: Optional[str]
    reasoning: str
    decision: ClassificationDecision
    model_used: str
    created_at: str


@dataclass(frozen=True)
class ChecklistOverrideDTO:
    id: str
    case_id: str
    required_document_type_id: str
    override_status: OverrideStatus
    note: Optional[str]
    set_by: Optional[str]
    set_at: str


@dataclass(frozen=True)
class ChecklistItemStatusDTO:
    required_document_type_id: str
    code: str
    name: str
    is_mandatory: bool
    status: ChecklistItemStatus
    matched_document_id: Optional[str]
    confidence: Optional[float]


@dataclass(frozen=True)
class CaseStatusDTO:
    case_id: str
    overall_status: OverallStatus
    checklist: list[ChecklistItemStatusDTO]
    missing_mandatory: list[str]
    pending_review_count: int
