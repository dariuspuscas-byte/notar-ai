"""
Builds the Ollama `/api/chat` request body from a case's act-type checklist
(spec §4.3). No automatic act-type detection: the assistant already chose the
act type up front, so the model only disambiguates within that act type's
closed list (spec §4.7).
"""

from __future__ import annotations

from typing import Any

from ..types import RequiredDocumentTypeDTO
from .ollama_client import OllamaChatMessage

CLASSIFICATION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "predicted_type_code": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "alternative_type_code": {"type": ["string", "null"]},
        "reasoning": {"type": "string"},
    },
    "required": ["predicted_type_code", "confidence", "reasoning"],
}


def build_system_prompt(required_types: list[RequiredDocumentTypeDTO]) -> str:
    lines = []
    for rt in required_types:
        hints = f" Hints/aliases: {', '.join(rt.classification_hints)}." if rt.classification_hints else ""
        description = f" {rt.description}" if rt.description else ""
        lines.append(f'- code: "{rt.code}" — {rt.name}.{description}{hints}')
    catalogue = "\n".join(lines)

    return "\n".join(
        [
            "You are a document classifier for a Romanian notary office.",
            "You will be shown one page of a scanned or photographed document.",
            "Decide which of the following document types it is, from this closed list only:",
            catalogue,
            "",
            'If the document does not clearly match any code in the list, respond with predicted_type_code "unknown".',
            "Respond ONLY with the requested JSON object. confidence must reflect how certain you are that predicted_type_code is correct, from 0 (no idea) to 1 (certain).",
            "If you are unsure between two codes, put your best guess in predicted_type_code and the second-best in alternative_type_code.",
        ]
    )


def build_classification_messages(
    required_types: list[RequiredDocumentTypeDTO], image_base64: str
) -> list[OllamaChatMessage]:
    return [
        OllamaChatMessage(role="system", content=build_system_prompt(required_types)),
        OllamaChatMessage(
            role="user",
            content="Classify this document image according to the system instructions.",
            images=[image_base64],
        ),
    ]
