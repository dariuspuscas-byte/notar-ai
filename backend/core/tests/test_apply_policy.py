"""Port of test/applyPolicy.test.ts."""

from __future__ import annotations

from notar_ai_core.classification.apply_policy import (
    RawClassificationOutput,
    RequiredTypeForPolicy,
    apply_confidence_policy,
)

REQUIRED_TYPES = [
    RequiredTypeForPolicy(id="rt-extras-cf", code="extras_cf"),
    RequiredTypeForPolicy(id="rt-cert-fiscal", code="certificat_fiscal"),
]

THRESHOLD = 0.85


def output(**overrides) -> RawClassificationOutput:
    defaults = dict(
        predicted_type_code="extras_cf",
        confidence=0.95,
        alternative_type_code=None,
        reasoning="Header reads 'Extras de Carte Funciara'.",
    )
    defaults.update(overrides)
    return RawClassificationOutput(**defaults)


def test_row1_known_type_above_threshold_auto_accepts():
    result = apply_confidence_policy(output(confidence=0.95), REQUIRED_TYPES, THRESHOLD)
    assert result.decision == "auto_accepted"
    assert result.document_status == "classified_auto"
    assert result.matched_document_type_id == "rt-extras-cf"


def test_row1_boundary_exactly_equal_to_threshold_auto_accepts():
    result = apply_confidence_policy(output(confidence=THRESHOLD), REQUIRED_TYPES, THRESHOLD)
    assert result.decision == "auto_accepted"


def test_row2_known_type_below_threshold_needs_review_still_matches():
    result = apply_confidence_policy(output(confidence=THRESHOLD - 0.01), REQUIRED_TYPES, THRESHOLD)
    assert result.decision == "needs_review"
    assert result.document_status == "needs_review"
    assert result.matched_document_type_id == "rt-extras-cf"


def test_row2_unknown_predicted_code_needs_review_no_match():
    result = apply_confidence_policy(
        output(predicted_type_code="unknown", confidence=0.99), REQUIRED_TYPES, THRESHOLD
    )
    assert result.decision == "needs_review"
    assert result.matched_document_type_id is None


def test_row2_code_outside_closed_list_needs_review_no_match():
    result = apply_confidence_policy(
        output(predicted_type_code="some_unrecognized_code", confidence=0.99), REQUIRED_TYPES, THRESHOLD
    )
    assert result.decision == "needs_review"
    assert result.matched_document_type_id is None


def test_high_confidence_never_overrides_unmapped_code():
    result = apply_confidence_policy(
        output(predicted_type_code="unknown", confidence=1.0), REQUIRED_TYPES, THRESHOLD
    )
    assert result.decision == "needs_review"


def test_conservative_rollout_very_high_threshold():
    result = apply_confidence_policy(output(confidence=0.94), REQUIRED_TYPES, 0.99)
    assert result.decision == "needs_review"
    assert result.matched_document_type_id == "rt-extras-cf"


def test_threshold_zero_auto_accepts_any_confidence():
    result = apply_confidence_policy(output(confidence=0), REQUIRED_TYPES, 0)
    assert result.decision == "auto_accepted"


def test_never_produces_rejected_unknown():
    scenarios = [
        output(predicted_type_code="unknown", confidence=0),
        output(predicted_type_code="unknown", confidence=1),
        output(predicted_type_code="extras_cf", confidence=0),
        output(predicted_type_code="garbage", confidence=0.5),
    ]
    for scenario in scenarios:
        result = apply_confidence_policy(scenario, REQUIRED_TYPES, THRESHOLD)
        assert result.decision != "rejected_unknown"
