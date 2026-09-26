"""
SQLAlchemy 2.0 typed ORM models for every table in specs/ARCHITECTURE.md §2.
Ported 1:1 from the Prisma schema (backend/core/prisma/schema.prisma, now
removed) — same table names, same columns, same semantics. SQLite for MVP
(spec §5/§6), same physical file as the TypeScript build
(backend/data/notar-ai.db) unless DATABASE_URL is overridden.

Internal naming note: the `required_document_types` table/`RequiredDocumentType`
class were renamed to `document_types`/`DocumentType` (and FK columns/relationship
attributes renamed to match, dropping the redundant "required_" prefix — the
table already has an `is_mandatory` column that encodes actual requiredness, so
"required_document_type" as a table/concept name was misleading). This is an
internal-only rename: the public REST API's JSON field names and route
parameters are unchanged (e.g. `required_document_type_id` still appears on
the wire) — see notar_ai_core/types.py and each `to_*_dto` function, which is
now the explicit translation boundary between these internal names and the
frozen external contract. See specs/ARCHITECTURE.md §2.2 for the full note.

Contract-changing rename: `ActType.name_ro`/`ActType.name_en` and
`DocumentType.name_ro` were collapsed to a single `name` column (`name_en`
was never displayed and was dropped). The app is now English-only, so the
seeded `name` values are English. Unlike the rename above, this one DOES
change the public REST API's JSON field names: `name_ro`/`name_en` no longer
appear on the wire, `name` does. See specs/ARCHITECTURE.md §2.1/§2.2 and §3.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class ActType(Base):
    """
    Catalog of legal act types (sale-purchase, succession, etc). Spec §2.1.

    `status` replaced the former `is_active` boolean; legal values are
    `ActTypeStatus` in types.py (draft, in_progress, ready, completed).
    """

    __tablename__ = "act_types"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft", server_default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    document_types: Mapped[list["DocumentType"]] = relationship(back_populates="act_type")
    cases: Mapped[list["Case"]] = relationship(back_populates="act_type")


class DocumentType(Base):
    """
    The checklist items for a given act type. Spec §2.2.

    Named `DocumentType` (table `document_types`), not `RequiredDocumentType`
    (table `required_document_types`) as originally — `is_mandatory` below is
    what encodes whether a given row is actually required, so naming the
    whole concept "required" was redundant/misleading. See the module
    docstring.
    """

    __tablename__ = "document_types"
    __table_args__ = (Index("ix_document_types_act_type_code", "act_type_id", "code", unique=True),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    act_type_id: Mapped[str] = mapped_column(ForeignKey("act_types.id"), nullable=False)
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_multiple: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # JSON array of strings, e.g. ["carte funciara", "CF", "extras de carte funciara"]
    classification_hints: Mapped[str | None] = mapped_column(Text, nullable=True)

    act_type: Mapped["ActType"] = relationship(back_populates="document_types")
    matched_documents: Mapped[list["Document"]] = relationship(back_populates="matched_document_type")
    classification_results: Mapped[list["ClassificationResult"]] = relationship(
        back_populates="predicted_document_type"
    )
    checklist_overrides: Mapped[list["ChecklistOverride"]] = relationship(back_populates="document_type")
    document_reviews_as_final_match: Mapped[list["DocumentReview"]] = relationship(
        back_populates="final_document_type",
        foreign_keys="DocumentReview.final_document_type_id",
    )


class Case(Base):
    """
    A dossier for one client / one legal act in progress. Spec §2.3.

    `status` here stores the three §2.7 `overall_status` values
    (`ready_to_sign` | `missing_documents` | `pending_review`) rather than the
    original three-way `in_progress`/`ready_to_sign`/`blocked` draft — this is
    the enum rename §2.7 explicitly calls for. It is always derived/cached by
    `recompute_case_status`, never set directly by a client request.
    """

    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    act_type_id: Mapped[str] = mapped_column(ForeignKey("act_types.id"), nullable=False)
    client_name: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="missing_documents")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)

    act_type: Mapped["ActType"] = relationship(back_populates="cases")
    documents: Mapped[list["Document"]] = relationship(back_populates="case")
    checklist_overrides: Mapped[list["ChecklistOverride"]] = relationship(back_populates="case")


class Document(Base):
    """One uploaded file (photo, scan, PDF). Spec §2.4."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), nullable=False)
    matched_document_type_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_types.id"), nullable=True
    )
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    storage_path: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    # pending_classification | classified_auto | needs_review | confirmed | rejected
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending_classification")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(String, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="documents")
    matched_document_type: Mapped["DocumentType | None"] = relationship(
        back_populates="matched_documents"
    )
    classification_results: Mapped[list["ClassificationResult"]] = relationship(back_populates="document")
    reviews: Mapped[list["DocumentReview"]] = relationship(back_populates="document")


