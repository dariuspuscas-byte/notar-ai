"""rename document_types.code values to English

Revision ID: b3f5d2a9c7e1
Revises: a7c3e1f04b92
Create Date: 2026-09-26 12:00:00.000000

Data-only migration: the app is English-only, so the Romanian machine codes
on `document_types` (e.g. `extras_cf`, `id_card_vanzator`) are renamed to
English ones (e.g. `land_registry_extract`, `seller_id_card`). Row ids are
unchanged, so every foreign key (`documents.matched_document_type_id`,
`checklist_overrides.document_type_id`, ...) keeps pointing at the same row.

Rows must be renamed before `seed.py` is re-run: the seed upserts by
`(act_type_id, code)`, so un-renamed rows would sit next to new duplicates.

`classification_results.predicted_type_code_raw` / `alternative_type_code_raw`
are left untouched on purpose: they record what the model literally answered
at the time.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f5d2a9c7e1'
down_revision: Union[str, None] = 'a7c3e1f04b92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RENAMES: dict[str, str] = {
    "extras_cf": "land_registry_extract",
    "extras_cf_defunct": "estate_land_registry_extract",
    "act_proprietate": "title_deed",
    "act_proprietate_defunct": "deceased_title_deeds",
    "certificat_fiscal": "tax_certificate",
    "cert_energetic": "energy_certificate",
    "id_card_vanzator": "seller_id_card",
    "id_card_cumparator": "buyer_id_card",
    "cert_casatorie": "marriage_certificate",
    "adeverinta_asociatie": "homeowners_association_certificate",
    "certificat_deces": "death_certificate",
    "acte_stare_civila": "civil_status_certificates",
    "id_card_mostenitori": "heirs_id_cards",
    "testament": "will",
    "id_card_donator": "donor_id_card",
    "id_card_donatar": "donee_id_card",
    "contract_credit": "loan_agreement",
    "id_card_imprumutat": "borrower_id_card",
    "id_card_mandant": "principal_id_card",
    "id_card_mandatar": "agent_id_card",
}

_rename = sa.text("UPDATE document_types SET code = :new WHERE code = :old")


def upgrade() -> None:
    for old, new in RENAMES.items():
        op.execute(_rename.bindparams(old=old, new=new))


def downgrade() -> None:
    for old, new in RENAMES.items():
        op.execute(_rename.bindparams(old=new, new=old))
