import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Langfuse reads its credentials from os.environ, and pydantic-settings does
# not export .env values there — load them before the langfuse import.
load_dotenv()

from langfuse.openai import AsyncOpenAI  # noqa: E402 — drop-in OpenAI wrapper
from openai import APIError  # noqa: E402

from food_policy_impact_tool.core.config import get_settings  # noqa: E402
from food_policy_impact_tool.evidence.retriever import HybridRetriever  # noqa: E402
from food_policy_impact_tool.models.chat import (  # noqa: E402
    ChatMessage,
    ConversationStage,
    SpecMetadata,
)
from food_policy_impact_tool.models.evidence import RetrievalResult  # noqa: E402

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"
_prompt_cache: dict[str, str] = {}
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    """Return a singleton AsyncOpenAI client, reusing the connection pool across requests."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client
_SPEC_BLOCK_PATTERN = re.compile(
    r"<policy_spec>\s*(.*?)\s*</policy_spec>",
    re.DOTALL,
)
_SUBGROUPS_BLOCK_PATTERN = re.compile(
    r"<proposed_sub_groups>\s*(.*?)\s*</proposed_sub_groups>",
    re.DOTALL,
)
_STEP_SUMMARY_PATTERN = re.compile(
    r"<step_summary>\s*(.*?)\s*</step_summary>",
    re.DOTALL | re.IGNORECASE,
)
_SUMMARY_CARD_PATTERN = re.compile(
    r"<summary_card[^>]*>\s*(.*?)\s*</summary_card>",
    re.DOTALL | re.IGNORECASE,
)
_SYNTHESIS_SECTION_ORDER = (
    "equity_assessment",
    "risks_provocations",
    "design_improvements",
)

_MAX_RETRIES = 2
_RETRY_STATUS_CODES = {429, 500, 503}

_SYNTHESIS_SECTION_MARKER = re.compile(
    r"<!--\s*SECTION:\s*(equity_assessment|risks_provocations|design_improvements)\s*-->",
    re.IGNORECASE,
)
_SYNTHESIS_SECTION_MARKER_LINE = re.compile(
    r"^\s*<!--\s*SECTION:\s*(equity_assessment|risks_provocations|design_improvements)\s*-->\s*$",
    re.IGNORECASE,
)
_VALID_SYNTHESIS_SECTIONS = frozenset({
    "equity_assessment",
    "risks_provocations",
    "design_improvements",
})
# Fallback when the model omits HTML markers but uses section titles (with or without ##).
_SYNTHESIS_HEADING_LINES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^#{1,2}\s*Equity Assessment\s*$", re.IGNORECASE), "equity_assessment"),
    (
        re.compile(r"^#{1,2}\s*Risks\s*(?:&|and)\s*Provocations\s*$", re.IGNORECASE),
        "risks_provocations",
    ),
    (re.compile(r"^#{1,2}\s*Design Improvements\s*$", re.IGNORECASE), "design_improvements"),
    (re.compile(r"^Equity Assessment\s*$", re.IGNORECASE), "equity_assessment"),
    (
        re.compile(r"^Risks\s*(?:&|and)\s*Provocations\s*$", re.IGNORECASE),
        "risks_provocations",
    ),
    (re.compile(r"^Design Improvements\s*$", re.IGNORECASE), "design_improvements"),
]

_SYNTHESIS_SECTION_NAMES: dict[str, str] = {
    "equity_assessment": "Equity Assessment",
    "risks_provocations": "Risks & Provocations",
    "design_improvements": "Design Improvements",
}

_MAX_SEARCH_ROUNDS = 3
_FAILED_SUBGROUP_TEXT = "(Analysis failed — no findings for this sub-group.)"
_FALLBACK_FOLLOWUPS = [
    "Which group is most at risk, and why?",
    "Where do the sub-groups' experiences diverge most?",
    "What evidence would most change these conclusions?",
]


async def _merge_streams(
    factories: list[Any], limit: int,
) -> AsyncIterator[Any]:
    """Run async-iterator factories concurrently (at most `limit` at once), yielding
    items as they arrive. Order is preserved within each source, not across them."""
    # ponytail: unbounded queue, no backpressure; fine for a handful of token streams.
    queue: asyncio.Queue[Any] = asyncio.Queue()
    sem = asyncio.Semaphore(limit)
    done = object()

    async def pump(factory: Any) -> None:
        try:
            async with sem:
                async for item in factory():
                    await queue.put(item)
        finally:
            queue.put_nowait(done)

    tasks = [asyncio.create_task(pump(f)) for f in factories]
    try:
        remaining = len(tasks)
        while remaining:
            item = await queue.get()
            if item is done:
                remaining -= 1
            else:
                yield item
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def _format_analyses(analysis_texts: list[dict[str, str]]) -> str:
    """Format report texts for a prompt: sub-groups (id sg_* or no id) get positional
    SGn labels; synthesis sections get a plain heading."""
    sgs: list[dict[str, str]] = []
    others: list[dict[str, str]] = []
    for a in analysis_texts:
        (sgs if a.get("id", "sg_").startswith("sg_") else others).append(a)
    text = "Sub-group reference labels:\n" + "\n".join(
        f"- SG{i}: {a.get('name', '')}" for i, a in enumerate(sgs, 1)
    ) + "\n"
    for i, a in enumerate(sgs, 1):
        text += f"\n\n### SG{i}: {a.get('name', '')}\n\n{a.get('text', '')}"
    for a in others:
        text += f"\n\n### {a.get('name', '')}\n\n{a.get('text', '')}"
    return text


class _SynthesisSectionParser:
    """Splits synthesis stream on SECTION markers and recognised section headings."""

    _PARTIAL_PREFIXES = (
        "<", "<!", "<!--", "<!-- ", "<!-- S", "<!-- SE", "<!-- SEC",
        "<!-- SECT", "<!-- SECTI", "<!-- SECTIO", "<!-- SECTION",
        "<!-- SECTION:", "<!-- SECTION: ", "<!-- SECTION: e",
        "<!-- SECTION: equity_assessment", "<!-- SECTION: risks_provocations",
        "<!-- SECTION: design_improvements",
    )

    def __init__(self) -> None:
        self._current = "equity_assessment"
        self._buffer = ""
        self._sections_seen: set[str] = {"equity_assessment"}
        self._pending_section_transitions: list[str] = []
        self._section_accum: dict[str, str] = {
            section: "" for section in _VALID_SYNTHESIS_SECTIONS
        }
        self._pending_summary_cards: list[tuple[str, dict[str, Any]]] = []
        self._pending_step_summaries: list[tuple[str, str]] = []

    def drain_section_transitions(self) -> list[str]:
        """Return section IDs that were entered since the last drain, then clear."""
        pending = self._pending_section_transitions
        self._pending_section_transitions = []
        return pending

    def _switch_to_section(self, section: str) -> None:
        if section not in _VALID_SYNTHESIS_SECTIONS:
            return
        if section != self._current:
            prev = self._current
            self._finalize_section(prev)
            self._pending_section_transitions.append(section)
        self._current = section
        self._sections_seen.add(section)

    def _finalize_section(self, section_id: str) -> None:
        """Extract step summary and summary card from accumulated section content."""
        buf = self._section_accum.get(section_id, "")
        summary = _extract_step_summary(buf)
        if summary:
            self._section_accum[section_id] = _strip_step_summary(buf)
            self._pending_step_summaries.append((section_id, summary))
        card = self.finalize_section_card(section_id)
        if card:
            self._pending_summary_cards.append((section_id, card))

    def _record_section_content(self, section_id: str, content: str) -> None:
        if content:
            self._section_accum[section_id] = (
                self._section_accum.get(section_id, "") + content
            )

    def feed(self, delta: str) -> list[tuple[str, str]]:
        self._buffer += delta
        results: list[tuple[str, str]] = []

        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            results.extend(self._emit_line(line + "\n"))

        hold_from = self._find_partial_marker_start(self._buffer)
        if hold_from is not None:
            emit = self._buffer[:hold_from]
            self._buffer = self._buffer[hold_from:]
            if emit:
                self._record_section_content(self._current, emit)
                results.append((self._current, emit))

        return results

    def flush(self) -> list[tuple[str, str]]:
        results: list[tuple[str, str]] = []
        if self._buffer:
            results.extend(self._emit_line(self._buffer))
            self._buffer = ""
        if len(self._sections_seen) < 3:
            logger.warning(
                "[synthesis] Section split incomplete — only saw: %s. "
                "Risks/design content may be merged into equity_assessment.",
                sorted(self._sections_seen),
            )
        for section_id in _SYNTHESIS_SECTION_ORDER:
            self._finalize_section(section_id)
        return results

    def _emit_line(self, line: str) -> list[tuple[str, str]]:
        stripped = line.strip()
        marker_match = _SYNTHESIS_SECTION_MARKER_LINE.match(stripped)
        if marker_match:
            self._switch_to_section(marker_match.group(1).lower())
            return []

        for pattern, section_id in _SYNTHESIS_HEADING_LINES:
            if pattern.match(stripped):
                self._switch_to_section(section_id)
                return []

        self._record_section_content(self._current, line)
        return [(self._current, line)]

    def finalize_section_card(self, section_id: str) -> dict[str, Any] | None:
        """Extract a summary card from accumulated content for a synthesis section."""
        if section_id not in _VALID_SYNTHESIS_SECTIONS:
            return None
        buf = self._section_accum.get(section_id, "")
        card = _extract_summary_card(buf)
        if card:
            self._section_accum[section_id] = _strip_summary_card(buf)
        return card

    def drain_pending_step_summaries(self) -> list[tuple[str, str]]:
        """Return and clear step summaries queued during section finalisation."""
        pending = self._pending_step_summaries
        self._pending_step_summaries = []
        return pending

    def drain_pending_summary_cards(self) -> list[tuple[str, dict[str, Any]]]:
        """Return and clear summary cards queued during section finalisation."""
        pending = self._pending_summary_cards
        self._pending_summary_cards = []
        return pending

    @classmethod
    def _find_partial_marker_start(cls, text: str) -> int | None:
        for i in range(len(text) - 1, -1, -1):
            tail = text[i:]
            if any(p.startswith(tail) and p != tail for p in cls._PARTIAL_PREFIXES):
                return i
            if "\n" not in tail and cls._line_might_be_partial_heading(tail):
                return i
        return None

    @staticmethod
    def _line_might_be_partial_heading(tail: str) -> bool:
        """Hold only possible H2 section-title fragments — not ### subheadings."""
        if tail.startswith("###"):
            return False
        if tail.startswith("##") and not tail.startswith("###"):
            return True
        prefixes = (
            "Equity Assessment",
            "Equity",
            "Risks & Provocations",
            "Risks &",
            "Risks and",
            "Design Improvements",
            "Design Imp",
            "Design",
            "Risks",
        )
        return any(tail.startswith(p) for p in prefixes)


