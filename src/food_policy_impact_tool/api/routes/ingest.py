import logging

from fastapi import APIRouter

from food_policy_impact_tool.api.dependencies import get_store
from food_policy_impact_tool.evidence.ingest import run_ingestion

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ingest")
async def ingest():
    """Trigger the evidence base ingestion pipeline.

    Parses the CSV, extracts PDFs, chunks, embeds, and stores in Qdrant.
    Idempotent: unchanged sources are skipped.
    """
    logger.info("Ingestion triggered via API")
    counts = run_ingestion(store=get_store())
    return {"status": "complete", **counts}
