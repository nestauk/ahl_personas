import logging
from collections.abc import AsyncIterator
from pathlib import Path

from openai import AsyncOpenAI

from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.models.chat import ChatMessage
from food_policy_impact_tool.models.evidence import RetrievalResult

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_system_prompt() -> str:
    return (_PROMPTS_DIR / "system.md").read_text(encoding="utf-8")


def _format_evidence_context(results: list[RetrievalResult]) -> str:
    if not results:
        return "No relevant evidence was found for this query."

    sections: list[str] = []
    for i, result in enumerate(results, 1):
        source = result.chunk.source
        header = f"[Source {i}] {source.source_name}"
        if source.year:
            header += f" ({source.year})"
        sections.append(f"{header}\n{result.chunk.text}")

    return "\n\n---\n\n".join(sections)


async def stream_chat_response(
    messages: list[ChatMessage],
    evidence: list[RetrievalResult],
) -> AsyncIterator[str]:
    """Stream an LLM response grounded in retrieved evidence.

    Constructs the full prompt from the system prompt, evidence context, and
    conversation history, then streams text deltas from the OpenAI API.

    Args:
        messages: Conversation history including the latest user message.
        evidence: Retrieved evidence chunks to ground the response in.

    Yields:
        Text content deltas as they arrive from the LLM.
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    system_prompt = _load_system_prompt()
    evidence_context = _format_evidence_context(evidence)

    api_messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "system",
            "content": (
                "The following evidence has been retrieved from the curated evidence base. "
                "Use it to ground your response. Cite sources by name and year when you draw on them.\n\n"
                f"{evidence_context}"
            ),
        },
    ]

    for msg in messages:
        if msg.role in ("user", "assistant"):
            api_messages.append({"role": msg.role, "content": msg.content})

    stream = await client.chat.completions.create(
        model=settings.openai_model,
        messages=api_messages,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
