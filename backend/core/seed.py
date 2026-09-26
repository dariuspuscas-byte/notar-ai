"""
Seeds the act types and their required-document checklists. The first two are given
verbatim in spec §8 ("Draft seed data ... to be confirmed with the notary but
good enough to build against"). Idempotent: safe to re-run (upserts by code).

Run with: `python seed.py` from `backend/core/` (with the venv active), or
`python -m notar_ai_core` is not defined — this script lives at the package
root deliberately, mirroring the TypeScript build's `prisma/seed.ts` being a
standalone entry point rather than part of the importable library.
"""

from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from sqlalchemy import select  # noqa: E402

from notar_ai_core.db import get_session  # noqa: E402
from notar_ai_core.models import ActType, DocumentType  # noqa: E402


# All catalog data is English (codes, names, descriptions, classification
# hints) — the app is English-only.
@dataclass
class RequiredDocSeed:
    code: str
    name: str
    description: str | None = None
    is_mandatory: bool = True
    allow_multiple: bool = False
    classification_hints: list[str] = field(default_factory=list)


@dataclass
class ActTypeSeed:
    code: str
    name: str
    description: str
    required_documents: list[RequiredDocSeed]


SEED_ACT_TYPES: list[ActTypeSeed] = [
    ActTypeSeed(
        code="sale_purchase",
        name="Sale-purchase",
        description="Sale-purchase contract for a property.",
        required_documents=[
            RequiredDocSeed(
                code="land_registry_extract",
                name="Up-to-date land registry extract",
                classification_hints=["land registry extract", "land book extract", "cadastral number"],
            ),
            RequiredDocSeed(
                code="title_deed",
                name="Seller's title deed",
                classification_hints=["title deed", "property deed", "sale contract"],
            ),
            RequiredDocSeed(
                code="tax_certificate",
                name="Tax certificate — City Hall",
                classification_hints=["tax certificate", "city hall", "local taxes"],
            ),
            RequiredDocSeed(
                code="energy_certificate",
                name="Energy performance certificate",
                classification_hints=["energy performance certificate", "energy label"],
            ),
            RequiredDocSeed(
                code="seller_id_card",
                name="Seller ID card",
                allow_multiple=True,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
            RequiredDocSeed(
                code="buyer_id_card",
                name="Buyer ID card",
                allow_multiple=True,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
            RequiredDocSeed(
                code="marriage_certificate",
                name="Marriage certificate",
                is_mandatory=False,
                classification_hints=["marriage certificate"],
            ),
            RequiredDocSeed(
                code="homeowners_association_certificate",
                name="Homeowners' association certificate",
                is_mandatory=False,
                classification_hints=["homeowners association", "maintenance fees certificate"],
            ),
        ],
    ),
    ActTypeSeed(
        code="succession",
        name="Succession",
        description="Succession proceedings following a person's death.",
        required_documents=[
            RequiredDocSeed(
                code="death_certificate",
                name="Death certificate",
                classification_hints=["death certificate"],
            ),
            RequiredDocSeed(
                code="civil_status_certificates",
                name="Heirs' birth/marriage certificates proving kinship",
                allow_multiple=True,
                classification_hints=["birth certificate", "marriage certificate", "civil status"],
            ),
            RequiredDocSeed(
                code="heirs_id_cards",
                name="Heirs' ID cards",
                allow_multiple=True,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
            RequiredDocSeed(
                code="will",
                name="Will",
                is_mandatory=False,
                classification_hints=["will", "testament"],
            ),
            RequiredDocSeed(
                code="estate_land_registry_extract",
                name="Land registry extract for estate properties",
                classification_hints=["land registry extract", "land book extract", "cadastral number"],
            ),
            RequiredDocSeed(
                code="deceased_title_deeds",
                name="Deceased's title deeds",
                classification_hints=["title deed", "property deed"],
            ),
            RequiredDocSeed(
                code="tax_certificate",
                name="Tax certificate",
                classification_hints=["tax certificate", "city hall", "local taxes"],
            ),
        ],
    ),
    # The act types below are NOT in spec §8: placeholder checklists ported
    # from the frontend mock data (frontend/src/mocks/seed.ts) so the Act Type
    # Picker isn't limited to two options. To be confirmed with the notary.
    ActTypeSeed(
        code="donation",
        name="Donation",
        description="Transfer free of charge.",
        required_documents=[
            RequiredDocSeed(
                code="title_deed",
                name="Donor's title deed",
                classification_hints=["title deed", "property deed", "sale contract"],
            ),
            RequiredDocSeed(
                code="land_registry_extract",
                name="Up-to-date land registry extract",
                classification_hints=["land registry extract", "land book extract", "cadastral number"],
            ),
            RequiredDocSeed(
                code="donor_id_card",
                name="Donor ID card",
                allow_multiple=True,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
            RequiredDocSeed(
                code="donee_id_card",
                name="Donee ID card",
                allow_multiple=True,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
        ],
    ),
    ActTypeSeed(
        code="mortgage",
        name="Mortgage / Loan",
        description="Real estate collateral for a loan.",
        required_documents=[
            RequiredDocSeed(
                code="loan_agreement",
                name="Loan agreement",
                classification_hints=["loan agreement", "credit agreement", "bank"],
            ),
            RequiredDocSeed(
                code="land_registry_extract",
                name="Up-to-date land registry extract",
                classification_hints=["land registry extract", "land book extract", "cadastral number"],
            ),
            RequiredDocSeed(
                code="borrower_id_card",
                name="Borrower ID card",
                allow_multiple=True,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
        ],
    ),
    ActTypeSeed(
        code="power_of_attorney",
        name="Power of attorney",
        description="Notarial power of attorney.",
        required_documents=[
            RequiredDocSeed(
                code="principal_id_card",
                name="Principal ID card",
                classification_hints=["identity card", "ID card", "national ID"],
            ),
            RequiredDocSeed(
                code="agent_id_card",
                name="Agent ID card",
                is_mandatory=False,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
        ],
    ),
    ActTypeSeed(
        code="other",
        name="Other act type",
        description="Custom document list.",
        required_documents=[
            RequiredDocSeed(
                code="id_card",
                name="ID card",
                allow_multiple=True,
                classification_hints=["identity card", "ID card", "national ID"],
            ),
        ],
    ),
]


async def main() -> None:
    for act_type_seed in SEED_ACT_TYPES:
        async with get_session() as session:
            result = await session.execute(select(ActType).where(ActType.code == act_type_seed.code))
            act_type = result.scalar_one_or_none()
            if act_type is None:
                act_type = ActType(
                    code=act_type_seed.code,
                    name=act_type_seed.name,
                    description=act_type_seed.description,
                )
                session.add(act_type)
                await session.flush()
            else:
                act_type.name = act_type_seed.name
                act_type.description = act_type_seed.description

            for index, doc in enumerate(act_type_seed.required_documents):
                doc_result = await session.execute(
                    select(DocumentType).where(
                        DocumentType.act_type_id == act_type.id,
                        DocumentType.code == doc.code,
                    )
                )
                existing = doc_result.scalar_one_or_none()
                hints_json = json.dumps(doc.classification_hints) if doc.classification_hints else None
                if existing is None:
                    session.add(
                        DocumentType(
                            act_type_id=act_type.id,
                            code=doc.code,
                            name=doc.name,
                            description=doc.description,
                            is_mandatory=doc.is_mandatory,
                            allow_multiple=doc.allow_multiple,
                            sort_order=index + 1,
                            classification_hints=hints_json,
                        )
                    )
                else:
                    existing.name = doc.name
                    existing.description = doc.description
                    existing.is_mandatory = doc.is_mandatory
                    existing.allow_multiple = doc.allow_multiple
                    existing.sort_order = index + 1
                    existing.classification_hints = hints_json

            await session.commit()

        print(
            f'Seeded act type "{act_type_seed.code}" with {len(act_type_seed.required_documents)} required document types.'
        )


if __name__ == "__main__":
    asyncio.run(main())
