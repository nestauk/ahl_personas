import logging
import os

from fastapi import APIRouter

from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.evidence.csv_parser import parse_evidence_csv
from food_policy_impact_tool.models.evidence import EvidenceSource

logger = logging.getLogger(__name__)

router = APIRouter()

_cache: dict[str, object] = {
    "sources": [],
    "mtime": 0.0,
}


def _get_sources() -> list[EvidenceSource]:
    """Return cached evidence sources, re-parsing if the CSV has been modified."""
    csv_path = get_settings().evidence_csv_path
    try:
        current_mtime = os.path.getmtime(csv_path)
    except OSError:
        logger.warning("Evidence CSV not found at %s", csv_path)
        return []

    if current_mtime != _cache["mtime"]:
        logger.info("Parsing evidence CSV (mtime changed)")
        _cache["sources"] = parse_evidence_csv(csv_path)
        _cache["mtime"] = current_mtime

    return _cache["sources"]  # type: ignore[return-value]


@router.get("/evidence/sources")
async def get_evidence_sources():
    """Return all evidence base source metadata from the curated CSV.

    Reads directly from the analysts' evidence_base.csv — the canonical
    source of truth for evidence metadata. Results are cached in memory
    and invalidated when the file's mtime changes.
    """
    sources = _get_sources()
    return {
        "sources": [s.model_dump() for s in sources],
        "total": len(sources),
    }
