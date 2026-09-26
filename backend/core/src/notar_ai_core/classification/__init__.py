from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal, Optional, Union

from sqlalchemy import select as _select

from ..act_types import (
    get_document_type_or_throw,
    list_document_types_for_act_type,
    to_document_type_dto,
)
from ..cases import get_case_or_throw
from ..cases.compute_status import recompute_case_status
from ..db import get_session
from ..documents import get_document_buffer, get_document_or_throw, to_document_dto
from ..errors import AppError
from ..models import ClassificationResult, Document, DocumentReview
from ..types import ClassificationResultDTO, DocumentDTO
from .apply_policy import RawClassificationOutput, RequiredTypeForPolicy, apply_confidence_policy
from .config import classification_config
from .image_prep import UnsupportedDocumentError, prepare_image_for_classification
from .ollama_client import (
    OllamaChatResponse,
    OllamaMalformedResponseError,
    OllamaTimeoutError,
    OllamaUnavailableError,
    call_ollama_chat,
)
from .prompt_builder import CLASSIFICATION_JSON_SCHEMA, build_classification_messages
from .._time import to_iso_utc as _iso


def to_classification_result_dto(row: ClassificationResult) -> ClassificationResultDTO:
    return ClassificationResultDTO(
        id=row.id,
        document_id=row.document_id,
        # DTO field name (`predicted_required_document_type_id`) is the
        # frozen wire contract, spec §3.4 — the ORM attribute was renamed to
        # `predicted_document_type_id`, see models.py.
        predicted_required_document_type_id=row.predicted_document_type_id,
        predicted_type_code_raw=row.predicted_type_code_raw,
        confidence=row.confidence,
        alternative_type_code_raw=row.alternative_type_code_raw,
        reasoning=row.reasoning,
        decision=row.decision,  # type: ignore[arg-type]
        model_used=row.model_used,
        created_at=_iso(row.created_at),
    )


@dataclass
class ClassifyDocumentResult:
    document: DocumentDTO
    classification_result: Optional[ClassificationResultDTO]
    classification_error: Optional[str] = None


def _parse_model_output(raw_content: str) -> RawClassificationOutput:
    try:
        parsed = json.loads(raw_content)
    except (ValueError, TypeError) as err:
        raise OllamaMalformedResponseError(
            f"Model response was not valid JSON despite structured output: {err}"
        ) from err

    if (
        not isinstance(parsed, dict)
        or not isinstance(parsed.get("predicted_type_code"), str)
        or not isinstance(parsed.get("confidence"), (int, float))
        or isinstance(parsed.get("confidence"), bool)
        or not isinstance(parsed.get("reasoning"), str)
    ):
        raise OllamaMalformedResponseError("Model response JSON did not match the required classification schema")

    confidence = min(1.0, max(0.0, float(parsed["confidence"])))
    alternative = parsed.get("alternative_type_code")
    return RawClassificationOutput(
        predicted_type_code=parsed["predicted_type_code"],
        confidence=confidence,
        alternative_type_code=alternative if isinstance(alternative, str) else None,
        reasoning=parsed["reasoning"],
    )


async def classify_document(document_id: str) -> ClassifyDocumentResult:
    """
    Runs one classification attempt for a document (spec §3.4 / §4).
    Pipeline: load doc + case + act-type checklist -> normalize image (§4.3)
    -> call local Ollama -> apply confidence policy (§4.4) -> record
    classification_results row -> update document.status -> recompute case
    status (spec §2.7, last line: "the classification pipeline calls it
    too").

    On Ollama being unreachable/timing out, or the image being unusable
    (unsupported type, PDF rasterization failing), the document is left
    `pending_classification` and NO classification_results row is written —
    there was no model output to record, "never guess" (spec §4.4 row 3).
    The error is surfaced via `classification_error` for the caller (spec
    §3.3).
    """
    document_row = await get_document_or_throw(document_id)
    case_row = await get_case_or_throw(document_row.case_id)

    required_type_rows = await list_document_types_for_act_type(case_row.act_type_id)
    required_types = [to_document_type_dto(rt) for rt in required_type_rows]

    try:
        buffer = await get_document_buffer(document_id)
        image_base64 = await prepare_image_for_classification(buffer, document_row.mime_type)
    except Exception as err:  # noqa: BLE001
        message = (
            str(err)
            if isinstance(err, UnsupportedDocumentError)
            else f"Could not prepare document for classification: {err}"
        )
        return ClassifyDocumentResult(
            document=to_document_dto(document_row), classification_result=None, classification_error=message
        )

    try:
        raw_response: OllamaChatResponse = await call_ollama_chat(
            messages=build_classification_messages(required_types, image_base64),
            format=CLASSIFICATION_JSON_SCHEMA,
            options={"temperature": 0},
        )
    except (OllamaUnavailableError, OllamaTimeoutError) as err:
        return ClassifyDocumentResult(
            document=to_document_dto(document_row), classification_result=None, classification_error=str(err)
        )
    except Exception as err:  # noqa: BLE001
        return ClassifyDocumentResult(
            document=to_document_dto(document_row),
            classification_result=None,
            classification_error=f"Classification call failed: {err}",
        )

    try:
        output = _parse_model_output(raw_response.message.get("content", ""))
    except OllamaMalformedResponseError as err:
        return ClassifyDocumentResult(
            document=to_document_dto(document_row), classification_result=None, classification_error=str(err)
        )

    policy_result = apply_confidence_policy(
        output,
        [RequiredTypeForPolicy(id=rt.id, code=rt.code) for rt in required_types],
        classification_config.confidence_threshold,
    )

    async with get_session() as session:
        created_result = ClassificationResult(
            document_id=document_id,
            predicted_document_type_id=policy_result.matched_document_type_id,
            predicted_type_code_raw=output.predicted_type_code,
            confidence=output.confidence,
            alternative_type_code_raw=output.alternative_type_code,
            reasoning=output.reasoning,
            decision=policy_result.decision,
            model_used=classification_config.model,
            raw_response_json=json.dumps(raw_response.raw),
        )
        session.add(created_result)

        document_row2 = await session.get(Document, document_id)
        assert document_row2 is not None
        document_row2.status = policy_result.document_status
        document_row2.matched_document_type_id = policy_result.matched_document_type_id

        await session.commit()
        await session.refresh(created_result)
        await session.refresh(document_row2)

        result_dto = to_classification_result_dto(created_result)
        document_dto = to_document_dto(document_row2)

    await recompute_case_status(document_row.case_id)

    return ClassifyDocumentResult(document=document_dto, classification_result=result_dto)


