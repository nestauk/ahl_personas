import logging
import threading

from food_policy_impact_tool.evidence.embedder import embed_query
from food_policy_impact_tool.evidence.store import EvidenceStore
from food_policy_impact_tool.models.evidence import RetrievalResult

logger = logging.getLogger(__name__)

# ponytail: one global lock serialises Qdrant searches (local embedded Qdrant is not
# documented thread-safe); embeddings still run in parallel. Fine at ~24 searches/run.
_search_lock = threading.Lock()


class HybridRetriever:
    """Retrieves relevant evidence chunks using Qdrant's native hybrid search.

    Combines dense (semantic) and sparse (keyword) vectors in a single query
    with reciprocal rank fusion handled by Qdrant.
    """

    def __init__(self, store: EvidenceStore):
        self._store = store

    def retrieve(self, query: str, top_k: int = 10) -> list[RetrievalResult]:
        """Retrieve the most relevant evidence chunks for a natural language query.

        Args:
            query: Natural language search query.
            top_k: Number of results to return.

        Returns:
            List of RetrievalResult objects ordered by relevance.
        """
        dense_vector = embed_query(query)

        with _search_lock:
            results = self._store.search_hybrid(
                dense_vector=dense_vector,
                query_text=query,
                top_k=top_k,
            )

        logger.info(
            "Retrieved %d chunks for query: %.80s...",
            len(results),
            query,
        )

        return [
            RetrievalResult(chunk=chunk, score=score)
            for chunk, score in results
        ]
