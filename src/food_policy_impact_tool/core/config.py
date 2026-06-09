from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    openai_api_key: str
    openai_model: str = "gpt-4o"
    openai_embedding_model: str = "text-embedding-3-small"

    openai_scan_model: str | None = None
    openai_analysis_model: str | None = None
    openai_socratic_model: str | None = None
    openai_chat_model: str | None = None

    openai_scan_reasoning_effort: str | None = None
    openai_analysis_reasoning_effort: str | None = None
    openai_socratic_reasoning_effort: str | None = None
    openai_chat_reasoning_effort: str | None = None

    qdrant_path: str = str(_PROJECT_ROOT / "data" / "qdrant_store")
    evidence_csv_path: str = str(_PROJECT_ROOT / "data" / "evidence_base.csv")
    sources_dir: str = str(_PROJECT_ROOT / "data" / "sources")

    api_key: str | None = None
    cors_origins: str = "http://localhost:3000"

    chunk_size: int = 3000
    chunk_overlap: int = 400
    retrieval_top_k: int = 10

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def _fill_per_task_model_defaults(self) -> "Settings":
        """Fall back to openai_model for any per-task model not explicitly set."""
        if self.openai_scan_model is None:
            self.openai_scan_model = self.openai_model
        if self.openai_analysis_model is None:
            self.openai_analysis_model = self.openai_model
        if self.openai_socratic_model is None:
            self.openai_socratic_model = self.openai_model
        if self.openai_chat_model is None:
            self.openai_chat_model = self.openai_model
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Returns:
        Settings: Application configuration loaded from the environment.
    """
    return Settings()