@dataclass
class ConfirmReview:
    decision: Literal["confirm"] = "confirm"


@dataclass
class ReassignReview:
    required_document_type_id: str
    decision: Literal["reassign"] = "reassign"


@dataclass
class RejectReview:
    note: Optional[str] = None
    decision: Literal["reject"] = "reject"


ReviewDecisionInput = Union[ConfirmReview, ReassignReview, RejectReview]


async def review_classification(
    document_id: str,
    input: ReviewDecisionInput,
    reviewed_by: Optional[str] = None,
) -> DocumentDTO:
    """
    POST /api/v1/cases/{caseId}/documents/{documentId}/review — the
    human-in-the-loop half of the confidence policy (spec §3.4/§4.4): a human
    always resolves `needs_review` here, nothing moves straight from
    uncertain to ready-to-sign automatically.

    Also writes a `document_reviews` audit row (Phase A of the feedback
    -learning design) capturing the prior/final matched type, which
    classification attempt (if any) was being reviewed, and who/when decided
    it. Written in the same DB transaction as the `documents` update so the
    two writes never diverge. This is audit capture only — it does not
    change classification behavior.
    """
    document_row = await get_document_or_throw(document_id)
    prior_document_type_id = document_row.matched_document_type_id

    matched_document_type_id: Optional[str] = document_row.matched_document_type_id
    new_status: str

    if isinstance(input, ConfirmReview):
        if not document_row.matched_document_type_id:
            raise AppError.bad_request(
                "cannot_confirm_unmatched_document",
                "This document has no predicted document type to confirm — use 'reassign' instead",
            )
        new_status = "confirmed"
    elif isinstance(input, ReassignReview):
        case_row = await get_case_or_throw(document_row.case_id)
        # `input.required_document_type_id` is the frozen wire field name
        # (spec §3.4's reassign request body) — see the ReassignReview
        # dataclass below.
        document_type = await get_document_type_or_throw(input.required_document_type_id)
        if document_type.act_type_id != case_row.act_type_id:
            raise AppError.bad_request(
                "required_document_type_mismatch",
                "This required document type does not belong to the case's act type",
            )
        matched_document_type_id = document_type.id
        new_status = "confirmed"
    elif isinstance(input, RejectReview):
        matched_document_type_id = None
        new_status = "rejected"
    else:  # pragma: no cover - defensive, mirrors the TS implementation's default branch
        raise AppError.bad_request("invalid_review_decision", "decision must be confirm, reassign, or reject")

    async with get_session() as session:
        latest_result = await session.execute(
            _select(ClassificationResult.id)
            .where(ClassificationResult.document_id == document_id)
            .order_by(ClassificationResult.created_at.desc())
            .limit(1)
        )
        latest_classification_result_id = latest_result.scalar_one_or_none()

        doc = await session.get(Document, document_id)
        assert doc is not None
        doc.status = new_status
        doc.matched_document_type_id = matched_document_type_id

        session.add(
            DocumentReview(
                document_id=document_id,
                classification_result_id=latest_classification_result_id,
                decision=input.decision,
                prior_document_type_id=prior_document_type_id,
                final_document_type_id=matched_document_type_id,
                note=input.note if isinstance(input, RejectReview) else None,
                reviewed_by=reviewed_by,
            )
        )

        await session.commit()
        await session.refresh(doc)
        document_dto = to_document_dto(doc)

    await recompute_case_status(document_row.case_id)
    return document_dto
