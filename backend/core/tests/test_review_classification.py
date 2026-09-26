"""
Port of test/reviewClassification.test.ts — the Phase A audit-trail addition
to `review_classification` (spec §2.8): every call writes a
`document_reviews` row alongside the `documents` update, capturing the
prior/final matched type, which classification attempt (if any) was being
reviewed, and who decided it. Audit capture only — classification itself is
exercised only enough to set up fixtures (see test_classify_document.py for
classification-pipeline coverage).
"""

from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image
from sqlalchemy import select

import notar_ai_core as core
from notar_ai_core.classification import ConfirmReview, ReassignReview, RejectReview
from notar_ai_core.db import get_session
from notar_ai_core.models import ActType, ClassificationResult, Document, DocumentReview, DocumentType

from .conftest import unique_code


def _jpeg_bytes() -> bytes:
    img = Image.new("RGB", (20, 20), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def make_case_with_two_required_types():
    async with get_session() as session:
        act_type = ActType(code=unique_code("test_act"), name="Test")
        session.add(act_type)
        await session.flush()
        required_type_a = DocumentType(
            act_type_id=act_type.id, code="type_a", name="Type A", is_mandatory=True, sort_order=1
        )
        required_type_b = DocumentType(
            act_type_id=act_type.id, code="type_b", name="Type B", is_mandatory=True, sort_order=2
        )
        session.add_all([required_type_a, required_type_b])
        await session.commit()
        await session.refresh(required_type_a)
        await session.refresh(required_type_b)

    created_case = await core.create_case(core.CreateCaseInput(act_type_id=act_type.id, client_name="Ion Popescu"))
    document = await core.upload_document(
        core.UploadDocumentInput(
            case_id=created_case.id, buffer=_jpeg_bytes(), original_filename="scan.jpg", mime_type="image/jpeg"
        )
    )
    return {
        "act_type": act_type,
        "required_type_a": required_type_a,
        "required_type_b": required_type_b,
        "case": created_case,
        "document": document,
    }


async def get_reviews(document_id: str) -> list[DocumentReview]:
    async with get_session() as session:
        result = await session.execute(select(DocumentReview).where(DocumentReview.document_id == document_id))
        return list(result.scalars().all())


@pytest.mark.asyncio
async def test_writes_review_row_with_null_classification_result_when_never_classified():
    fixtures = await make_case_with_two_required_types()
    document, required_type_a = fixtures["document"], fixtures["required_type_a"]

    # Document was never classified — matched_required_document_type_id starts null.
    assert document.matched_required_document_type_id is None

    updated = await core.review_classification(
        document.id,
        ReassignReview(required_document_type_id=required_type_a.id),
        "assistant@office.ro",
    )

    assert updated.status == "confirmed"
    assert updated.matched_required_document_type_id == required_type_a.id

    reviews = await get_reviews(document.id)
    assert len(reviews) == 1
    review = reviews[0]
    assert review.decision == "reassign"
    assert review.prior_document_type_id is None
    assert review.final_document_type_id == required_type_a.id
    assert review.classification_result_id is None
    assert review.reviewed_by == "assistant@office.ro"
    assert isinstance(review.reviewed_at, datetime)


@pytest.mark.asyncio
async def test_confirm_captures_prior_and_links_latest_classification_attempt():
    fixtures = await make_case_with_two_required_types()
    document, required_type_a = fixtures["document"], fixtures["required_type_a"]

    # Simulate a classification attempt having already run and matched type A
    # (bypassing the real Ollama call — classification pipeline itself is
    # covered by test_classify_document.py).
    async with get_session() as session:
        classification_result = ClassificationResult(
            document_id=document.id,
            predicted_document_type_id=required_type_a.id,
            predicted_type_code_raw="type_a",
            confidence=0.6,
            reasoning="test fixture",
            decision="needs_review",
            model_used="test-model",
            raw_response_json="{}",
        )
        session.add(classification_result)
        doc_row = await session.get(Document, document.id)
        doc_row.status = "needs_review"
        doc_row.matched_document_type_id = required_type_a.id
        await session.commit()
        await session.refresh(classification_result)

    updated = await core.review_classification(document.id, ConfirmReview(), "notary@office.ro")

    assert updated.status == "confirmed"
    assert updated.matched_required_document_type_id == required_type_a.id

    reviews = await get_reviews(document.id)
    review = reviews[0]
    assert review.decision == "confirm"
    assert review.prior_document_type_id == required_type_a.id
    assert review.final_document_type_id == required_type_a.id
    assert review.classification_result_id == classification_result.id
    assert review.reviewed_by == "notary@office.ro"


@pytest.mark.asyncio
async def test_reassign_flips_prior_to_final():
    fixtures = await make_case_with_two_required_types()
    document, required_type_a, required_type_b = (
        fixtures["document"],
        fixtures["required_type_a"],
        fixtures["required_type_b"],
    )

    async with get_session() as session:
        doc_row = await session.get(Document, document.id)
        doc_row.status = "needs_review"
        doc_row.matched_document_type_id = required_type_a.id
        await session.commit()

    updated = await core.review_classification(
        document.id, ReassignReview(required_document_type_id=required_type_b.id)
    )

    assert updated.matched_required_document_type_id == required_type_b.id

    reviews = await get_reviews(document.id)
    review = reviews[0]
    assert review.prior_document_type_id == required_type_a.id
    assert review.final_document_type_id == required_type_b.id
    assert review.reviewed_by is None


@pytest.mark.asyncio
async def test_reject_sets_final_to_null_and_persists_note():
    fixtures = await make_case_with_two_required_types()
    document, required_type_a = fixtures["document"], fixtures["required_type_a"]

    async with get_session() as session:
        doc_row = await session.get(Document, document.id)
        doc_row.status = "needs_review"
        doc_row.matched_document_type_id = required_type_a.id
        await session.commit()

    updated = await core.review_classification(document.id, RejectReview(note="Blurry, unreadable"))

    assert updated.status == "rejected"
    assert updated.matched_required_document_type_id is None

    reviews = await get_reviews(document.id)
    review = reviews[0]
    assert review.decision == "reject"
    assert review.prior_document_type_id == required_type_a.id
    assert review.final_document_type_id is None
    assert review.note == "Blurry, unreadable"


@pytest.mark.asyncio
async def test_links_to_most_recent_classification_attempt():
    fixtures = await make_case_with_two_required_types()
    document, required_type_a, required_type_b = (
        fixtures["document"],
        fixtures["required_type_a"],
        fixtures["required_type_b"],
    )

    async with get_session() as session:
        older = ClassificationResult(
            document_id=document.id,
            predicted_document_type_id=required_type_a.id,
            predicted_type_code_raw="type_a",
            confidence=0.5,
            reasoning="first attempt",
            decision="needs_review",
            model_used="test-model",
            raw_response_json="{}",
            created_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        session.add(older)
        newer = ClassificationResult(
            document_id=document.id,
            predicted_document_type_id=required_type_b.id,
            predicted_type_code_raw="type_b",
            confidence=0.6,
            reasoning="retry attempt",
            decision="needs_review",
            model_used="test-model",
            raw_response_json="{}",
        )
        session.add(newer)
        doc_row = await session.get(Document, document.id)
        doc_row.status = "needs_review"
        doc_row.matched_document_type_id = required_type_b.id
        await session.commit()
        await session.refresh(newer)

    await core.review_classification(document.id, ConfirmReview())

    reviews = await get_reviews(document.id)
    review = reviews[0]
    assert review.classification_result_id == newer.id
