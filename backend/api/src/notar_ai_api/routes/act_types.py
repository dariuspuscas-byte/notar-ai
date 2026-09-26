from typing import Any

from fastapi import APIRouter
from notar_ai_core import get_checklist, list_act_types

router = APIRouter()


@router.get("/act-types", response_model=None)
async def get_act_types() -> Any:
    """GET /api/v1/act-types — spec §3.1"""
    items = await list_act_types()
    return {"items": items}


@router.get("/act-types/{act_type_id}/checklist", response_model=None)
async def get_act_type_checklist(act_type_id: str) -> Any:
    """GET /api/v1/act-types/{actTypeId}/checklist — spec §3.1"""
    items = await get_checklist(act_type_id)
    return {"items": items}
