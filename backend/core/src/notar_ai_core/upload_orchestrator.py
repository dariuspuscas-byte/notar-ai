"""
Composition of two use-cases: `upload_document` (owned by `documents.py`) and
`classify_document` (owned by `classification/`). Lives here, one level above
both modules, rather than inside either — spec §1.3's module table has
`core/documents` depending only on DB + storage (not classification), so the
"upload triggers classification synchronously" behavior required by spec
§3.3 can't live inside `documents.py` without creating a reverse dependency
the table doesn't allow. This file is exactly the kind of top-level use-case
function spec §1.1 already names (`uploadDocument`, `classifyDocument`, ...),
just composed together for the one call site (upload) that needs both.

`api`'s `POST /cases/{id}/documents` route calls this single function.
"""

from __future__ import annotations

from .classification import ClassifyDocumentResult, classify_document
from .documents import UploadDocumentInput, upload_document


async def upload_document_and_classify(input: UploadDocumentInput) -> ClassifyDocumentResult:
    uploaded = await upload_document(input)
    try:
        return await classify_document(uploaded.id)
    except Exception as err:  # noqa: BLE001 - deliberate catch-all, see docstring
        # classify_document already swallows the expected failure modes
        # (Ollama down, bad image, malformed response) into
        # `classification_error` without raising. If it raises anyway
        # (unexpected bug), the upload itself must still succeed per spec
        # §3.3 — classification is best-effort synchronous, not a
        # precondition for the upload to count.
        return ClassifyDocumentResult(
            document=uploaded,
            classification_result=None,
            classification_error=f"Classification failed unexpectedly: {err}",
        )