class ClassificationResult(Base):
    """
    Audit trail of every LLM classification attempt (kept even on retry —
    never overwritten, always appended). Spec §2.5.
    """

    __tablename__ = "classification_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    predicted_document_type_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_types.id"), nullable=True
    )
    predicted_type_code_raw: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    alternative_type_code_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    # auto_accepted | needs_review | rejected_unknown
    decision: Mapped[str] = mapped_column(String, nullable=False)
    model_used: Mapped[str] = mapped_column(String, nullable=False)
    # full API response content (JSON), for debugging/audit
    raw_response_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    document: Mapped["Document"] = relationship(back_populates="classification_results")
    predicted_document_type: Mapped["DocumentType | None"] = relationship(
        back_populates="classification_results"
    )
    document_reviews: Mapped[list["DocumentReview"]] = relationship(back_populates="classification_result")


class DocumentReview(Base):
    """
    Audit trail of every human review decision on a document's classification
    (confirm/reassign/reject) — the record a notary could point to for "who
    signed off on this document, and when." Spec §2.8 (feedback-learning
    design's Phase A). One row per call to `review_classification`, never
    overwritten.
    """

    __tablename__ = "document_reviews"
    __table_args__ = (
        Index("ix_document_reviews_final_document_type_id", "final_document_type_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    # The latest classification_results row for this document at review time,
    # if one exists (null if the document was never successfully classified,
    # e.g. the assistant matched it manually while Ollama was down).
    classification_result_id: Mapped[str | None] = mapped_column(
        ForeignKey("classification_results.id"), nullable=True
    )
    # confirm | reassign | reject
    decision: Mapped[str] = mapped_column(String, nullable=False)
    # What the document was matched to before this review.
    prior_document_type_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_types.id"), nullable=True
    )
    # What it's matched to after this review; null on reject.
    final_document_type_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_types.id"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    document: Mapped["Document"] = relationship(back_populates="reviews")
    classification_result: Mapped["ClassificationResult | None"] = relationship(back_populates="document_reviews")
    final_document_type: Mapped["DocumentType | None"] = relationship(
        back_populates="document_reviews_as_final_match",
        foreign_keys=[final_document_type_id],
    )


class ChecklistOverride(Base):
    """
    Manual human decisions that take precedence over (or substitute for)
    classification. Only the latest row per (case_id, document_type_id)
    is effective; history is kept by inserting new rows. Spec §2.6.
    """

    __tablename__ = "checklist_overrides"
    __table_args__ = (
        Index(
            "ix_checklist_overrides_case_document_type_set_at",
            "case_id",
            "document_type_id",
            "set_at",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), nullable=False)
    document_type_id: Mapped[str] = mapped_column(
        ForeignKey("document_types.id"), nullable=False
    )
    # received | missing | not_applicable
    override_status: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    set_by: Mapped[str | None] = mapped_column(String, nullable=True)
    set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    case: Mapped["Case"] = relationship(back_populates="checklist_overrides")
    document_type: Mapped["DocumentType"] = relationship(back_populates="checklist_overrides")
