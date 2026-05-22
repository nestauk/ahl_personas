import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from openai import APIError, AsyncOpenAI

from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.evidence.retriever import HybridRetriever
from food_policy_impact_tool.models.chat import ChatMessage, ConversationStage, SpecMetadata
from food_policy_impact_tool.models.evidence import RetrievalResult

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

_SYNTHESIS_SECTION_PROGRESS: dict[str, str] = {
    "equity_assessment": (
        "Synthesising equity assessment — identifying who benefits most and least "
        "across all sub-groups...\n\n"
    ),
    "risks_provocations": (
        "Identifying evidence gaps, assumption risks, and equity tensions...\n\n"
    ),
    "design_improvements": (
        "Generating design improvement recommendations...\n\n"
    ),
}


def _format_evidence_gathered_message(source_names: list[str]) -> str:
    """Format a chat progress line after evidence retrieval, before analysis writing."""
    if not source_names:
        return (
            "Evidence search complete — reasoning from sub-group constraints "
            "and policy context...\n\n"
        )
    n = len(source_names)
    label = "source" if n == 1 else "sources"
    return f"Found relevant evidence across {n} {label}.\n\n"


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


SEARCH_EVIDENCE_TOOL = {
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
        lines.append("\nAnalyse the shared pattern with examples from across these modifiers, not a deep-dive into one.")

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
    client: AsyncOpenAI,
    **kwargs: Any,
) -> Any:
    """Call chat.completions.create with retry on transient errors."""
    settings = get_settings()
    last_error = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return await client.chat.completions.create(**kwargs)
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
) -> AsyncIterator[tuple[str, Any]]:
    """Run a per-sub-group analysis call with search_evidence tool calling.

    Handles the tool call loop: streams text, intercepts tool calls, executes
    them via the retriever, feeds results back, and continues until done.

    Args:
        client: OpenAI async client.
        policy_spec: Formatted policy specification text.
        sub_group: The sub-group dict with name, modifiers, rationale.
        retriever: Evidence retriever for tool calls.
        raw_searches: Mutable list that receives raw search records (query + chunks)
            for each tool call. Caller reads this after iteration completes.

    Yields:
        Tuples of ("text", content), ("progress", chat_status_line), or ("data", event_dict).
        LLM analysis tokens use ("text", ...); callers route those to the reading panel only.
        ("progress", ...) lines are short chat narration and must be forwarded as ("text", ...).
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
                f"Use the search_evidence tool to find relevant evidence from the "
                f"curated evidence base. Search for evidence on multiple dimensions "
                f"(financial impact, food access, shopping behaviour, cooking capacity, "
                f"health outcomes) as relevant to this sub-group's material constraints."
            ),
        },
    ]

    sg_name = sub_group.get("name", "Unknown sub-group")
    tool_call_round = 0
    sg_start = time.monotonic()
    had_tool_calls = False
    all_source_names: list[str] = []
    evidence_progress_sent = False
    writing_progress_sent = False
    logger.info("[subgroup] START '%s' — calling LLM with search_evidence tool", sg_name)

    while True:
        tool_call_round += 1
        round_start = time.monotonic()
        logger.info(
            "[subgroup] '%s' round %d — sending to LLM (%d messages)",
            sg_name, tool_call_round, len(api_messages),
        )

        subgroup_kwargs: dict[str, Any] = dict(
            model=settings.openai_analysis_model,
            messages=api_messages,
            tools=[SEARCH_EVIDENCE_TOOL],
            stream=True,
        )
        if settings.openai_analysis_reasoning_effort:
            subgroup_kwargs["reasoning_effort"] = settings.openai_analysis_reasoning_effort

        stream = await _stream_with_retry(client, **subgroup_kwargs)

        collected_text: list[str] = []
        tool_calls_by_index: dict[int, dict[str, Any]] = {}
        finish_reason = None
        first_token = True

        async for chunk in stream:
            choice = chunk.choices[0]
            finish_reason = choice.finish_reason
            delta = choice.delta

            if delta.content:
                if first_token:
                    logger.info(
                        "[subgroup] '%s' round %d — first text token after %.1fs",
                        sg_name, tool_call_round,
                        time.monotonic() - round_start,
                    )
                    first_token = False
                    if had_tool_calls and not evidence_progress_sent:
                        yield (
                            "progress",
                            _format_evidence_gathered_message(all_source_names),
                        )
                        evidence_progress_sent = True
                    if not writing_progress_sent:
                        yield (
                            "progress",
                            "Writing detailed impact analysis for this sub-group...\n\n",
                        )
                        writing_progress_sent = True
                collected_text.append(delta.content)
                yield ("text", delta.content)

            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tool_calls_by_index:
                        tool_calls_by_index[idx] = {
                            "id": "",
                            "function": {"name": "", "arguments": ""},
                        }
                    tc = tool_calls_by_index[idx]
                    if tc_delta.id:
                        tc["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            tc["function"]["name"] += tc_delta.function.name
                        if tc_delta.function.arguments:
                            tc["function"]["arguments"] += tc_delta.function.arguments

        round_elapsed = time.monotonic() - round_start

        if finish_reason == "tool_calls" and tool_calls_by_index:
            had_tool_calls = True
            logger.info(
                "[subgroup] '%s' round %d — LLM requested %d tool call(s) after %.1fs",
                sg_name, tool_call_round, len(tool_calls_by_index), round_elapsed,
            )

            assistant_msg: dict[str, Any] = {"role": "assistant"}
            if collected_text:
                assistant_msg["content"] = "".join(collected_text)
            else:
                assistant_msg["content"] = None
            assistant_msg["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": tc["function"],
                }
                for tc in tool_calls_by_index.values()
            ]
            api_messages.append(assistant_msg)

            for tc in tool_calls_by_index.values():
                fn_name = tc["function"]["name"]
                if fn_name == "search_evidence":
                    try:
                        args = json.loads(tc["function"]["arguments"])
                        query = args.get("query", "")
                    except json.JSONDecodeError:
                        query = tc["function"]["arguments"]

                    yield ("data", {"type": "evidence_search", "query": query})

                    retrieve_start = time.monotonic()
                    results = retriever.retrieve(query, top_k=8)
                    tool_response = _format_tool_evidence(results, query=query)
                    retrieve_ms = (time.monotonic() - retrieve_start) * 1000

                    logger.info(
                        "[subgroup] '%s' — search_evidence('%s') → %d chunks in %.0fms",
                        sg_name, query[:60], len(results), retrieve_ms,
                    )

                    source_names = list(dict.fromkeys(
                        r.chunk.source.source_name for r in results
                    ))
                    for name in source_names:
                        if name not in all_source_names:
                            all_source_names.append(name)

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
                        "source_names": source_names,
                    })
                else:
                    tool_response = f"Unknown tool: {fn_name}"

                api_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_response,
                })

            # Keepalive before the next LLM round — prevents the browser
            # from flagging the connection as unresponsive during the wait
            # for the LLM to process tool results and start generating.
            yield ("data", {"type": "heartbeat"})
            collected_text = []
        else:
            text_len = sum(len(t) for t in collected_text)
            logger.info(
                "[subgroup] '%s' round %d — generation complete, "
                "%d chars in %.1fs (total %.1fs)",
                sg_name, tool_call_round, text_len,
                round_elapsed, time.monotonic() - sg_start,
            )
            break


async def _stream_synthesis(
    client: AsyncOpenAI,
    policy_spec: str,
    sub_group_analyses: list[dict[str, str]],
) -> AsyncIterator[tuple[str, Any]]:
    """Run the equity synthesis and provocations call.

    Args:
        client: OpenAI async client.
        policy_spec: Formatted policy specification text.
        sub_group_analyses: List of dicts with 'name' and 'text' for each completed sub-group.

    Yields:
        Tuples of ("text", content).
    """
    settings = get_settings()
    raw_prompt = _load_prompt("analysis_synthesis.md")

    mapping_lines = [
        f"- SG{i}: {analysis['name']}"
        for i, analysis in enumerate(sub_group_analyses, 1)
    ]
    analyses_text = (
        "Sub-group reference labels:\n"
        + "\n".join(mapping_lines)
        + "\n"
    )
    for i, analysis in enumerate(sub_group_analyses, 1):
        analyses_text += (
            f"\n\n### SG{i}: {analysis['name']}\n\n{analysis['text']}"
        )

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
    )
    if settings.openai_analysis_reasoning_effort:
        synthesis_kwargs["reasoning_effort"] = settings.openai_analysis_reasoning_effort

    stream = await _stream_with_retry(client, **synthesis_kwargs)

    first_token = True
    synth_start = time.monotonic()
    async for chunk in stream:
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
    """Run per-sub-group analyses, then pause for analyst review before synthesis.

    The chain stops after all sub-group analyses and emits a checkpoint event.
    Synthesis is triggered separately via stream_synthesis_only().

    Args:
        messages: Conversation history (used to extract policy specification).
        confirmed_subgroups: List of sub-group dicts from the frontend.
        retriever: Evidence retriever for tool calls.

    Yields:
        Tuples of ("text", content), ("analysis_content", dict), or ("data", event_dict).
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

    completed_count = 0

    for i, sg in enumerate(confirmed_subgroups):
        sg_name = sg.get("name", f"Sub-group {i + 1}")
        logger.info("[chain] --- Sub-group %d/%d: '%s' ---", i + 1, n, sg_name)
        yield ("data", {"type": "heartbeat"})
        yield ("data", {
            "type": "analysis_step",
            "step": "subgroup",
            "index": i,
            "name": sg_name,
            "status": "active",
        })

        yield ("text", f"Analysing impacts for **{sg_name}**...\n\n")

        section_id = f"sg_{i}"
        try:
            sg_start = time.monotonic()
            analysis_text: list[str] = []
            sg_raw_searches: list[dict[str, Any]] = []
            async for part in _stream_subgroup_with_tools(
                client, policy_spec, sg, retriever,
                raw_searches=sg_raw_searches,
            ):
                if part[0] == "progress":
                    yield ("text", part[1])
                elif part[0] == "text":
                    analysis_text.append(part[1])
                    yield ("analysis_content", {
                        "section": section_id,
                        "delta": part[1],
                    })
                else:
                    yield part

            sg_elapsed = time.monotonic() - sg_start
            full_analysis = "".join(analysis_text)
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
            text_len = len(full_analysis)
            completed_count += 1
            logger.info(
                "[chain] Sub-group %d/%d COMPLETE: '%s' — %d chars in %.1fs",
                i + 1, n, sg_name, text_len, sg_elapsed,
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
            summary_line = f" *{step_summary}*" if step_summary else ""
            if i + 1 < n:
                next_name = confirmed_subgroups[i + 1].get(
                    "name", f"Sub-group {i + 2}",
                )
                yield (
                    "text",
                    f"✓ Completed analysis for **{sg_name}**.{summary_line} "
                    f"Moving to **{next_name}**...\n\n",
                )
            else:
                yield (
                    "text",
                    f"✓ Completed analysis for **{sg_name}**.{summary_line} "
                    f"All sub-group analyses complete.\n\n",
                )
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
            yield ("text", (
                f"Analysis for **{sg_name}** encountered an error. "
                f"Continuing with the remaining sub-groups.\n\n"
            ))

    chain_elapsed = time.monotonic() - chain_start
    logger.info(
        "[chain] === SUB-GROUP ANALYSES COMPLETE === "
        "%d/%d succeeded in %.1fs — pausing for analyst review",
        completed_count, n, chain_elapsed,
    )

    yield ("data", {"type": "analysis_checkpoint", "subgroup_count": n})
    yield ("data", {"type": "stage_transition", "stage": "chatting"})
    yield ("text", (
        f"All {n} sub-group analyses complete. The analysis panel contains detailed "
        f"findings for each population group. Review them, then click **Run synthesis** "
        f"in the sidebar to generate the equity assessment, risks analysis, and design "
        f"recommendations."
    ))


async def stream_synthesis_only(
    *,
    messages: list[ChatMessage],
    analysis_texts: list[dict[str, str]],
) -> AsyncIterator[tuple[str, Any]]:
    """Run the equity synthesis as a standalone call, triggered after the checkpoint.

    Args:
        messages: Conversation history (used to extract policy specification).
        analysis_texts: List of dicts with 'name' and 'text' for each sub-group analysis,
            sent from the frontend's accumulated analysis sections.

    Yields:
        Tuples of ("text", content), ("analysis_content", dict), or ("data", event_dict).
    """
    settings = get_settings()
    client = _get_client()

    policy_spec = _extract_policy_spec_from_history(messages)

    n_analyses = len(analysis_texts)
    logger.info(
        "[synthesis] === SYNTHESIS START === %d sub-group analyses provided",
        n_analyses,
    )
    yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "active"})
    yield (
        "text",
        f"Beginning equity synthesis across {n_analyses} sub-group analyses...\n\n",
    )

    try:
        synthesis_start = time.monotonic()
        parser = _SynthesisSectionParser()
        synthesis_sections_announced: set[str] = set()

        async for part in _stream_synthesis(client, policy_spec, analysis_texts):
            if part[0] == "text":
                if "equity_assessment" not in synthesis_sections_announced:
                    yield ("text", _SYNTHESIS_SECTION_PROGRESS["equity_assessment"])
                    synthesis_sections_announced.add("equity_assessment")
                chunks = parser.feed(part[1])
                for transition in parser.drain_section_transitions():
                    if transition not in synthesis_sections_announced:
                        yield ("text", _SYNTHESIS_SECTION_PROGRESS[transition])
                        synthesis_sections_announced.add(transition)
                for section_id, summary in parser.drain_pending_step_summaries():
                    yield ("data", {
                        "type": "step_summary",
                        "section_id": section_id,
                        "summary": summary,
                    })
                    label = _SYNTHESIS_SECTION_NAMES.get(section_id, section_id)
                    yield ("text", f"✓ **{label}** complete. *{summary}*\n\n")
                for section_id, card in parser.drain_pending_summary_cards():
                    yield ("data", {
                        "type": "summary_card",
                        "section_id": section_id,
                        "card": card,
                    })
                for section_id, content_delta in chunks:
                    if content_delta:
                        yield ("analysis_content", {
                            "section": section_id,
                            "delta": content_delta,
                        })
            else:
                yield part
        flush_chunks = parser.flush()
        for transition in parser.drain_section_transitions():
            if transition not in synthesis_sections_announced:
                yield ("text", _SYNTHESIS_SECTION_PROGRESS[transition])
                synthesis_sections_announced.add(transition)
        for section_id, summary in parser.drain_pending_step_summaries():
            yield ("data", {
                "type": "step_summary",
                "section_id": section_id,
                "summary": summary,
            })
            label = _SYNTHESIS_SECTION_NAMES.get(section_id, section_id)
            yield ("text", f"✓ **{label}** complete. *{summary}*\n\n")
        for section_id, card in parser.drain_pending_summary_cards():
            yield ("data", {
                "type": "summary_card",
                "section_id": section_id,
                "card": card,
            })
        for section_id, content_delta in flush_chunks:
            if content_delta:
                yield ("analysis_content", {
                    "section": section_id,
                    "delta": content_delta,
                })
        for section_id, summary in parser.drain_pending_step_summaries():
            yield ("data", {
                "type": "step_summary",
                "section_id": section_id,
                "summary": summary,
            })
            label = _SYNTHESIS_SECTION_NAMES.get(section_id, section_id)
            yield ("text", f"✓ **{label}** complete. *{summary}*\n\n")
        for section_id, card in parser.drain_pending_summary_cards():
            yield ("data", {
                "type": "summary_card",
                "section_id": section_id,
                "card": card,
            })
        logger.info(
            "[synthesis] COMPLETE in %.1fs",
            time.monotonic() - synthesis_start,
        )
        yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "complete"})
        yield (
            "text",
            "✓ Synthesis complete. Three artifacts generated: Equity Assessment, "
            "Risks & Provocations, and Design Improvements.\n\n",
        )
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

    yield ("data", {"type": "stage_transition", "stage": "chatting"})


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
        run_synthesis: Whether to run the synthesis call (triggered after checkpoint).
        analysis_texts: Per-sub-group analysis texts for synthesis (sent from frontend).
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

        api_messages = _build_messages(
            system_prompt=system_prompt,
            messages=messages,
        )

        logger.info("[scan] Calling LLM (model=%s)", settings.openai_scan_model)
        scan_kwargs: dict[str, Any] = dict(
            model=settings.openai_scan_model,
            messages=api_messages,
            stream=True,
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
            if scan_card and isinstance(scan_card.get("summary"), str):
                scan_summary_text = f" *{scan_card['summary']}*"

            summary = (
                f"I've assessed all population characteristics against this policy. "
                f"{high_count} rated as highly relevant — "
                f"see the full assessment in the analysis panel."
                f"{scan_summary_text} "
                f"I've proposed {subgroup_count} sub-groups for detailed analysis. "
                f"Review and confirm them in the sidebar."
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
        system_prompt = _load_prompt("system.md")
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
    )
    if reasoning_effort:
        chat_kwargs["reasoning_effort"] = reasoning_effort

    stream = await client.chat.completions.create(**chat_kwargs)

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
