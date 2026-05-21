import logging

from openai import OpenAI

from food_policy_impact_tool.core.config import get_settings

logger = logging.getLogger(__name__)

_BATCH_SIZE = 2048


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using the OpenAI embeddings API.

    Automatically batches large inputs to stay within API limits.

    Args:
        texts: List of text strings to embed.

    Returns:
        List of embedding vectors (each a list of floats), in the same order.
    """
    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key)
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i : i + _BATCH_SIZE]
        response = client.embeddings.create(
            model=settings.openai_embedding_model,
            input=batch,
        )
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)
        logger.info("Embedded batch %d-%d of %d texts", i, i + len(batch), len(texts))

    return all_embeddings


def embed_query(query: str) -> list[float]:
    """Generate an embedding for a single query string.

    Args:
        query: The query text to embed.

    Returns:
        Embedding vector as a list of floats.
    """
    return embed_texts([query])[0]
