"""
The confidence and ambiguity policy, spec §4.4 — "never silently auto-accept,
and start extra conservative here". Applied uniformly here and nowhere else,
per the spec's explicit instruction that this table lives in exactly one
place.

| predicted matches a known type AND confidence >= threshold | classified_auto | auto_accepted  | item -> received       |
| predicted matches a known type but confidence < threshold, | needs_review    | needs_review   | item -> pending_review |
|   or model returns unknown/unmapped code                  |                 |                |                        |

(The Ollama-unreachable/timeout/malformed-response row of the same table is
handled one level up in `classification/__init__.py`, since it's not a
function of the model's *output* — there is no output to apply this policy
to. That third row leaves the document `pending_classification` and never
calls this function.)

NOTE ON `classification_results.decision`'s third enum value
(`rejected_unknown`, spec §2.5): §4.4's table only ever produces
`auto_accepted` or `needs_review` from a model response, and §4.5 confirms an
unmapped/"unknown" guess is explicitly routed to the *needs_review* path
("never a hard rejection with no trace") — so nothing in the spec as written
currently triggers `rejected_unknown`. This function therefore never produces
it; treated as a spec ambiguity (flagged in the final report) rather than
guessed at.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ..types import ClassificationDecision, DocumentStatus


@dataclass(frozen=True)
class RawClassificationOutput:
    predicted_type_code: str
    confidence: float
    alternative_type_code: Optional[str]
    reasoning: str


@dataclass(frozen=True)
class RequiredTypeForPolicy:
    id: str
    code: str


@dataclass(frozen=True)
class AppliedPolicyResult:
    decision: ClassificationDecision
    document_status: DocumentStatus
    matched_document_type_id: Optional[str]


def apply_confidence_policy(
    output: RawClassificationOutput,
    required_types: list[RequiredTypeForPolicy],
    threshold: float,
) -> AppliedPolicyResult:
    matched_type = next((rt for rt in required_types if rt.code == output.predicted_type_code), None)

    if matched_type is not None and output.confidence >= threshold:
        return AppliedPolicyResult(
            decision="auto_accepted",
            document_status="classified_auto",
            matched_document_type_id=matched_type.id,
        )

    # Matches a known type but below threshold, OR "unknown"/unmapped code:
    # both land in needs_review per §4.4 row 2 and §4.5.
    return AppliedPolicyResult(
        decision="needs_review",
        document_status="needs_review",
        matched_document_type_id=matched_type.id if matched_type else None,
    )
