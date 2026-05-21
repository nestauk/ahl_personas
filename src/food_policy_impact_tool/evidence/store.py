import logging
import math
import re
import uuid
from collections import Counter

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    NamedSparseVector,
    PointStruct,
    SparseVector,
    SparseVectorParams,
    VectorParams,
)

from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.models.evidence import EvidenceChunk, EvidenceSource

logger = logging.getLogger(__name__)

COLLECTION_NAME = "evidence_chunks"
DENSE_VECTOR_NAME = "dense"
SPARSE_VECTOR_NAME = "sparse"
DENSE_VECTOR_SIZE = 1536

_TOKEN_PATTERN = re.compile(r"\b\w+\b")


def _tokenise(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall(text.lower())


def _compute_sparse_vector(text: str) -> SparseVector:
    """Compute a TF-IDF-style sparse vector from text.

    Uses term frequency with sublinear scaling (1 + log(tf)) as weights.
    Token identity is mapped to a stable integer index via hash.
    """
    tokens = _tokenise(text)
    if not tokens:
        return SparseVector(indices=[], values=[])

    term_counts = Counter(tokens)
    indices: list[int] = []
    values: list[float] = []

    for term, count in term_counts.items():
        idx = hash(term) % (2**31)
        weight = 1.0 + math.log(count)
        indices.append(idx)
        values.append(weight)

    return SparseVector(indices=indices, values=values)


def _chunk_point_id(pdf_filename: str, chunk_index: int) -> str:
    """Generate a deterministic UUID for a chunk, enabling idempotent upserts."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{pdf_filename}:{chunk_index}"))


def _chunk_to_payload(chunk: EvidenceChunk, content_hash: str) -> dict:
    return {
        "text": chunk.text,
        "source_name": chunk.source.source_name,
        "pdf_filename": chunk.source.pdf_filename,
        "link": chunk.source.link,
        "participants": chunk.source.participants,
        "objective": chunk.source.objective,
        "key_insights": chunk.source.key_insights,
        "methodology": chunk.source.methodology,
        "year": chunk.source.year,
        "data_type": chunk.source.data_type,
        "page_number": chunk.page_number,
        "chunk_index": chunk.chunk_index,
        "content_hash": content_hash,
    }


def _payload_to_chunk(payload: dict) -> EvidenceChunk:
    source = EvidenceSource(
        source_name=payload["source_name"],
        pdf_filename=payload["pdf_filename"],
        link=payload.get("link"),
        participants=payload.get("participants"),
        objective=payload.get("objective"),
        key_insights=payload.get("key_insights"),
        methodology=payload.get("methodology"),
        year=payload.get("year"),
        data_type=payload.get("data_type"),
    )
    return EvidenceChunk(
        text=payload["text"],
        source=source,
        page_number=payload.get("page_number"),
        chunk_index=payload["chunk_index"],
    )


class EvidenceStore:
    """Qdrant-backed vector store with dense + sparse named vectors."""

    def __init__(self, path: str | None = None):
        self._path = path or get_settings().qdrant_path
        self._client = QdrantClient(path=self._path)
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        collections = [c.name for c in self._client.get_collections().collections]
        if COLLECTION_NAME not in collections:
            self._client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config={
                    DENSE_VECTOR_NAME: VectorParams(
                        size=DENSE_VECTOR_SIZE,
                        distance=Distance.COSINE,
                    ),
                },
                sparse_vectors_config={
                    SPARSE_VECTOR_NAME: SparseVectorParams(),
                },
            )
            logger.info("Created Qdrant collection '%s'", COLLECTION_NAME)

    def get_content_hash_for_source(self, pdf_filename: str) -> str | None:
        """Retrieve the content hash for a source from its first stored chunk.

        Args:
            pdf_filename: The pdf_filename to look up.

        Returns:
            The stored content_hash string, or None if no chunks exist for this source.
        """
        results = self._client.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=Filter(
                must=[FieldCondition(key="pdf_filename", match=MatchValue(value=pdf_filename))]
            ),
            limit=1,
            with_payload=["content_hash"],
        )
        points = results[0]
        if points:
            return points[0].payload.get("content_hash")
        return None

    def delete_by_source(self, pdf_filename: str) -> None:
        """Delete all chunks belonging to a specific source.

        Args:
            pdf_filename: The pdf_filename whose chunks should be removed.
        """
        self._client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[FieldCondition(key="pdf_filename", match=MatchValue(value=pdf_filename))]
                )
            ),
        )
        logger.info("Deleted chunks for source '%s'", pdf_filename)

    def upsert_chunks(
        self,
        chunks: list[EvidenceChunk],
        embeddings: list[list[float]],
        content_hash: str,
    ) -> None:
        """Insert or update chunks with both dense and sparse vectors.

        Args:
            chunks: List of evidence chunks to store.
            embeddings: Dense embedding vectors, one per chunk.
            content_hash: Hash of the source content for change detection.
        """
        points = []
        for chunk, embedding in zip(chunks, embeddings, strict=True):
            point_id = _chunk_point_id(chunk.source.pdf_filename, chunk.chunk_index)
            sparse = _compute_sparse_vector(chunk.text)
            points.append(
                PointStruct(
                    id=point_id,
                    vector={
                        DENSE_VECTOR_NAME: embedding,
                        SPARSE_VECTOR_NAME: NamedSparseVector(
                            name=SPARSE_VECTOR_NAME,
                            vector=sparse,
                        ).vector,
                    },
                    payload=_chunk_to_payload(chunk, content_hash),
                )
            )

        batch_size = 100
        for i in range(0, len(points), batch_size):
            self._client.upsert(
                collection_name=COLLECTION_NAME,
                points=points[i : i + batch_size],
            )

        logger.info("Upserted %d chunks", len(points))

    def search_hybrid(
        self,
        dense_vector: list[float],
        query_text: str,
        top_k: int = 10,
    ) -> list[tuple[EvidenceChunk, float]]:
        """Run a hybrid search combining dense and sparse vectors with RRF.

        Performs separate dense and sparse searches in Qdrant, then fuses the
        results using reciprocal rank fusion. Both vector types are stored
        and updated together in Qdrant, so there is no staleness issue.

        Args:
            dense_vector: Dense embedding of the query.
            query_text: Raw query text (used to compute sparse vector).
            top_k: Number of results to return.

        Returns:
            List of (EvidenceChunk, score) tuples ordered by relevance.
        """
        prefetch_k = top_k * 3
        sparse = _compute_sparse_vector(query_text)

        dense_results = self._client.query_points(
            collection_name=COLLECTION_NAME,
            query=dense_vector,
            using=DENSE_VECTOR_NAME,
            limit=prefetch_k,
            with_payload=True,
        )

        sparse_results = self._client.query_points(
            collection_name=COLLECTION_NAME,
            query=sparse,
            using=SPARSE_VECTOR_NAME,
            limit=prefetch_k,
            with_payload=True,
        )

        rrf_k = 60
        scores: dict[str, float] = {}
        payloads: dict[str, dict] = {}

        for rank, point in enumerate(dense_results.points):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0.0) + 1.0 / (rrf_k + rank + 1)
            payloads[pid] = point.payload

        for rank, point in enumerate(sparse_results.points):
            pid = str(point.id)
            scores[pid] = scores.get(pid, 0.0) + 1.0 / (rrf_k + rank + 1)
            payloads[pid] = point.payload

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        return [
            (_payload_to_chunk(payloads[pid]), score)
            for pid, score in ranked
        ]

    def count(self) -> int:
        """Return the total number of points in the collection."""
        info = self._client.get_collection(COLLECTION_NAME)
        return info.points_count

    def close(self) -> None:
        self._client.close()
