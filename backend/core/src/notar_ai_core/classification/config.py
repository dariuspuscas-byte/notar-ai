"""
Classification-specific config, kept in its own file per spec §4.2 ("Keep the
model name in one config value"). Values themselves come from the central
`notar_ai_core.config` (env-driven, spec §4.2/§6) so there is exactly one
place that reads environment variables.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import config as _root_config


@dataclass(frozen=True)
class ClassificationConfig:
    ollama_base_url: str
    model: str
    keep_alive: str
    timeout_ms: int
    confidence_threshold: float
    max_image_edge_px: int


classification_config = ClassificationConfig(
    ollama_base_url=_root_config.ollama_base_url,
    model=_root_config.ollama_model,
    keep_alive=_root_config.ollama_keep_alive,
    timeout_ms=_root_config.ollama_timeout_ms,
    # spec §4.4 confidence policy threshold.
    confidence_threshold=_root_config.classification_confidence_threshold,
    # spec §4.3: "long edge ~1568px is plenty for legibility".
    max_image_edge_px=1568,
)