_SEARCH_EVIDENCE_TOOL_CHAT_FORMAT = {
    "type": "function",
    "function": {
        "name": "search_evidence",
        "description": (
            "Search the curated evidence base of qualitative research on food "
            "environments and lived experience. Returns relevant excerpts with "
            "source metadata. Use this to ground claims in evidence. If the search "
            "returns nothing relevant, flag the area as an evidence gap [Gap]."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "A specific search query. Be targeted — e.g. "
                        "'low income families shopping behaviour urban areas' or "
                        "'food voucher scheme uptake barriers' rather than broad terms."
                    ),
                }
            },
            "required": ["query"],
        },
    },
}

# Responses API uses a flat tool shape (no nested "function" key).
RESPONSES_SEARCH_EVIDENCE_TOOL = {
    "type": "function",
    **_SEARCH_EVIDENCE_TOOL_CHAT_FORMAT["function"],
}


def _load_prompt(filename: str) -> str:
    if filename not in _prompt_cache:
        _prompt_cache[filename] = (_PROMPTS_DIR / filename).read_text(encoding="utf-8")
    return _prompt_cache[filename]


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


def _format_tool_evidence(results: list[RetrievalResult], query: str = "") -> str:
    """Format retrieval results as a tool call response for the LLM."""
    if not results:
        return (
            f'No relevant evidence found for query: "{query}"\n'
            "Flag any claims in this area as [Gap] and note that this evidence gap exists. "
            "Reason from the sub-group's material constraints if possible [Reasoning]."
        )

    sections: list[str] = []
    for i, result in enumerate(results, 1):
        source = result.chunk.source
        header = f"[Chunk {i}] Source: \"{source.source_name}\""
        if source.year:
            header += f" ({source.year})"
        if result.chunk.page_number is not None:
            header += f", p.{result.chunk.page_number}"
        if source.methodology:
            header += f" | Methodology: {source.methodology}"
        sections.append(f"{header}\n{result.chunk.text}")

    return "\n\n---\n\n".join(sections)


