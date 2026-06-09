import hashlib
import logging
import sys
from pathlib import Path

from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.evidence.chunker import chunk_source
from food_policy_impact_tool.evidence.csv_parser import parse_evidence_csv
from food_policy_impact_tool.evidence.embedder import embed_texts
from food_policy_impact_tool.evidence.pdf_extractor import extract_pdf_text
from food_policy_impact_tool.evidence.store import EvidenceStore
from food_policy_impact_tool.models.evidence import EvidenceSource

logger = logging.getLogger(__name__)


def _compute_content_hash(source: EvidenceSource, pdf_text: str) -> str:
    """Compute a SHA-256 hash of the source metadata + PDF text for change detection."""
    content = (
        f"{source.source_name}|{source.pdf_filename}|{source.link}|"
        f"{source.participants}|{source.objective}|{source.key_insights}|"
        f"{source.methodology}|{source.year}|{source.data_type}|"
        f"{pdf_text}"
    )
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def run_ingestion(store: EvidenceStore | None = None) -> dict[str, int]:
    """Run the full evidence ingestion pipeline.

    Parses the CSV, extracts PDF text, chunks, embeds, and stores in Qdrant.
    Idempotent: skips unchanged sources, re-ingests changed ones, adds new ones.

    Args:
        store: Optional existing store instance. When provided (e.g. from the
            running API), the store is reused and not closed on completion. When
            omitted (CLI usage), a new store is created and closed afterwards.

    Returns:
        Summary dict with counts: ingested, skipped_no_filename, skipped_unchanged, failed.
    """
    settings = get_settings()
    sources_dir = Path(settings.sources_dir)

    logger.info("Starting ingestion from %s", settings.evidence_csv_path)

    sources = parse_evidence_csv(settings.evidence_csv_path)
    owns_store = store is None
    if store is None:
        store = EvidenceStore()

    counts = {
        "ingested": 0,
        "skipped_no_pdf": 0,
        "skipped_unchanged": 0,
        "failed": 0,
    }

    for source in sources:
        try:
            pdf_path = sources_dir / source.pdf_filename
            if not pdf_path.exists():
                logger.warning(
                    "%s: PDF not found at %s — skipping",
                    source.source_name,
                    pdf_path,
                )
                counts["skipped_no_pdf"] += 1
                continue

            pages = extract_pdf_text(pdf_path)
            if not pages:
                logger.warning("%s: no text extracted from PDF — skipping", source.source_name)
                counts["failed"] += 1
                continue

            full_text = "\n\n".join(text for _, text in pages)
            content_hash = _compute_content_hash(source, full_text)

            existing_hash = store.get_content_hash_for_source(source.pdf_filename)
            if existing_hash == content_hash:
                logger.info("%s: unchanged — skipping", source.source_name)
                counts["skipped_unchanged"] += 1
                continue

            if existing_hash is not None:
                store.delete_by_source(source.pdf_filename)
                logger.info("%s: content changed — re-ingesting", source.source_name)

            chunks = chunk_source(
                pages=pages,
                source=source,
                max_size=settings.chunk_size,
                overlap=settings.chunk_overlap,
            )

            if not chunks:
                logger.warning("%s: no chunks produced — skipping", source.source_name)
                counts["failed"] += 1
                continue

            chunk_texts = [c.text for c in chunks]
            embeddings = embed_texts(chunk_texts)

            store.upsert_chunks(chunks, embeddings, content_hash)
            logger.info(
                "%s: ingested %d chunks",
                source.source_name,
                len(chunks),
            )
            counts["ingested"] += 1

        except Exception:
            logger.exception("%s: ingestion failed", source.source_name)
            counts["failed"] += 1

    logger.info(
        "Ingestion complete: %d ingested, %d skipped (no PDF), "
        "%d skipped (unchanged), %d failed. Total chunks in store: %d",
        counts["ingested"],
        counts["skipped_no_pdf"],
        counts["skipped_unchanged"],
        counts["failed"],
        store.count(),
    )

    if owns_store:
        store.close()
    return counts


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    run_ingestion()
