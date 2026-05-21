from pydantic import BaseModel


class EvidenceSource(BaseModel):
    """Structured metadata for a single evidence source from the CSV."""

    source_name: str
    pdf_filename: str
    link: str | None = None
    participants: str | None = None
    objective: str | None = None
    key_insights: str | None = None
    methodology: str | None = None
    year: str | None = None
    data_type: str | None = None


class EvidenceChunk(BaseModel):
    """A chunk of text from an evidence source, ready for embedding."""

    text: str
    source: EvidenceSource
    page_number: int | None = None
    chunk_index: int


class RetrievalResult(BaseModel):
    """A single result from the hybrid retrieval system."""

    chunk: EvidenceChunk
    score: float