_TAXONOMY_LABELS: dict[str, str] = {
    "policy_lever": "Policy lever",
    "in_scope_businesses": "In-scope businesses",
    "business_size": "Business size",
    "delivery_channel": "Delivery channel",
    "population": "Population",
    "geography": "Geography",
}


def _format_spec_state(spec_state: dict[str, Any] | None) -> str:
    """Format the current specification state for injection into the Socratic prompt."""
    if not spec_state:
        return "No specification state established yet — this is the start of the conversation."

    spec = spec_state.get("spec", {})
    lines: list[str] = []

    policy_name = spec.get("policy_name")
    if policy_name:
        lines.append(f"Policy: {policy_name}")

    summary = spec.get("policy_summary")
    if summary:
        lines.append(f"\n{summary}")

    taxonomy = spec.get("taxonomy_mapping", {})
    if taxonomy:
        lines.append("\nTaxonomy dimensions identified so far:")
        for key, values in taxonomy.items():
            label = _TAXONOMY_LABELS.get(key, key.replace("_", " ").title())
            lines.append(f"- {label}: {', '.join(values)}")

    questions = spec.get("open_questions", [])
    if questions:
        lines.append("\nQuestions for the analysis to consider:")
        for q in questions:
            lines.append(f"- {q}")

    outcomes = spec.get("outcomes_of_interest", [])
    if outcomes:
        lines.append("\nEquity-related outcomes of interest to the analyst:")
        for o in outcomes:
            lines.append(f"- {o}")

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


def _extract_subgroups_from_response(full_text: str) -> dict[str, Any] | None:
    """Extract and parse the <proposed_sub_groups> JSON block from the LLM response.

    Returns the parsed sub-groups dict, or None if extraction fails.
    Never raises — logs warnings on failure.
    """
    match = _SUBGROUPS_BLOCK_PATTERN.search(full_text)
    if not match:
        logger.warning("No <proposed_sub_groups> block found in LLM response")
        return None

    raw_json = match.group(1).strip()
    try:
        parsed = json.loads(raw_json)
        if "subgroups" not in parsed or not isinstance(parsed["subgroups"], list):
            logger.warning("Parsed <proposed_sub_groups> missing 'subgroups' list")
            return None
        return parsed
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning(
            "Failed to parse <proposed_sub_groups> block: %s\nRaw content: %s",
            exc,
            raw_json[:500],
        )
        return None


def _extract_policy_spec_from_history(messages: list[ChatMessage]) -> str:
    """Scan conversation history for the <policy_spec> block and return formatted text.

    Looks backwards through messages for the spec confirmation message that
    contains the structured policy specification (free-form summary + taxonomy).
    """
    for msg in reversed(messages):
        match = _SPEC_BLOCK_PATTERN.search(msg.content)
        if match:
            try:
                parsed = json.loads(match.group(1).strip())
                spec = parsed.get("spec", {})
                policy_name = spec.get("policy_name", "Unknown policy")
                summary = spec.get("policy_summary", "")

                lines = [f"**Policy**: {policy_name}"]
                if summary:
                    lines.append(f"\n{summary}")

                taxonomy = spec.get("taxonomy_mapping", {})
                if taxonomy:
                    dims = []
                    for key, values in taxonomy.items():
                        label = _TAXONOMY_LABELS.get(key, key.replace("_", " ").title())
                        dims.append(f"{label}: {', '.join(values)}")
                    lines.append(f"\nRelevant taxonomy dimensions: {'; '.join(dims)}.")

                questions = spec.get("open_questions", [])
                if questions:
                    lines.append(f"\nOpen questions: {'; '.join(questions)}.")

                outcomes = spec.get("outcomes_of_interest", [])
                if outcomes:
                    lines.append(
                        f"\nEquity-related outcomes of interest to the analyst: "
                        f"{'; '.join(outcomes)}."
                    )

                return "\n".join(lines)
            except (json.JSONDecodeError, KeyError):
                pass

    return "No policy specification found in conversation history."


def _strip_spec_block(text: str) -> str:
    """Remove the <policy_spec> block from text for clean display."""
    return _SPEC_BLOCK_PATTERN.sub("", text).rstrip()


def _extract_step_summary(text: str) -> str | None:
    """Extract the sidebar one-line summary from a sub-group analysis."""
    match = _STEP_SUMMARY_PATTERN.search(text)
    if not match:
        return None
    summary = match.group(1).strip()
    return summary or None


def _strip_step_summary(text: str) -> str:
    """Remove the <step_summary> block from analysis text for the reading panel."""
    return _STEP_SUMMARY_PATTERN.sub("", text).rstrip()


def _extract_summary_card(text: str) -> dict[str, Any] | None:
    """Extract and parse the <summary_card> JSON block from artifact text."""
    match = _SUMMARY_CARD_PATTERN.search(text)
    if not match:
        return None
    raw_json = match.group(1).strip()
    try:
        parsed = json.loads(raw_json)
        if isinstance(parsed, dict):
            return parsed
        logger.warning("<summary_card> JSON was not an object")
        return None
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse <summary_card> block: %s", exc)
        return None


