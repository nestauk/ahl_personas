import csv
import logging
from pathlib import Path

from food_policy_impact_tool.models.evidence import EvidenceSource

logger = logging.getLogger(__name__)

_COLUMN_MAP = {
    "Data source name": "source_name",
    "Open access link to output": "link",
    "Participants and sample spec": "participants",
    "Objective / central focus": "objective",
    "Key insights and themes": "key_insights",
    "Methodology/limitations": "methodology",
    "Year conducted": "year",
    "Data type": "data_type",
    "pdf_filename": "pdf_filename",
}


def _normalise_header(header: str) -> str:
    """Strip multi-line example text from CSV headers.

    The CSV headers contain embedded newlines with example text
    (e.g. "Participants and sample spec\\ne.g. n, profile(s), location(s)").
    We only need the first line.
    """
    return header.split("\n")[0].strip()


def parse_evidence_csv(csv_path: str | Path) -> list[EvidenceSource]:
    """Parse the evidence base CSV into structured EvidenceSource records.

    Handles multi-line quoted fields, embedded double-quotes, commas within
    quoted strings, sparse entries, and truncated final rows. Rows without
    a pdf_filename value are skipped.

    Args:
        csv_path: Path to the evidence_base.csv file.

    Returns:
        List of EvidenceSource objects for rows with a valid pdf_filename.
    """
    csv_path = Path(csv_path)
    sources: list[EvidenceSource] = []
    skipped_no_filename = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        raw_headers = next(reader)
        headers = [_normalise_header(h) for h in raw_headers]

        field_indices: dict[str, int] = {}
        for i, header in enumerate(headers):
            if header in _COLUMN_MAP:
                field_indices[_COLUMN_MAP[header]] = i

        for row_num, row in enumerate(reader, start=2):
            try:
                fields: dict[str, str | None] = {}
                for field_name, col_idx in field_indices.items():
                    if col_idx < len(row):
                        value = row[col_idx].strip()
                        fields[field_name] = value if value else None
                    else:
                        fields[field_name] = None

                pdf_filename = fields.get("pdf_filename")
                if not pdf_filename:
                    source_name = fields.get("source_name", f"row-{row_num}")
                    logger.warning("Row %d (%s): no pdf_filename — skipping", row_num, source_name)
                    skipped_no_filename += 1
                    continue

                source_name = fields.get("source_name")
                if not source_name:
                    source_name = pdf_filename

                sources.append(
                    EvidenceSource(
                        source_name=source_name,
                        pdf_filename=pdf_filename,
                        link=fields.get("link"),
                        participants=fields.get("participants"),
                        objective=fields.get("objective"),
                        key_insights=fields.get("key_insights"),
                        methodology=fields.get("methodology"),
                        year=fields.get("year"),
                        data_type=fields.get("data_type"),
                    )
                )
            except Exception:
                logger.exception("Row %d: failed to parse — skipping", row_num)

    logger.info(
        "CSV parsing complete: %d sources loaded, %d skipped (no filename)",
        len(sources),
        skipped_no_filename,
    )
    return sources
