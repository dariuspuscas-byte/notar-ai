"""replace act_types.is_active with status

Revision ID: a7c3e1f04b92
Revises: e6098f9d55fa
Create Date: 2026-09-25 12:00:00.000000

`act_types.is_active` (boolean soft-disable flag, spec §2.1) is replaced by
`act_types.status`, a text column with legal values `draft`, `in_progress`,
`ready`, `completed` (see `ActTypeStatus` in notar_ai_core/types.py) and a
server default of `draft`. Like every other enum-ish column in this schema,
the legal values are enforced in `core`, not by a DB CHECK constraint.

This change was first applied by hand to the dev Postgres DB; this revision
reproduces that exact shape so a fresh `alembic upgrade head` ends up with
the same schema. On the already-altered dev DB, run `alembic stamp
a7c3e1f04b92` instead of upgrading.

`is_active` values are not carried over (accepted data loss — every existing
row was active); existing rows get `status = 'draft'`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3e1f04b92'
down_revision: Union[str, None] = 'e6098f9d55fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "act_types",
        sa.Column("status", sa.Text(), nullable=False, server_default="draft"),
    )
    op.execute("ALTER TABLE act_types DROP COLUMN is_active")


def downgrade() -> None:
    # Restores the schema shape only: every row comes back `is_active = true`.
    op.add_column(
        "act_types",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute("ALTER TABLE act_types DROP COLUMN status")
