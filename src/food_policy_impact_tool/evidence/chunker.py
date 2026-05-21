from food_policy_impact_tool.models.evidence import EvidenceChunk, EvidenceSource


def _split_text(text: str, max_size: int, separators: list[str]) -> list[str]:
    """Recursively split text using a hierarchy of separators."""
    if len(text) <= max_size:
        return [text]

    sep = separators[0] if separators else ""
    remaining_seps = separators[1:] if len(separators) > 1 else []

    if not sep:
        return [text[i : i + max_size] for i in range(0, len(text), max_size)]

    parts = text.split(sep)
    chunks: list[str] = []
    current = ""

    for part in parts:
        candidate = current + sep + part if current else part
        if len(candidate) <= max_size:
            current = candidate
        else:
            if current:
                chunks.append(current)
            if len(part) > max_size:
                chunks.extend(_split_text(part, max_size, remaining_seps))
            else:
                current = part
                continue
            current = ""

    if current:
        chunks.append(current)

    return chunks


def _add_overlap(chunks: list[str], overlap: int) -> list[str]:
    """Add overlapping context from the end of each chunk to the start of the next."""
    if len(chunks) <= 1 or overlap <= 0:
        return chunks

    result = [chunks[0]]
    for i in range(1, len(chunks)):
        prefix = chunks[i - 1][-overlap:]
        result.append(prefix + chunks[i])
    return result


def chunk_text(
    text: str,
    source: EvidenceSource,
    max_size: int = 3000,
    overlap: int = 400,
    page_number: int | None = None,
    start_index: int = 0,
) -> list[EvidenceChunk]:
    """Split text into chunks using recursive paragraph/sentence splitting.

    Splits on paragraph boundaries first, then line boundaries, then sentence
    boundaries. Adds overlap between consecutive chunks.

    Args:
        text: The text to chunk.
        source: Parent evidence source metadata.
        max_size: Maximum chunk size in characters.
        overlap: Number of characters to overlap between chunks.
        page_number: Optional page number for PDF-sourced text.
        start_index: Starting chunk index (for numbering across pages).

    Returns:
        List of EvidenceChunk objects.
    """
    text = text.strip()
    if not text:
        return []

    separators = ["\n\n", "\n", ". "]
    raw_chunks = _split_text(text, max_size, separators)
    raw_chunks = [c.strip() for c in raw_chunks if c.strip()]
    overlapped = _add_overlap(raw_chunks, overlap)

    return [
        EvidenceChunk(
            text=chunk_text_content,
            source=source,
            page_number=page_number,
            chunk_index=start_index + i,
        )
        for i, chunk_text_content in enumerate(overlapped)
    ]


def chunk_source(
    pages: list[tuple[int, str]],
    source: EvidenceSource,
    max_size: int = 3000,
    overlap: int = 400,
) -> list[EvidenceChunk]:
    """Chunk all pages from a PDF source, plus synthetic metadata chunks.

    Concatenates all page text and chunks it as a single document. Also creates
    synthetic chunks from the analyst's thematic annotations (key_insights,
    methodology) to boost retrieval relevance.

    Args:
        pages: List of (page_number, text) tuples from PDF extraction.
        source: Parent evidence source metadata.
        max_size: Maximum chunk size in characters.
        overlap: Number of characters to overlap between chunks.

    Returns:
        List of EvidenceChunk objects covering both PDF content and metadata.
    """
    chunks: list[EvidenceChunk] = []

    full_text = "\n\n".join(text for _, text in pages)
    chunks.extend(chunk_text(full_text, source, max_size, overlap, start_index=0))

    metadata_parts: list[str] = []
    if source.key_insights:
        metadata_parts.append(f"Key insights and themes:\n{source.key_insights}")
    if source.methodology:
        metadata_parts.append(f"Methodology and limitations:\n{source.methodology}")
    if source.objective:
        metadata_parts.append(f"Objective:\n{source.objective}")
    if source.participants:
        metadata_parts.append(f"Participants and sample:\n{source.participants}")

    if metadata_parts:
        metadata_text = (
            f"Source: {source.source_name}\n"
            f"Year: {source.year or 'Unknown'}\n"
            f"Data type: {source.data_type or 'Unknown'}\n\n"
            + "\n\n".join(metadata_parts)
        )
        metadata_chunks = chunk_text(
            metadata_text,
            source,
            max_size,
            overlap,
            start_index=len(chunks),
        )
        chunks.extend(metadata_chunks)

    return chunks
