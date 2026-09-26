"""`get_document_file` (GET /api/v1/cases/{caseId}/documents/{documentId}/file)."""

from __future__ import annotations

import pytest

import notar_ai_core as core
from notar_ai_core import storage
from notar_ai_core.errors import AppError

from .test_update_case import make_case

PNG_BYTES = b"\x89PNG\r\n\x1a\nfake-image-bytes"


async def upload(case_id: str) -> core.DocumentDTO:
    return await core.upload_document(
        core.UploadDocumentInput(
            case_id=case_id, buffer=PNG_BYTES, original_filename="scan ID.png", mime_type="image/png"
        )
    )


async def test_returns_stored_bytes_and_metadata():
    case = await make_case()
    doc = await upload(case.id)

    file = await core.get_document_file(case.id, doc.id)

    assert file.data == PNG_BYTES
    assert file.mime_type == "image/png"
    assert file.original_filename == "scan ID.png"


async def test_document_from_another_case_is_not_found():
    case = await make_case()
    other_case = await make_case()
    doc = await upload(case.id)

    with pytest.raises(AppError) as exc:
        await core.get_document_file(other_case.id, doc.id)
    assert exc.value.http_status == 404
    assert exc.value.code == "document_not_found"


async def test_missing_file_on_disk_is_not_found():
    case = await make_case()
    doc = await upload(case.id)
    row = await core.get_document_or_throw(doc.id)
    await storage.remove(row.storage_path)

    with pytest.raises(AppError) as exc:
        await core.get_document_file(case.id, doc.id)
    assert exc.value.http_status == 404
    assert exc.value.code == "document_file_not_found"
