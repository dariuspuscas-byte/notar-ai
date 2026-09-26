"""rename required_document_types to document_types

Revision ID: d2b068edcaa2
Revises: 5f916f995ae0
Create Date: 2026-09-25 08:39:34.080604

Internal-only rename (specs/ARCHITECTURE.md §2.2): the `required_document_types`
table already had an `is_mandatory` column encoding actual requiredness, so
naming the whole table/concept "required" was redundant/misleading. Renames
the table, its FK columns on other tables, and its indexes to `document_type`
naming throughout. Does NOT touch the public REST API contract — DTO/response
JSON field names (e.g. `required_document_type_id`,
`matched_required_document_type_id`) are unchanged; the API layer maps them
explicitly to/from these renamed internal columns (see
notar_ai_core/act_types.py, documents.py, checklist_overrides.py,
classification/__init__.py).

Uses real ALTER TABLE / ALTER TABLE ... RENAME COLUMN statements (via
`op.execute`, since a plain `op.alter_column()` is not supported outside
`batch_alter_table` on the SQLite dialect) rather than drop-and-recreate.
Modern SQLite (3.25+; this project's SQLite is 3.50) supports both
`RENAME TO` and `RENAME COLUMN` natively, and automatically rewrites
dependent foreign-key clauses and index definitions in other tables when the
referenced table/column is renamed — verified empirically against a scratch
copy of this exact schema before writing this migration, and against the
real dev DB (see the rename task's report for the before/after row counts
per table proving no data was lost).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2b068edcaa2'
down_revision: Union[str, None] = '5f916f995ae0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- table rename ---
    # SQLite auto-updates FK clauses in `documents`, `classification_results`,
    # `document_reviews`, `checklist_overrides` that reference this table.
    op.execute("ALTER TABLE required_document_types RENAME TO document_types")

    # --- index rename to match (SQLite has no ALTER INDEX ... RENAME, so
    # drop + recreate under the new name) ---
    op.drop_index("ix_required_document_types_act_type_code", table_name="document_types")
    op.create_index(
        "ix_document_types_act_type_code", "document_types", ["act_type_id", "code"], unique=True
    )

    # --- column renames (SQLite auto-updates the FK "from" column and any
    # index definitions that reference the renamed column) ---
    op.execute(
        "ALTER TABLE documents RENAME COLUMN matched_required_document_type_id TO matched_document_type_id"
    )
    op.execute(
        "ALTER TABLE classification_results "
        "RENAME COLUMN predicted_required_document_type_id TO predicted_document_type_id"
    )
    op.execute(
        "ALTER TABLE document_reviews "
        "RENAME COLUMN prior_matched_required_document_type_id TO prior_document_type_id"
    )
    op.execute(
        "ALTER TABLE document_reviews "
        "RENAME COLUMN final_matched_required_document_type_id TO final_document_type_id"
    )
    op.execute(
        "ALTER TABLE checklist_overrides "
        "RENAME COLUMN required_document_type_id TO document_type_id"
    )

    # --- dependent index renames (columns above are already renamed, so
    # recreate under names matching both the new column and the new index name) ---
    op.drop_index(
        "ix_document_reviews_final_matched_required_document_type_id", table_name="document_reviews"
    )
    op.create_index(
        "ix_document_reviews_final_document_type_id", "document_reviews", ["final_document_type_id"]
    )

    op.drop_index("ix_checklist_overrides_case_required_type_set_at", table_name="checklist_overrides")
    op.create_index(
        "ix_checklist_overrides_case_document_type_set_at",
        "checklist_overrides",
        ["case_id", "document_type_id", "set_at"],
    )


def downgrade() -> None:
    # Exact reverse of upgrade(), in opposite order. Each index is recreated
    # under its old name while its column still carries the *new* name (the
    # column hasn't been renamed back yet at that point) — SQLite then
    # auto-updates the index's column reference in place a few statements
    # later when the column itself is renamed back, exactly mirroring the
    # auto-update behavior relied on in upgrade().
    op.drop_index("ix_checklist_overrides_case_document_type_set_at", table_name="checklist_overrides")
    op.create_index(
        "ix_checklist_overrides_case_required_type_set_at",
        "checklist_overrides",
        ["case_id", "document_type_id", "set_at"],
    )

    op.drop_index("ix_document_reviews_final_document_type_id", table_name="document_reviews")
    op.create_index(
        "ix_document_reviews_final_matched_required_document_type_id",
        "document_reviews",
        ["final_document_type_id"],
    )

    op.execute(
        "ALTER TABLE checklist_overrides "
        "RENAME COLUMN document_type_id TO required_document_type_id"
    )
    op.execute(
        "ALTER TABLE document_reviews "
        "RENAME COLUMN final_document_type_id TO final_matched_required_document_type_id"
    )
    op.execute(
        "ALTER TABLE document_reviews "
        "RENAME COLUMN prior_document_type_id TO prior_matched_required_document_type_id"
    )
    op.execute(
        "ALTER TABLE classification_results "
        "RENAME COLUMN predicted_document_type_id TO predicted_required_document_type_id"
    )
    op.execute(
        "ALTER TABLE documents RENAME COLUMN matched_document_type_id TO matched_required_document_type_id"
    )

    op.drop_index("ix_document_types_act_type_code", table_name="document_types")
    op.create_index(
        "ix_required_document_types_act_type_code", "document_types", ["act_type_id", "code"], unique=True
    )

    op.execute("ALTER TABLE document_types RENAME TO required_document_types")
