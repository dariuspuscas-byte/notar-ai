"""
Seeds the two draft act types and their required-document checklists, given
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
        name="Vânzare-cumpărare",
        description="Contract de vânzare-cumpărare a unui imobil.",
        required_documents=[
            RequiredDocSeed(
                code="extras_cf",
                name="Extras de carte funciară actualizat",
                classification_hints=["carte funciara", "CF", "extras de carte funciara"],
            ),
            RequiredDocSeed(
                code="act_proprietate",
                name="Act de proprietate al vânzătorului",
                classification_hints=["act de proprietate", "titlu de proprietate", "contract de vanzare anterior"],
            ),
            RequiredDocSeed(
                code="certificat_fiscal",
                name="Certificat fiscal — Primărie",
                classification_hints=["certificat fiscal", "primarie", "impozite si taxe locale"],
            ),
            RequiredDocSeed(
                code="cert_energetic",
                name="Certificat de performanță energetică",
                classification_hints=["certificat energetic", "performanta energetica", "eticheta energetica"],
            ),
            RequiredDocSeed(
                code="id_card_vanzator",
                name="Carte de identitate vânzător",
                allow_multiple=True,
                classification_hints=["carte de identitate", "CI", "buletin"],
            ),
            RequiredDocSeed(
                code="id_card_cumparator",
                name="Carte de identitate cumpărător",
                allow_multiple=True,
                classification_hints=["carte de identitate", "CI", "buletin"],
            ),
            RequiredDocSeed(
                code="cert_casatorie",
                name="Certificat de căsătorie",
                is_mandatory=False,
                classification_hints=["certificat de casatorie"],
            ),
            RequiredDocSeed(
                code="adeverinta_asociatie",
                name="Adeverință asociație de proprietari",
                is_mandatory=False,
                classification_hints=["asociatia de proprietari", "adeverinta intretinere"],
            ),
        ],
    ),
    ActTypeSeed(
        code="succession",
        name="Succesiune",
        description="Dezbatere succesorală în urma decesului unei persoane.",
        required_documents=[
            RequiredDocSeed(
                code="certificat_deces",
                name="Certificat de deces",
                classification_hints=["certificat de deces"],
            ),
            RequiredDocSeed(
                code="acte_stare_civila",
                name="Certificate de naștere/căsătorie ale moștenitorilor dovedind rudenia",
                allow_multiple=True,
                classification_hints=["certificat de nastere", "certificat de casatorie", "stare civila"],
            ),
            RequiredDocSeed(
                code="id_card_mostenitori",
                name="Cărți de identitate moștenitori",
                allow_multiple=True,
                classification_hints=["carte de identitate", "CI", "buletin"],
            ),
            RequiredDocSeed(
                code="testament",
                name="Testament",
                is_mandatory=False,
                classification_hints=["testament"],
            ),
            RequiredDocSeed(
                code="extras_cf_defunct",
                name="Extras CF pentru imobilele din masa succesorală",
                classification_hints=["carte funciara", "CF", "extras de carte funciara"],
            ),
            RequiredDocSeed(
                code="act_proprietate_defunct",
                name="Acte de proprietate ale defunctului",
                classification_hints=["act de proprietate", "titlu de proprietate"],
            ),
            RequiredDocSeed(
                code="certificat_fiscal",
                name="Certificat fiscal",
                classification_hints=["certificat fiscal", "primarie"],
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
