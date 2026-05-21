import logging
from pathlib import Path

import pymupdf

logger = logging.getLogger(__name__)


def extract_pdf_text(pdf_path: str | Path) -> list[tuple[int, str]]:
    """Extract text content from a PDF file, page by page.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        List of (page_number, text) tuples. Page numbers are 1-indexed.
        Returns an empty list if the PDF cannot be read.
    """
    pdf_path = Path(pdf_path)
    pages: list[tuple[int, str]] = []

    try:
        doc = pymupdf.open(str(pdf_path))
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            if text and text.strip():
                pages.append((page_num + 1, text))
        doc.close()
    except Exception:
        logger.exception("Failed to extract text from %s", pdf_path.name)
        return []

    logger.info("Extracted %d pages from %s", len(pages), pdf_path.name)
    return pages
