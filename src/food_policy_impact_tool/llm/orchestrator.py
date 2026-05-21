import json
import logging
import re
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.models.chat import ChatMessage, ConversationStage, SpecMetadata
from food_policy_impact_tool.models.evidence import RetrievalResult

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"
_SPEC_BLOCK_PATTERN = re.compile(
    r"<policy_spec>\s*(.*?)\s*</policy_spec>",
    re.DOTALL,
)


def _load_prompt(filename: str) -> str:
    return (_PROMPTS_DIR / filename).read_text(encoding="utf-8")


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


def _format_spec_state(spec_state: dict[str, Any] | None) -> str:
    """Format the current specification state for injection into the Socratic prompt."""
    if not spec_state:
        return "No specification state established yet — this is the start of the conversation."

    lines: list[str] = []
    spec = spec_state.get("spec", {})
    for key, label in [
        ("policy_lever", "Policy lever"),
        ("in_scope_businesses", "In-scope businesses"),
        ("business_size", "Business size"),
        ("delivery_channel", "Delivery channel"),
        ("population", "Population"),
        ("geography", "Geography"),
    ]:
        entry = spec.get(key, {})
        source = entry.get("source", "empty")
        values = entry.get("values", [])
        if source == "not_applicable":
            rationale = entry.get("rationale", "")
            suffix = f" ({rationale})" if rationale else ""
            lines.append(f"- {label}: not applicable{suffix}")
            continue
        if source == "empty" or not values:
            lines.append(f"- {label}: not yet discussed")
        else:
            val_str = "; ".join(values)
            rationale = entry.get("rationale", "")
            suffix = f" (assumption: {rationale})" if source == "assumed" and rationale else ""
            lines.append(f"- {label}: {val_str} [{source}]{suffix}")

    policy_name = spec_state.get("policy_name")
    if policy_name:
        lines.insert(0, f"Policy: {policy_name}")

    return "\n".join(lines)


def _extract_spec_from_response(full_text: str) -> dict[str, Any] | None:
    """Extract and parse the <policy_spec> JSON block from the LLM response.

    Returns the parsed spec metadata dict, or None if extraction fails.
    Never raises — logs warnings on failure.
    """
    match = _SPEC_BLOCK_PATTERN.search(full_text)
    if not match:
        logger.warning("No <policy_spec> block found in LLM response")
        return None

    raw_json = match.group(1).strip()
    try:
        parsed = json.loads(raw_json)
        SpecMetadata.model_validate(parsed)
        return parsed
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning(
            "Failed to parse <policy_spec> block: %s\nRaw content: %s",
            exc,
            raw_json[:500],
        )
        return None


def _strip_spec_block(text: str) -> str:
    """Remove the <policy_spec> block from text for clean display."""
    return _SPEC_BLOCK_PATTERN.sub("", text).rstrip()


def _build_messages(
    *,
    system_prompt: str,
    messages: list[ChatMessage],
    evidence_context: str | None = None,
) -> list[dict[str, str]]:
    """Build the API messages list from system prompt, optional evidence, and history."""
    api_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
    ]

    if evidence_context is not None:
        api_messages.append({
            "role": "system",
            "content": (
                "The following evidence has been retrieved from the curated evidence base. "
                "Use it to ground your response. Cite sources by name and year when you draw on them.\n\n"
                f"{evidence_context}"
            ),
        })

    for msg in messages:
        if msg.role in ("user", "assistant"):
            api_messages.append({"role": msg.role, "content": msg.content})

    return api_messages


async def stream_response(
    *,
    stage: ConversationStage,
    messages: list[ChatMessage],
    evidence: list[RetrievalResult] | None = None,
    spec_state: dict[str, Any] | None = None,
) -> AsyncIterator[tuple[str, Any]]:
    """Stream an LLM response, yielding typed parts for the data stream formatter.

    Selects the appropriate system prompt based on the conversation stage.
    For the 'specifying' stage, extracts the policy specification from the
    response and yields it as a data part.

    Args:
        stage: Current conversation stage determining prompt and behaviour.
        messages: Conversation history including the latest user message.
        evidence: Retrieved evidence chunks (only used in 'chatting' stage).
        spec_state: Current specification state from the frontend sidebar.

    Yields:
        Tuples of (type, content) where type is 'text' or 'data'.
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    if stage == "specifying":
        raw_prompt = _load_prompt("socratic.md")
        system_prompt = raw_prompt.replace(
            "{{CURRENT_SPEC_STATE}}",
            _format_spec_state(spec_state),
        )
        evidence_context = None
    else:
        system_prompt = _load_prompt("system.md")
        evidence_context = _format_evidence_context(evidence or [])

    api_messages = _build_messages(
        system_prompt=system_prompt,
        messages=messages,
        evidence_context=evidence_context,
    )

    stream = await client.chat.completions.create(
        model=settings.openai_model,
        messages=api_messages,
        stream=True,
    )

    full_response = []
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            full_response.append(delta.content)
            yield ("text", delta.content)

    if stage == "specifying":
        full_text = "".join(full_response)
        spec_data = _extract_spec_from_response(full_text)
        if spec_data is not None:
            yield ("data", spec_data)
