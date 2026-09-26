"""`update_case` (PATCH /api/v1/cases/{caseId}, spec §3.2)."""

from __future__ import annotations

import asyncio

import pytest

import notar_ai_core as core
from notar_ai_core.db import get_session
from notar_ai_core.errors import AppError
from notar_ai_core.models import ActType

from .conftest import unique_code


async def make_case() -> core.CaseDTO:
    async with get_session() as session:
        act_type = ActType(code=unique_code("test_act"), name="Test")
        session.add(act_type)
        await session.commit()
        await session.refresh(act_type)
    return await core.create_case(
        core.CreateCaseInput(act_type_id=act_type.id, client_name="Ion Popescu", notes="initial")
    )


async def test_rename_strips_and_bumps_updated_at_and_keeps_status():
    created = await make_case()
    await asyncio.sleep(0.01)

    updated = await core.update_case(created.id, core.UpdateCaseInput(client_name="  Maria Ionescu  "))

    assert updated.client_name == "Maria Ionescu"
    assert updated.notes == "initial"  # untouched when not provided
    assert updated.status == created.status
    assert updated.act_type_id == created.act_type_id
    assert updated.updated_at > created.updated_at
    assert (await core.get_case(created.id)).client_name == "Maria Ionescu"


async def test_notes_only_update_leaves_client_name():
    created = await make_case()
    updated = await core.update_case(created.id, core.UpdateCaseInput(notes="new notes"))
    assert updated.notes == "new notes"
    assert updated.client_name == "Ion Popescu"
    assert updated.status == created.status


async def test_blank_client_name_is_400():
    created = await make_case()
    with pytest.raises(AppError) as exc:
        await core.update_case(created.id, core.UpdateCaseInput(client_name="   "))
    assert exc.value.http_status == 400
    assert exc.value.code == "invalid_client_name"
    assert (await core.get_case(created.id)).client_name == "Ion Popescu"


async def test_unknown_case_is_404():
    with pytest.raises(AppError) as exc:
        await core.update_case("00000000-0000-0000-0000-000000000000", core.UpdateCaseInput(client_name="X"))
    assert exc.value.http_status == 404
    assert exc.value.code == "case_not_found"
