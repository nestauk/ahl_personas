from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    openai_api_key: str
    openai_model: str = "gpt-4o"
    openai_embedding_model: str = "text-embedding-3-small"

    qdrant_path: str = str(_PROJECT_ROOT / "data" / "qdrant_store")
    evidence_csv_path: str = str(_PROJECT_ROOT / "data" / "evidence_base.csv")
    sources_dir: str = str(_PROJECT_ROOT / "data" / "sources")

    chunk_size: int = 3000
    chunk_overlap: int = 400
    retrieval_top_k: int = 10

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Returns:
        Settings: Application configuration loaded from the environment.
    """
    return Settings()
