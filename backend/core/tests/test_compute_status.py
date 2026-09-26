"""Port of test/computeStatus.test.ts."""

from __future__ import annotations

from datetime import datetime, timezone

from notar_ai_core.cases.compute_status import (
    DocumentRow,
    OverrideRow,
    RequiredTypeRow,
    compute_checklist_item_status,
    compute_overall_status,
)


def required_type(**overrides) -> RequiredTypeRow:
    defaults = dict(id="rt-1", code="extras_cf", name="Extras CF", is_mandatory=True)
    defaults.update(overrides)
    return RequiredTypeRow(**defaults)


def doc(**overrides) -> DocumentRow:
    defaults = dict(id="doc-1", matched_document_type_id="rt-1", status="classified_auto")
    defaults.update(overrides)
    return DocumentRow(**defaults)


def override(**overrides) -> OverrideRow:
    defaults = dict(document_type_id="rt-1", override_status="not_applicable", set_at=datetime.now(timezone.utc))
    defaults.update(overrides)
    return OverrideRow(**defaults)


class TestComputeChecklistItemStatus:
    def test_rule1_override_always_wins(self):
        result = compute_checklist_item_status(
            required_type(), [doc(status="classified_auto")], override(override_status="missing")
        )
        assert result.status == "missing"

    def test_rule2_classified_auto_is_received(self):
        result = compute_checklist_item_status(required_type(), [doc(status="classified_auto")], None)
        assert result.status == "received"
        assert result.matched_document_id == "doc-1"

    def test_rule2_confirmed_is_received(self):
        result = compute_checklist_item_status(required_type(), [doc(status="confirmed")], None)
        assert result.status == "received"

    def test_rule3_needs_review_is_pending_review(self):
        result = compute_checklist_item_status(required_type(), [doc(status="needs_review")], None)
        assert result.status == "pending_review"
        assert result.matched_document_id == "doc-1"

    def test_rule4_no_matching_document_is_missing(self):
        result = compute_checklist_item_status(required_type(), [], None)
        assert result.status == "missing"
        assert result.matched_document_id is None

    def test_rule4_documents_for_different_type_is_missing(self):
        result = compute_checklist_item_status(
            required_type(), [doc(matched_document_type_id="rt-2", status="classified_auto")], None
        )
        assert result.status == "missing"

    def test_rejected_document_does_not_count(self):
        result = compute_checklist_item_status(required_type(), [doc(status="rejected")], None)
        assert result.status == "missing"

    def test_prefers_received_over_pending_review(self):
        result = compute_checklist_item_status(
            required_type(),
            [doc(id="doc-blurry", status="needs_review"), doc(id="doc-good", status="confirmed")],
            None,
        )
        assert result.status == "received"
        assert result.matched_document_id == "doc-good"

    def test_override_received_with_no_document_at_all(self):
        result = compute_checklist_item_status(required_type(), [], override(override_status="received"))
        assert result.status == "received"
        assert result.matched_document_id is None


class TestComputeOverallStatus:
    def test_ready_to_sign_iff_all_mandatory_received_or_na(self):
        status = compute_overall_status(
            [(True, "received"), (True, "not_applicable"), (False, "missing")]  # non-mandatory never blocks
        )
        assert status == "ready_to_sign"

    def test_missing_documents_when_mandatory_missing_and_nothing_pending(self):
        status = compute_overall_status([(True, "received"), (True, "missing")])
        assert status == "missing_documents"

    def test_pending_review_when_mandatory_awaits_review(self):
        # spec §2.7: pending_review and missing_documents can co-occur; report
        # whichever is worse -> pending_review wins the summary tag.
        status = compute_overall_status([(True, "missing"), (True, "pending_review")])
        assert status == "pending_review"

    def test_nonmandatory_pending_review_never_blocks_ready_to_sign(self):
        status = compute_overall_status([(True, "received"), (False, "pending_review")])
        assert status == "ready_to_sign"

    def test_zero_mandatory_documents_is_ready_to_sign(self):
        status = compute_overall_status([(False, "missing")])
        assert status == "ready_to_sign"
