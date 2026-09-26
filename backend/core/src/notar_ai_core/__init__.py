"""
Public surface of `notar_ai_core`. Both `backend/api` (and, if MCP is ever
revived, a future MCP adapter) import only from here — never reach into
`notar_ai_core.db` etc. directly — so adapters truly never touch the
database, filesystem, or Ollama directly (specs/ARCHITECTURE.md §1.1).
"""

from .config import config
from .errors import AppError
from .types import (
    OverallStatus,
    DocumentStatus,
    ClassificationDecision,
    OverrideStatus,
    ChecklistItemStatus,
    ReviewDecision,
    ActTypeDTO,
    RequiredDocumentTypeDTO,
    CaseDTO,
    DocumentDTO,
    ClassificationResultDTO,
    ChecklistOverrideDTO,
    ChecklistItemStatusDTO,
    CaseStatusDTO,
)
from .act_types import (
    list_act_types,
    get_checklist,
    get_act_type_or_throw,
    get_document_type_or_throw,
)
from .cases import create_case, get_case, list_cases, update_case, CreateCaseInput, UpdateCaseInput
from .cases.compute_status import get_case_status, recompute_case_status
from .documents import (
    upload_document,
    list_documents,
    get_document_buffer,
    get_document_file,
    DocumentFile,
    get_document_or_throw,
    UploadDocumentInput,
)
from .classification import (
    classify_document,
    review_classification,
    ClassifyDocumentResult,
    ReviewDecisionInput,
)
from .checklist_overrides import set_checklist_override, SetChecklistOverrideInput
from .upload_orchestrator import upload_document_and_classify

__all__ = [
    "config",
    "AppError",
    "OverallStatus",
    "DocumentStatus",
    "ClassificationDecision",
    "OverrideStatus",
    "ChecklistItemStatus",
    "ReviewDecision",
    "ActTypeDTO",
    "RequiredDocumentTypeDTO",
    "CaseDTO",
    "DocumentDTO",
    "ClassificationResultDTO",
    "ChecklistOverrideDTO",
    "ChecklistItemStatusDTO",
    "CaseStatusDTO",
    "list_act_types",
    "get_checklist",
    "get_act_type_or_throw",
    "get_document_type_or_throw",
    "create_case",
    "get_case",
    "list_cases",
    "CreateCaseInput",
    "update_case",
    "UpdateCaseInput",
    "get_case_status",
    "recompute_case_status",
    "upload_document",
    "list_documents",
    "get_document_buffer",
    "get_document_file",
    "DocumentFile",
    "get_document_or_throw",
    "UploadDocumentInput",
    "classify_document",
    "review_classification",
    "ClassifyDocumentResult",
    "ReviewDecisionInput",
    "set_checklist_override",
    "SetChecklistOverrideInput",
    "upload_document_and_classify",
]