def _strip_summary_card(text: str) -> str:
    """Remove <summary_card> blocks from artifact text for the reading panel."""
    return _SUMMARY_CARD_PATTERN.sub("", text).rstrip()


def _strip_artifact_tail_blocks(text: str) -> str:
    """Remove sidebar and summary-card blocks from artifact panel content."""
    return _strip_step_summary(_strip_summary_card(text))


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


def _format_subgroup_modifiers(sub_group: dict[str, Any]) -> str:
    """Format a sub-group's modifiers and features for prompt injection.

    For categorical sub-groups (where multiple modifiers within a category share
    the same mechanism), outputs a categorical block with all affected modifiers
    and their features. For standard sub-groups, lists each modifier with its category.
    """
    lines: list[str] = []
    cat_pattern = sub_group.get("category_pattern") if sub_group.get("categorical") else None

    if cat_pattern:
        category_label = cat_pattern.get("category", "Unknown category").replace("_", " ").title()
        lines.append(f"**Categorical pattern: {category_label}**")
        lines.append("This sub-group represents a shared structural pattern across multiple modifiers:")
        for mod in cat_pattern.get("affected_modifiers", []):
            name = mod.get("name", "Unknown")
            features = mod.get("features", "")
            lines.append(f"- {name}: {features}")
        shared = cat_pattern.get("shared_reasoning", "")
        if shared:
            lines.append(f"\nShared mechanism: {shared}")
        lines.append(
            "\nAnalyse the shared pattern with examples from across these "
            "modifiers, not a deep-dive into one."
        )

        non_categorical_mods = [
            m for m in sub_group.get("modifiers", [])
            if m.get("category") != cat_pattern.get("category")
        ]
        if non_categorical_mods:
            lines.append("\nAdditional modifiers:")
            for mod in non_categorical_mods:
                category = mod.get("category", "unknown")
                value = mod.get("value", "unknown")
                lines.append(f"- **{value}** (category: {category})")
    else:
        for mod in sub_group.get("modifiers", []):
            category = mod.get("category", "unknown")
            value = mod.get("value", "unknown")
            lines.append(f"- **{value}** (category: {category})")

    if sub_group.get("rationale"):
        lines.append(f"\nSelection rationale: {sub_group['rationale']}")
    return "\n".join(lines)


async def _stream_with_retry(
    create: Any,
    **kwargs: Any,
) -> Any:
    """Call an OpenAI create method (chat.completions or responses) with retry on transient errors."""
    last_error = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return await create(**kwargs)
        except APIError as exc:
            last_error = exc
            if exc.status_code not in _RETRY_STATUS_CODES or attempt == _MAX_RETRIES:
                raise
            wait = 2 ** attempt
            logger.warning(
                "OpenAI API error %d on attempt %d, retrying in %ds: %s",
                exc.status_code, attempt + 1, wait, exc,
            )
            await asyncio.sleep(wait)
    raise last_error  # type: ignore[misc]


