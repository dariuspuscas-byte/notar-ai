"""merge name_ro and name_en into name

Revision ID: e6098f9d55fa
Revises: d2b068edcaa2
Create Date: 2026-09-25 09:30:58.970683

Contract-changing rename (specs/ARCHITECTURE.md §2.1/§2.2/§3): `act_types`
had both `name_ro` and `name_en` (spec §2.1); `document_types` had `name_ro`
(spec §2.2). `name_en` was only ever documented as an internal/dev reference
and was never shown in the UI, which is Romanian-only (design/UX_SPEC.md).
Decision: drop `name_en` entirely, keep the Romanian content, rename
`name_ro` -> `name` on both tables.

Unlike the previous rename in this history (`d2b068edcaa2`,
`required_document_types` -> `document_types`), THIS rename DOES change the
public REST API's JSON field names: `name_ro`/`name_en` no longer appear on
the wire, `name` does (act-type list, checklist items, case-status checklist
items). See notar_ai_core/types.py and notar_ai_core/act_types.py /
cases/compute_status.py, which now construct DTOs with a single `name`
field.

`act_types.name_ro` -> `act_types.name` is a straight `RENAME COLUMN` (no
data transformation needed — the existing values are already correct), then
`act_types.name_en` is dropped (confirmed, accepted data loss — no UI ever
showed it). `document_types.name_ro` -> `document_types.name` is the same
straight rename, no column dropped.

Uses real `ALTER TABLE ... RENAME COLUMN` / `ALTER TABLE ... DROP COLUMN`
statements (via `op.execute`, same proven pattern as `d2b068edcaa2` — a plain
`op.alter_column()`/`op.drop_column()` is not supported outside
`batch_alter_table` on the SQLite dialect). Modern SQLite (3.35+ for DROP
COLUMN, 3.25+ for RENAME COLUMN; this project's SQLite is 3.50, confirmed in
the prior rename's report) supports both natively and auto-updates dependent
index definitions when a renamed column is indexed (neither `name_ro` nor
`name_en` is indexed on either table here, so there is nothing dependent to
verify beyond the column data itself). Verified against the real dev DB (see
the rename task's report for before/after row counts and a spot-check of
preserved `name_ro` values).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6098f9d55fa'
down_revision: Union[str, None] = 'd2b068edcaa2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- act_types: name_ro -> name (rename, data preserved as-is), then
    # drop name_en (accepted data loss — never shown in the UI) ---
    op.execute("ALTER TABLE act_types RENAME COLUMN name_ro TO name")
    op.execute("ALTER TABLE act_types DROP COLUMN name_en")

    # --- document_types: name_ro -> name (rename, no data transformation) ---
    op.execute("ALTER TABLE document_types RENAME COLUMN name_ro TO name")


def downgrade() -> None:
    # Exact reverse of upgrade(), in opposite order. NOTE: `name_en`'s
    # original values cannot be restored (that data loss was accepted and is
    # irreversible) — the recreated column is nullable and comes back empty,
    # unlike the original NOT NULL column. This downgrade restores the
    # *schema shape* for local rollback convenience, not the original data.
    op.execute("ALTER TABLE document_types RENAME COLUMN name TO name_ro")

    op.add_column("act_types", sa.Column("name_en", sa.String(), nullable=True))
    op.execute("ALTER TABLE act_types RENAME COLUMN name TO name_ro")
