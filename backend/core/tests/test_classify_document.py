"""
Port of test/classifyDocument.test.ts — the classification pipeline's
graceful-degradation guarantee (spec §4.4 row 3: "Ollama unreachable/timeout
-> document stays pending_classification, never guess") and the happy path
(row 1: high confidence on a known type -> classified_auto / auto_accepted,
checklist item -> received, case -> ready_to_sign).

Runs against the shared throwaway SQLite database set up in conftest.py. The
Ollama HTTP call itself is mocked (via `unittest.mock.patch` on
`notar_ai_core.classification.call_ollama_chat`, the name imported into that
module's namespace) — this suite does not require Ollama or any model to be
running.
"""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, patch

import pytest
from PIL import Image

import notar_ai_core as core
from notar_ai_core.classification.ollama_client import (
    OllamaChatResponse,
    OllamaTimeoutError,
    OllamaUnavailableError,
)
from notar_ai_core.db import get_session
from notar_ai_core.models import ActType, ClassificationResult, DocumentType

from .conftest import unique_code


def _jpeg_bytes() -> bytes:
    img = Image.new("RGB", (20, 20), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def make_case_with_one_mandatory_doc():
    async with get_session() as session:
        act_type = ActType(code=unique_code("test_act"), name="Test")
        session.add(act_type)
        await session.flush()
        required_type = DocumentType(
            act_type_id=act_type.id,
            code="extras_cf",
            name="Extras de carte funciară",
            is_mandatory=True,
            sort_order=1,
        )
        session.add(required_type)
        await session.commit()
        await session.refresh(act_type)
        await session.refresh(required_type)

    created_case = await core.create_case(
        core.CreateCaseInput(act_type_id=act_type.id, client_name="Ion Popescu")
    )
    document = await core.upload_document(
        core.UploadDocumentInput(
            case_id=created_case.id,
            buffer=_jpeg_bytes(),
            original_filename="scan.jpg",
            mime_type="image/jpeg",
        )
    )
    return {"act_type": act_type, "required_type": required_type, "case": created_case, "document": document}


@pytest.mark.asyncio
async def test_unreachable_leaves_pending_classification_no_audit_row():
    fixtures = await make_case_with_one_mandatory_doc()
    document, case_row = fixtures["document"], fixtures["case"]

    with patch(
        "notar_ai_core.classification.call_ollama_chat",
        new=AsyncMock(side_effect=OllamaUnavailableError("connect ECONNREFUSED 127.0.0.1:11434")),
    ):
        result = await core.classify_document(document.id)

    assert result.classification_result is None
    assert result.classification_error
    assert result.document.status == "pending_classification"

    async with get_session() as session:
        from sqlalchemy import select

        rows = (
            await session.execute(select(ClassificationResult).where(ClassificationResult.document_id == document.id))
        ).scalars().all()
        assert len(rows) == 0

    status = await core.get_case_status(case_row.id)
    assert status.overall_status == "missing_documents"
    assert "extras_cf" in status.missing_mandatory


@pytest.mark.asyncio
async def test_timeout_leaves_document_untouched():
    fixtures = await make_case_with_one_mandatory_doc()
    document = fixtures["document"]

    with patch(
        "notar_ai_core.classification.call_ollama_chat",
        new=AsyncMock(side_effect=OllamaTimeoutError("Ollama request timed out after 60000ms")),
    ):
        result = await core.classify_document(document.id)

    assert result.classification_result is None
    assert result.document.status == "pending_classification"


@pytest.mark.asyncio
async def test_happy_path_auto_accepts_high_confidence_match():
    fixtures = await make_case_with_one_mandatory_doc()
    document, case_row = fixtures["document"], fixtures["case"]

    mock_response = OllamaChatResponse(
        model="llama3.2-vision:11b",
        done=True,
        message={
            "role": "assistant",
            "content": (
                '{"predicted_type_code": "extras_cf", "confidence": 0.95, '
                '"alternative_type_code": null, "reasoning": "Header reads \'Extras de Carte Funciara\'."}'
            ),
        },
        raw={},
    )

    with patch(
        "notar_ai_core.classification.call_ollama_chat", new=AsyncMock(return_value=mock_response)
    ):
        result = await core.classify_document(document.id)

    assert result.classification_error is None
    assert result.classification_result.decision == "auto_accepted"
    assert result.document.status == "classified_auto"

    status = await core.get_case_status(case_row.id)
    assert status.overall_status == "ready_to_sign"
    assert len(status.missing_mandatory) == 0


@pytest.mark.asyncio
async def test_low_confidence_routes_to_needs_review():
    fixtures = await make_case_with_one_mandatory_doc()
    document, case_row = fixtures["document"], fixtures["case"]

    mock_response = OllamaChatResponse(
        model="llama3.2-vision:11b",
        done=True,
        message={
            "role": "assistant",
            "content": (
                '{"predicted_type_code": "extras_cf", "confidence": 0.4, '
                '"alternative_type_code": null, "reasoning": "Blurry image, hard to read the header."}'
            ),
        },
        raw={},
    )

    with patch(
        "notar_ai_core.classification.call_ollama_chat", new=AsyncMock(return_value=mock_response)
    ):
        result = await core.classify_document(document.id)

    assert result.classification_result.decision == "needs_review"
    assert result.document.status == "needs_review"

    status = await core.get_case_status(case_row.id)
    assert status.overall_status == "pending_review"
    assert status.pending_review_count == 1