async def _stream_subgroup_with_tools(
    client: AsyncOpenAI,
    policy_spec: str,
    sub_group: dict[str, Any],
    retriever: HybridRetriever,
    raw_searches: list[dict[str, Any]] | None = None,
    sg_index: int = 0,
) -> AsyncIterator[tuple[str, Any]]:
    """Run a per-sub-group analysis call with search_evidence tool calling.

    Handles the tool call loop: streams text, intercepts tool calls, executes
    them via the retriever, feeds results back, and continues until done.
    After _MAX_SEARCH_ROUNDS search rounds the model is forced to write.

    Args:
        client: OpenAI async client.
        policy_spec: Formatted policy specification text.
        sub_group: The sub-group dict with name, modifiers, rationale.
        retriever: Evidence retriever for tool calls.
        raw_searches: Mutable list that receives raw search records (query + chunks)
            for each tool call. Caller reads this after iteration completes.
        sg_index: Sub-group index, attached to evidence search events.

    Yields:
        Tuples of ("text", content) for report tokens or ("data", event_dict).
    """
    settings = get_settings()
    raw_prompt = _load_prompt("analysis_subgroup.md")
    system_prompt = raw_prompt.replace(
        "{{POLICY_SPECIFICATION}}", policy_spec,
    ).replace(
        "{{SUB_GROUP_NAME}}", sub_group.get("name", "Unknown sub-group"),
    ).replace(
        "{{SUB_GROUP_MODIFIERS}}", _format_subgroup_modifiers(sub_group),
    )

    api_messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                f"Analyse how this policy would be experienced by the sub-group: "
                f"{sub_group.get('name', 'this sub-group')}. "
                f"Call search_evidence 3–4 times in one turn, covering the dimensions "
                f"most relevant to this sub-group's material constraints (e.g. "
                f"financial impact, food access, shopping behaviour, cooking capacity, "
                f"health outcomes). Do at most one follow-up round of searches, then write."
            ),
        },
    ]

    sg_name = sub_group.get("name", "Unknown sub-group")
    tool_call_round = 0
    sg_start = time.monotonic()
    logger.info("[subgroup] START '%s' — calling LLM with search_evidence tool", sg_name)

    # The Responses API is required for function tools on reasoning models
    # (chat completions rejects tools + reasoning). Tool rounds continue
    # server-side state via previous_response_id.
    request_input: list[dict[str, Any]] = api_messages
    previous_response_id: str | None = None

    while True:
        tool_call_round += 1
        round_start = time.monotonic()
        force_write = tool_call_round > _MAX_SEARCH_ROUNDS
        if force_write:
            # ponytail: belt and braces alongside tool_choice="none" (untested with
            # previous_response_id); no hard round cap beyond this.
            request_input.append({
                "role": "user",
                "content": "Search complete. Write the analysis now.",
            })
        logger.info(
            "[subgroup] '%s' round %d — sending to LLM (%d input items)",
            sg_name, tool_call_round, len(request_input),
        )

        subgroup_kwargs: dict[str, Any] = dict(
            model=settings.openai_analysis_model,
            input=request_input,
            tools=[RESPONSES_SEARCH_EVIDENCE_TOOL],
            stream=True,
            # Runaway guard; includes reasoning tokens.
            max_output_tokens=6000,
            name="subgroup-analysis",
            metadata={"subgroup": sg_name[:512], "tool_round": str(tool_call_round)},
        )
        if force_write:
            subgroup_kwargs["tool_choice"] = "none"
        if previous_response_id:
            subgroup_kwargs["previous_response_id"] = previous_response_id
        if settings.openai_analysis_reasoning_effort:
            subgroup_kwargs["reasoning"] = {
                "effort": settings.openai_analysis_reasoning_effort,
            }

        stream = await _stream_with_retry(client.responses.create, **subgroup_kwargs)

        collected_text: list[str] = []
        function_calls: list[Any] = []
        response_id: str | None = None
        first_token = True

        async for event in stream:
            etype = getattr(event, "type", "")

            if etype == "response.output_text.delta":
                if first_token:
                    logger.info(
                        "[subgroup] '%s' round %d — first text token after %.1fs",
                        sg_name, tool_call_round,
                        time.monotonic() - round_start,
                    )
                    first_token = False
                collected_text.append(event.delta)
                yield ("text", event.delta)

            elif etype == "response.output_item.done":
                item = event.item
                if getattr(item, "type", "") == "function_call":
                    function_calls.append(item)

            elif etype == "response.completed":
                response_id = event.response.id

            elif etype == "response.incomplete" and collected_text and getattr(
                getattr(event.response, "incomplete_details", None), "reason", None,
            ) == "max_output_tokens":
                logger.warning("[subgroup] '%s' hit max_output_tokens — keeping partial text", sg_name)
                function_calls = []
                break

            elif etype in ("response.failed", "response.incomplete", "error"):
                detail = getattr(event, "response", None) or event
                raise RuntimeError(f"Responses stream ended abnormally: {detail}")

        round_elapsed = time.monotonic() - round_start

        if not function_calls:
            text_len = sum(len(t) for t in collected_text)
            logger.info(
                "[subgroup] '%s' round %d — generation complete, "
                "%d chars in %.1fs (total %.1fs)",
                sg_name, tool_call_round, text_len,
                round_elapsed, time.monotonic() - sg_start,
            )
            break

        previous_response_id = response_id
        request_input = []
        logger.info(
            "[subgroup] '%s' round %d — LLM requested %d tool call(s) after %.1fs",
            sg_name, tool_call_round, len(function_calls), round_elapsed,
        )

        queries: list[str | None] = []
        for fc in function_calls:
            if fc.name != "search_evidence":
                queries.append(None)
                continue
            try:
                query = json.loads(fc.arguments).get("query", "")
            except (json.JSONDecodeError, AttributeError):
                query = fc.arguments
            queries.append(query)
            yield ("data", {"type": "evidence_search", "query": query, "index": sg_index})

        retrieve_start = time.monotonic()
        all_results = await asyncio.gather(*(
            asyncio.to_thread(retriever.retrieve, q, 5) if q is not None
            else asyncio.sleep(0, result=[])
            for q in queries
        ))
        logger.info(
            "[subgroup] '%s' — %d searches in %.0fms",
            sg_name, len(queries), (time.monotonic() - retrieve_start) * 1000,
        )

        for fc, query, results in zip(function_calls, queries, all_results, strict=True):
            if query is None:
                tool_response = f"Unknown tool: {fc.name}"
            else:
                tool_response = _format_tool_evidence(results, query=query)
                if raw_searches is not None:
                    raw_searches.append({
                        "query": query,
                        "chunks": [
                            {
                                "source_name": r.chunk.source.source_name,
                                "source_year": r.chunk.source.year,
                                "text": r.chunk.text,
                                "page_number": r.chunk.page_number,
                            }
                            for r in results
                        ],
                    })
                yield ("data", {
                    "type": "evidence_search_complete",
                    "query": query,
                    "num_results": len(results),
                    "source_names": list(dict.fromkeys(
                        r.chunk.source.source_name for r in results
                    )),
                    "index": sg_index,
                })
            request_input.append({
                "type": "function_call_output",
                "call_id": fc.call_id,
                "output": tool_response,
            })

        # Keepalive before the next LLM round.
        yield ("data", {"type": "heartbeat"})


async def _stream_synthesis(
    client: AsyncOpenAI,
    policy_spec: str,
    sub_group_analyses: list[dict[str, str]],
) -> AsyncIterator[tuple[str, Any]]:
    """Run the equity synthesis and provocations call.

    Args:
        client: OpenAI async client.
        policy_spec: Formatted policy specification text.
        sub_group_analyses: List of dicts with 'name' and 'text' (and optional 'id')
            for each sub-group, in index order.

    Yields:
        Tuples of ("text", content).
    """
    settings = get_settings()
    raw_prompt = _load_prompt("analysis_synthesis.md")
    analyses_text = _format_analyses(sub_group_analyses)

    system_prompt = raw_prompt.replace(
        "{{POLICY_SPECIFICATION}}", policy_spec,
    ).replace(
        "{{SUB_GROUP_ANALYSES}}", analyses_text,
    )

    api_messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "Based on the per-sub-group analyses above, produce the three marked "
                "sections: equity assessment, risks and provocations, "
                "and design improvements."
            ),
        },
    ]

    logger.info(
        "[synthesis] Calling LLM with %d sub-group analyses (%d chars of context)",
        len(sub_group_analyses),
        len(analyses_text),
    )

    synthesis_kwargs: dict[str, Any] = dict(
        model=settings.openai_analysis_model,
        messages=api_messages,
        stream=True,
        stream_options={"include_usage": True},
        max_completion_tokens=10000,
        name="equity-synthesis",
    )
    if settings.openai_synthesis_reasoning_effort:
        synthesis_kwargs["reasoning_effort"] = settings.openai_synthesis_reasoning_effort

    stream = await _stream_with_retry(client.chat.completions.create, **synthesis_kwargs)

    first_token = True
    synth_start = time.monotonic()
    async for chunk in stream:
        if not chunk.choices:
            continue  # final usage-only chunk from include_usage
        delta = chunk.choices[0].delta
        if delta.content:
            if first_token:
                logger.info(
                    "[synthesis] First token after %.1fs",
                    time.monotonic() - synth_start,
                )
                first_token = False
            yield ("text", delta.content)


