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
_SPEC_BLOCK_PATTERN = re.compile(
    r"<policy_spec>\s*(.*?)\s*</policy_spec>",
    re.DOTALL,
)
_SUBGROUPS_BLOCK_PATTERN = re.compile(
    r"<proposed_sub_groups>\s*(.*?)\s*</proposed_sub_groups>",
    re.DOTALL,
)

_MAX_RETRIES = 2
_RETRY_STATUS_CODES = {429, 500, 503}

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


def _format_tool_evidence(results: list[RetrievalResult]) -> str:
    """Format retrieval results as a tool call response for the LLM."""
    if not results:
        return (
            "No relevant evidence was found in the curated evidence base for this "
            "query. Flag this area as an evidence gap [Gap] in your analysis and "
            "reason from the sub-group's material constraints if possible [Reasoning]."
        )

    sections: list[str] = []
    for i, result in enumerate(results, 1):
        source = result.chunk.source
        header = f"[Source {i}] {source.source_name}"
        if source.year:
            header += f" ({source.year})"
        if source.methodology:
            header += f" | Methodology: {source.methodology}"
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
    contains the structured policy specification.
    """
    for msg in reversed(messages):
        match = _SPEC_BLOCK_PATTERN.search(msg.content)
        if match:
            try:
                parsed = json.loads(match.group(1).strip())
                spec = parsed.get("spec", {})
                policy_name = parsed.get("policy_name", "Unknown policy")
                policy_desc = parsed.get("policy_description", "")

                lines = [f"**Policy**: {policy_name}"]
                if policy_desc:
                    lines.append(f"**Description**: {policy_desc}")
                lines.append("")

                for key, label in [
                    ("policy_lever", "Policy lever"),
                    ("in_scope_businesses", "In-scope businesses"),
                    ("business_size", "Business size"),
                    ("delivery_channel", "Delivery channel"),
                    ("population", "Population"),
                    ("geography", "Geography"),
                ]:
                    entry = spec.get(key, {})
                    values = entry.get("values", [])
                    source = entry.get("source", "empty")
                    if source == "not_applicable":
                        lines.append(f"- {label}: N/A")
                    elif values:
                        lines.append(f"- {label}: {'; '.join(values)}")
                    else:
                        lines.append(f"- {label}: Not specified")

                return "\n".join(lines)
            except (json.JSONDecodeError, KeyError):
                pass

    return "No policy specification found in conversation history."


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


def _format_subgroup_modifiers(sub_group: dict[str, Any]) -> str:
    """Format a sub-group's modifiers and features for prompt injection."""
    lines: list[str] = []
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
) -> AsyncIterator[tuple[str, Any]]:
    """Run a per-sub-group analysis call with search_evidence tool calling.

    Handles the tool call loop: streams text, intercepts tool calls, executes
    them via the retriever, feeds results back, and continues until done.

    Args:
        client: OpenAI async client.
        policy_spec: Formatted policy specification text.
        sub_group: The sub-group dict with name, modifiers, rationale.
        retriever: Evidence retriever for tool calls.

    Yields:
        Tuples of ("text", content) or ("data", event_dict).
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
    logger.info("[subgroup] START '%s' — calling LLM with search_evidence tool", sg_name)

    while True:
        tool_call_round += 1
        round_start = time.monotonic()
        logger.info(
            "[subgroup] '%s' round %d — sending to LLM (%d messages)",
            sg_name, tool_call_round, len(api_messages),
        )

        stream = await _stream_with_retry(
            client,
            model=settings.openai_model,
            messages=api_messages,
            tools=[SEARCH_EVIDENCE_TOOL],
            stream=True,
        )

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
                    tool_response = _format_tool_evidence(results)
                    retrieve_ms = (time.monotonic() - retrieve_start) * 1000

                    logger.info(
                        "[subgroup] '%s' — search_evidence('%s') → %d chunks in %.0fms",
                        sg_name, query[:60], len(results), retrieve_ms,
                    )

                    yield ("data", {
                        "type": "evidence_search_complete",
                        "query": query,
                        "num_results": len(results),
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

    analyses_text = ""
    for i, analysis in enumerate(sub_group_analyses, 1):
        analyses_text += f"\n\n### Sub-group {i}: {analysis['name']}\n\n{analysis['text']}"

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
                "Based on the per-sub-group analyses above, produce the cross-cutting "
                "equity assessment and provocations."
            ),
        },
    ]

    logger.info(
        "[synthesis] Calling LLM with %d sub-group analyses (%d chars of context)",
        len(sub_group_analyses),
        len(analyses_text),
    )

    stream = await _stream_with_retry(
        client,
        model=settings.openai_model,
        messages=api_messages,
        stream=True,
    )

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
    """Run the full analysis chain: per-sub-group analyses then synthesis.

    Manages the multi-call flow, emitting progress data messages between steps.
    Each sub-group call is wrapped in error handling so failures don't kill
    the entire chain.

    Args:
        messages: Conversation history (used to extract policy specification).
        confirmed_subgroups: List of sub-group dicts from the frontend.
        retriever: Evidence retriever for tool calls.

    Yields:
        Tuples of ("text", content) or ("data", event_dict).
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    chain_start = time.monotonic()
    n = len(confirmed_subgroups)
    logger.info(
        "[chain] === ANALYSIS CHAIN START === %d sub-groups to analyse",
        n,
    )

    policy_spec = _extract_policy_spec_from_history(messages)

    sub_group_analyses: list[dict[str, str]] = []

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

        section_id = f"sg_{i}"
        try:
            sg_start = time.monotonic()
            analysis_text: list[str] = []
            async for part in _stream_subgroup_with_tools(
                client, policy_spec, sg, retriever,
            ):
                if part[0] == "text":
                    analysis_text.append(part[1])
                    yield ("analysis_content", {
                        "section": section_id,
                        "delta": part[1],
                    })
                else:
                    yield part

            sg_elapsed = time.monotonic() - sg_start
            text_len = sum(len(t) for t in analysis_text)
            sub_group_analyses.append({
                "name": sg_name,
                "text": "".join(analysis_text),
            })
            logger.info(
                "[chain] Sub-group %d/%d COMPLETE: '%s' — %d chars in %.1fs",
                i + 1, n, sg_name, text_len, sg_elapsed,
            )
            yield ("data", {
                "type": "analysis_step",
                "step": "subgroup",
                "index": i,
                "status": "complete",
            })
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

    logger.info(
        "[chain] --- Synthesis: %d sub-group analyses available ---",
        len(sub_group_analyses),
    )
    yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "active"})

    try:
        synthesis_start = time.monotonic()
        async for part in _stream_synthesis(client, policy_spec, sub_group_analyses):
            if part[0] == "text":
                yield ("analysis_content", {
                    "section": "synthesis",
                    "delta": part[1],
                })
            else:
                yield part
        logger.info(
            "[chain] Synthesis COMPLETE in %.1fs",
            time.monotonic() - synthesis_start,
        )
        yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "complete"})
    except Exception:
        logger.exception("[chain] Synthesis FAILED")
        yield ("analysis_content", {
            "section": "synthesis",
            "delta": (
                "\n\n> **Analysis error**: The equity synthesis could not be completed. "
                "The per-sub-group analyses above are still available.\n\n"
            ),
        })
        yield ("data", {"type": "analysis_step", "step": "synthesis", "status": "error"})

    chain_elapsed = time.monotonic() - chain_start
    logger.info(
        "[chain] === ANALYSIS CHAIN COMPLETE === "
        "%d/%d sub-groups succeeded in %.1fs total",
        len(sub_group_analyses), n, chain_elapsed,
    )
    yield ("data", {"type": "stage_transition", "stage": "chatting"})


async def stream_response(
    *,
    stage: ConversationStage,
    messages: list[ChatMessage],
    evidence: list[RetrievalResult] | None = None,
    spec_state: dict[str, Any] | None = None,
    confirmed_subgroups: list[dict[str, Any]] | None = None,
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
        retriever: Evidence retriever (required for 'analysing' stage with confirmed sub-groups).

    Yields:
        Tuples of (type, content) where type is 'text' or 'data'.
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

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

        yield ("data", {"type": "analysis_step", "step": "scan", "status": "active"})

        api_messages = _build_messages(
            system_prompt=system_prompt,
            messages=messages,
        )

        stream = await client.chat.completions.create(
            model=settings.openai_model,
            messages=api_messages,
            stream=True,
        )

        full_response: list[str] = []
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                full_response.append(delta.content)
                yield ("text", delta.content)

        yield ("data", {"type": "analysis_step", "step": "scan", "status": "complete"})

        full_text = "".join(full_response)
        subgroups_data = _extract_subgroups_from_response(full_text)
        if subgroups_data is not None:
            yield ("data", {
                "type": "proposed_sub_groups",
                **subgroups_data,
            })

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