async def stream_analysis_chain(
    *,
    messages: list[ChatMessage],
    confirmed_subgroups: list[dict[str, Any]],
    retriever: HybridRetriever,
) -> AsyncIterator[tuple[str, Any]]:
    """Run per-sub-group analyses in parallel, then the synthesis, in one stream.

    Args:
        messages: Conversation history (used to extract policy specification).
        confirmed_subgroups: List of sub-group dicts from the frontend.
        retriever: Evidence retriever for tool calls.

    Yields:
        Tuples of ("text", content), ("analysis_content", dict), or ("data", event_dict).
        The last item is always the stage_transition to "chatting".
    """
    settings = get_settings()
    client = _get_client()

    chain_start = time.monotonic()
    n = len(confirmed_subgroups)
    logger.info(
        "[chain] === ANALYSIS CHAIN START === %d sub-groups to analyse",
        n,
    )

    policy_spec = _extract_policy_spec_from_history(messages)

    yield ("text", (
        f"Analysing {n} sub-groups in parallel (about 2 minutes). While this runs: "
        f"**where might helping one of these groups come at a cost to another?**\n\n"
    ))

    texts: list[str | None] = [None] * n

    async def _run_one(i: int, sg: dict[str, Any]) -> AsyncIterator[tuple[str, Any]]:
        sg_name = sg.get("name", f"Sub-group {i + 1}")
        section_id = f"sg_{i}"
        logger.info("[chain] --- Sub-group %d/%d START: '%s' ---", i + 1, n, sg_name)
        yield ("data", {"type": "heartbeat"})
        yield ("data", {
            "type": "analysis_step",
            "step": "subgroup",
            "index": i,
            "name": sg_name,
            "status": "active",
        })
        try:
            sg_start = time.monotonic()
            analysis_text: list[str] = []
            sg_raw_searches: list[dict[str, Any]] = []
            async for part in _stream_subgroup_with_tools(
                client, policy_spec, sg, retriever,
                raw_searches=sg_raw_searches,
                sg_index=i,
            ):
                if part[0] == "text":
                    analysis_text.append(part[1])
                    yield ("analysis_content", {
                        "section": section_id,
                        "delta": part[1],
                    })
                else:
                    yield part

            full_analysis = "".join(analysis_text)
            texts[i] = _strip_artifact_tail_blocks(full_analysis)
            step_summary = _extract_step_summary(full_analysis)
            if step_summary:
                yield ("data", {
                    "type": "step_summary",
                    "section_id": section_id,
                    "summary": step_summary,
                })
            summary_card = _extract_summary_card(full_analysis)
            if summary_card:
                yield ("data", {
                    "type": "summary_card",
                    "section_id": section_id,
                    "card": summary_card,
                })
            logger.info(
                "[chain] Sub-group %d/%d COMPLETE: '%s' — %d chars in %.1fs",
                i + 1, n, sg_name, len(full_analysis), time.monotonic() - sg_start,
            )
            if sg_raw_searches:
                yield ("data", {
                    "type": "subgroup_evidence",
                    "section_id": section_id,
                    "searches": sg_raw_searches,
                })
            yield ("data", {
                "type": "analysis_step",
                "step": "subgroup",
                "index": i,
                "status": "complete",
            })
            direction = (summary_card or {}).get("impact_direction")
            if not (isinstance(direction, str) and direction.strip()):
                direction = step_summary
            line = f"✓ **{sg_name}**"
            if isinstance(direction, str) and direction.strip():
                line += f" — {direction.strip()}"
            yield ("text", line + "\n\n")
        except Exception:
            logger.exception(
                "[chain] Sub-group %d/%d FAILED: '%s'", i + 1, n, sg_name,
            )
            yield ("analysis_content", {
                "section": section_id,
                "delta": (
                    f"\n\n> **Analysis error**: The analysis for sub-group "
                    f"\"{sg_name}\" could not be completed. "
                    f"The remaining sub-groups will continue.\n\n"
                ),
            })
            yield ("data", {
                "type": "analysis_step",
                "step": "subgroup",
                "index": i,
                "status": "error",
            })
            yield ("text", f"✗ **{sg_name}** — analysis failed\n\n")

    factories = [
        (lambda i=i, sg=sg: _run_one(i, sg))
        for i, sg in enumerate(confirmed_subgroups)
    ]
    async for part in _merge_streams(factories, settings.subgroup_concurrency):
        yield part

    completed_count = sum(t is not None for t in texts)
    logger.info(
        "[chain] === SUB-GROUP ANALYSES COMPLETE === %d/%d succeeded in %.1fs",
        completed_count, n, time.monotonic() - chain_start,
    )

    if completed_count:
        # Index order with placeholders: SGn labels are positional on the frontend.
        analysis_texts = [
            {
                "id": f"sg_{i}",
                "name": sg.get("name", f"Sub-group {i + 1}"),
                "text": texts[i] or _FAILED_SUBGROUP_TEXT,
            }
            for i, sg in enumerate(confirmed_subgroups)
        ]
        async for part in stream_synthesis_only(
            messages=messages, analysis_texts=analysis_texts,
        ):
            yield part
    else:
        yield ("text", "All sub-group analyses failed, so there is nothing to synthesise.\n\n")

    logger.info("[chain] === CHAIN COMPLETE === in %.1fs", time.monotonic() - chain_start)
    yield ("data", {"type": "stage_transition", "stage": "chatting"})


async def stream_synthesis_only(
    *,
    messages: list[ChatMessage],
    analysis_texts: list[dict[str, str]],
) -> AsyncIterator[tuple[str, Any]]:
    """Run the equity synthesis, then offer deep-dive suggestions in chat.

    Called inline at the end of the analysis chain, or standalone for re-runs.
    Does not emit stage_transition; callers do.

    Args:
        messages: Conversation history (used to extract policy specification).
        analysis_texts: List of dicts with 'name', 'text' (and optional 'id') for
            each sub-group analysis, in index order.

    Yields:
        Tuples of ("text", content), ("analysis_content", dict), or ("data", event_dict).
    """
    client = _get_client()
    policy_spec = _extract_policy_spec_from_history(messages)

    logger.info(
        "[synthesis] === SYNTHESIS START === %d sub-group analyses provided",
        len(analysis_texts),
    )
    yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "active"})

    parser = _SynthesisSectionParser()
    followups: Any = None

    def drain() -> list[tuple[str, Any]]:
        nonlocal followups
        parser.drain_section_transitions()
        parts: list[tuple[str, Any]] = []
        for section_id, summary in parser.drain_pending_step_summaries():
            parts.append(("data", {
                "type": "step_summary",
                "section_id": section_id,
                "summary": summary,
            }))
            label = _SYNTHESIS_SECTION_NAMES.get(section_id, section_id)
            parts.append(("text", f"✓ **{label}** complete. *{summary}*\n\n"))
        for section_id, card in parser.drain_pending_summary_cards():
            if section_id == "design_improvements":
                followups = card.get("suggested_followups")
            parts.append(("data", {
                "type": "summary_card",
                "section_id": section_id,
                "card": card,
            }))
        return parts

    def content(chunks: list[tuple[str, str]]) -> list[tuple[str, Any]]:
        return [
            ("analysis_content", {"section": section_id, "delta": delta})
            for section_id, delta in chunks if delta
        ]

    try:
        synthesis_start = time.monotonic()
        async for part in _stream_synthesis(client, policy_spec, analysis_texts):
            if part[0] != "text":
                yield part
                continue
            chunks = parser.feed(part[1])
            for p in drain() + content(chunks):
                yield p
        for p in content(parser.flush()) + drain():
            yield p
        logger.info(
            "[synthesis] COMPLETE in %.1fs",
            time.monotonic() - synthesis_start,
        )
        yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "complete"})
    except Exception:
        logger.exception("[synthesis] FAILED")
        yield ("analysis_content", {
            "section": "equity_assessment",
            "delta": (
                "\n\n> **Analysis error**: The equity synthesis could not be completed. "
                "The per-sub-group analyses above are still available.\n\n"
            ),
        })
        yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "error"})

    if not (
        isinstance(followups, list)
        and len([f for f in followups if isinstance(f, str) and f.strip()]) >= 3
    ):
        followups = _FALLBACK_FOLLOWUPS
    chips = [f.strip() for f in followups if isinstance(f, str) and f.strip()][:3]
    yield ("text", (
        "\n\nAsk anything about the reports, or pick a deep-dive:\n"
        f"<suggested_answers>{json.dumps(chips, ensure_ascii=False)}</suggested_answers>"
    ))


async def stream_response(
    *,
    stage: ConversationStage,
    messages: list[ChatMessage],
    evidence: list[RetrievalResult] | None = None,
    spec_state: dict[str, Any] | None = None,
    confirmed_subgroups: list[dict[str, Any]] | None = None,
    run_synthesis: bool = False,
    analysis_texts: list[dict[str, str]] | None = None,
    retriever: HybridRetriever | None = None,
) -> AsyncIterator[tuple[str, Any]]:
    """Stream an LLM response, yielding typed parts for the data stream formatter.

    Selects the appropriate system prompt based on the conversation stage.

    Args:
        stage: Current conversation stage determining prompt and behaviour.
        messages: Conversation history including the latest user message.
        evidence: Retrieved evidence chunks (only used in 'chatting' stage).
        spec_state: Current specification state from the frontend sidebar.
        confirmed_subgroups: Confirmed sub-groups for the analysis chain.
        run_synthesis: Whether to re-run the synthesis on its own (no longer sent by
            the frontend; kept for re-runs).
        analysis_texts: Report texts ({id?, name, text}) sent from the frontend; used
            for a synthesis re-run and to ground chatting-stage replies.
        retriever: Evidence retriever (required for 'analysing' stage with confirmed sub-groups).

    Yields:
        Tuples of (type, content) where type is 'text' or 'data'.
    """
    settings = get_settings()
    client = _get_client()

    if run_synthesis and analysis_texts:
        async for part in stream_synthesis_only(
            messages=messages,
            analysis_texts=analysis_texts,
        ):
            yield part
        yield ("data", {"type": "stage_transition", "stage": "chatting"})
        return

    if stage == "analysing" and confirmed_subgroups:
        async for part in stream_analysis_chain(
            messages=messages,
            confirmed_subgroups=confirmed_subgroups,
            retriever=retriever,
        ):
            yield part
        return

    if stage == "analysing":
        raw_prompt = _load_prompt("analysis_scan.md")
        policy_spec = _extract_policy_spec_from_history(messages)
        system_prompt = raw_prompt.replace("{{POLICY_SPECIFICATION}}", policy_spec)
        evidence_context = None

        logger.info("[scan] Starting population relevance scan")
        yield ("data", {"type": "analysis_step", "step": "scan", "status": "active"})
        yield ("text", (
            "I'm now assessing which population characteristics this policy "
            "interacts with — this takes a minute or two.\n\n"
            "While I work, it's worth jotting down your own view: **which population "
            "groups would you expect to be most affected by this policy, and would "
            "they benefit or lose out?** Comparing your expectations against the "
            "assessment is a useful check on both.\n\n"
        ))

        api_messages = _build_messages(
            system_prompt=system_prompt,
            messages=messages,
        )

        logger.info("[scan] Calling LLM (model=%s)", settings.openai_scan_model)
        scan_kwargs: dict[str, Any] = dict(
            model=settings.openai_scan_model,
            messages=api_messages,
            stream=True,
            stream_options={"include_usage": True},
            max_completion_tokens=6000,
            name="relevance-scan",
        )
        if settings.openai_scan_reasoning_effort:
            scan_kwargs["reasoning_effort"] = settings.openai_scan_reasoning_effort
        stream = await client.chat.completions.create(**scan_kwargs)

        full_response: list[str] = []
        token_count = 0
        _scan_category_headings = {
            "### Geography",
            "### Household and Financial Context",
            "### Time, Routine and Domestic Capacity",
            "### Emotional and Cognitive Bandwidth",
            "### Diet, Food and Health Needs",
            "### Ethnicity and Cultural Food Practices",
        }
        categories_seen = 0
        line_buffer = ""

        async for chunk in stream:
            if not chunk.choices:
                continue  # final usage-only chunk from include_usage
            delta = chunk.choices[0].delta
            if delta.content:
                full_response.append(delta.content)
                token_count += 1
                if token_count == 1:
                    logger.info("[scan] First token received — streaming to panel")

                line_buffer += delta.content
                while "\n" in line_buffer:
                    line, line_buffer = line_buffer.split("\n", 1)
                    stripped = line.strip()
                    if stripped in _scan_category_headings:
                        if categories_seen > 0:
                            yield ("data", {
                                "type": "scan_category_complete",
                                "completed": categories_seen,
                                "total": 6,
                            })
                        categories_seen += 1

                yield ("analysis_content", {
                    "section": "scan",
                    "delta": delta.content,
                })

        if categories_seen > 0:
            yield ("data", {
                "type": "scan_category_complete",
                "completed": categories_seen,
                "total": 6,
            })

        logger.info(
            "[scan] Stream complete — %d chunks received, %d categories detected",
            token_count, categories_seen,
        )
        yield ("data", {"type": "analysis_step", "step": "scan", "status": "complete"})

        full_text = "".join(full_response)
        scan_card = _extract_summary_card(full_text)
        if scan_card:
            yield ("data", {
                "type": "summary_card",
                "section_id": "scan",
                "card": scan_card,
            })
        subgroups_data = _extract_subgroups_from_response(full_text)
        if subgroups_data is not None:
            relevance_scan = subgroups_data.get("relevance_scan", {})
            high_count = sum(
                1 for v in relevance_scan.values()
                if isinstance(v, str) and v.upper() == "HIGH"
            )
            subgroup_count = len(subgroups_data.get("subgroups", []))
            logger.info(
                "[scan] Extracted %d sub-groups, %d HIGH-relevance characteristics",
                subgroup_count,
                high_count,
            )

            yield ("data", {
                "type": "proposed_sub_groups",
                **subgroups_data,
            })

            scan_summary_text = ""
            finding_bullets = ""
            if scan_card:
                if isinstance(scan_card.get("summary"), str):
                    scan_summary_text = f" {scan_card['summary']}"
                findings = scan_card.get("key_findings")
                if isinstance(findings, list):
                    lines = [
                        f"- {f.strip()}"
                        for f in findings
                        if isinstance(f, str) and f.strip()
                    ][:3]
                    if lines:
                        finding_bullets = "\n\n" + "\n".join(lines)

            summary = (
                f"I've assessed all population characteristics against this policy — "
                f"{high_count} rated as highly relevant."
                f"{scan_summary_text}"
                f"{finding_bullets}\n\n"
                f"I've proposed {subgroup_count} sub-groups for detailed analysis. "
                f"Review and confirm them in the sidebar — the full relevance "
                f"assessment is available in the analysis panel if you want the detail."
            )
            yield ("text", summary)
        else:
            logger.warning("[scan] Failed to extract sub-groups from scan response")

        return

    if stage == "specifying":
        raw_prompt = _load_prompt("socratic.md")
        system_prompt = raw_prompt.replace(
            "{{CURRENT_SPEC_STATE}}",
            _format_spec_state(spec_state),
        )
        evidence_context = None
    else:
        system_prompt = _load_prompt("system.md").replace(
            "{{POLICY_SPECIFICATION}}", _extract_policy_spec_from_history(messages),
        ).replace(
            "{{ANALYSIS_REPORTS}}",
            _format_analyses(analysis_texts) if analysis_texts
            else "No analysis has been run yet.",
        )
        evidence_context = _format_evidence_context(evidence or [])

    api_messages = _build_messages(
        system_prompt=system_prompt,
        messages=messages,
        evidence_context=evidence_context,
    )

    model = (
        settings.openai_socratic_model
        if stage == "specifying"
        else settings.openai_chat_model
    )
    reasoning_effort = (
        settings.openai_socratic_reasoning_effort
        if stage == "specifying"
        else settings.openai_chat_reasoning_effort
    )

    chat_kwargs: dict[str, Any] = dict(
        model=model,
        messages=api_messages,
        stream=True,
        stream_options={"include_usage": True},
        name="socratic-specification" if stage == "specifying" else "evidence-chat",
    )
    if reasoning_effort:
        chat_kwargs["reasoning_effort"] = reasoning_effort
    if stage != "specifying":
        chat_kwargs["max_completion_tokens"] = 3000

    stream = await client.chat.completions.create(**chat_kwargs)

    full_response = []
    async for chunk in stream:
        if not chunk.choices:
            continue  # final usage-only chunk from include_usage
        delta = chunk.choices[0].delta
        if delta.content:
            full_response.append(delta.content)
            yield ("text", delta.content)

    if stage == "specifying":
        full_text = "".join(full_response)
        spec_data = _extract_spec_from_response(full_text)
        if spec_data is not None:
            yield ("data", spec_data)
