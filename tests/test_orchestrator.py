import asyncio
import json

from food_policy_impact_tool.llm.orchestrator import _merge_streams, _SynthesisSectionParser


def _source(name: str, n: int, log: list[str] | None = None):
    async def gen():
        if log is not None:
            log.append(f"start {name}")
        for i in range(n):
            await asyncio.sleep(0)
            yield (name, i)
        if log is not None:
            log.append(f"end {name}")

    return gen


async def _collect(factories, limit):
    return [item async for item in _merge_streams(factories, limit)]


def test_merge_streams_interleaves_and_preserves_per_source_order():
    items = asyncio.run(_collect([_source("a", 5), _source("b", 5)], limit=2))

    assert sorted(items) == [(s, i) for s in "ab" for i in range(5)]
    for s in "ab":
        assert [i for name, i in items if name == s] == list(range(5))
    # Interleaved, not one source after the other.
    names = [name for name, _ in items]
    assert names != sorted(names)


def test_merge_streams_respects_limit():
    log: list[str] = []
    items = asyncio.run(_collect([_source("a", 3, log), _source("b", 3, log)], limit=1))

    assert [name for name, _ in items] == ["a"] * 3 + ["b"] * 3
    assert log == ["start a", "end a", "start b", "end b"]


def _card(section: str, **extra) -> str:
    card = {"summary": f"{section} summary", "key_findings": ["x", "y", "z"], **extra}
    return f"<summary_card>\n{json.dumps(card)}\n</summary_card>\n"


def test_synthesis_parser_routes_sections_and_drains_cards():
    followups = ["Deep-dive?", "Compare?", "Gap?"]
    text = (
        "<!-- SECTION: equity_assessment -->\n## Equity Assessment\n\n"
        "**Inequality likely widens.**\n\n### Who benefits most\n\n- **A**: yes\n\n"
        "<step_summary>Equity summary.</step_summary>\n"
        + _card("equity_assessment", inequality_direction="widens")
        + "<!-- SECTION: risks_provocations -->\n## Risks & Provocations\n\n"
        "### Evidence gaps\n\n- **Gap**: none\n\n"
        "<step_summary>Risks summary.</step_summary>\n"
        + _card("risks_provocations")
        + "<!-- SECTION: design_improvements -->\n## Design Improvements\n\n"
        "Challenges against your outcomes of interest: diet quality.\n\n"
        "### Diet quality\n\n- **Challenge**: a. **Change**: b.\n\n"
        "<step_summary>Design summary.</step_summary>\n" + _card("design_improvements", suggested_followups=followups)
    )

    parser = _SynthesisSectionParser()
    routed: dict[str, str] = {}
    summaries: dict[str, str] = {}
    cards: dict[str, dict] = {}

    def drain():
        summaries.update(parser.drain_pending_step_summaries())
        cards.update(parser.drain_pending_summary_cards())

    for i in range(0, len(text), 7):
        for section, delta in parser.feed(text[i : i + 7]):
            routed[section] = routed.get(section, "") + delta
        drain()
    for section, delta in parser.flush():
        routed[section] = routed.get(section, "") + delta
    drain()

    assert set(routed) == {"equity_assessment", "risks_provocations", "design_improvements"}
    assert "### Who benefits most" in routed["equity_assessment"]
    assert "### Evidence gaps" in routed["risks_provocations"]
    assert "### Diet quality" in routed["design_improvements"]
    assert "SECTION" not in "".join(routed.values())
    assert summaries == {
        "equity_assessment": "Equity summary.",
        "risks_provocations": "Risks summary.",
        "design_improvements": "Design summary.",
    }
    assert set(cards) == set(routed)
    assert cards["design_improvements"]["suggested_followups"] == followups


def test_synthesis_parser_consumes_split_heading_lines():
    """A heading line arriving in small chunks must not leave a stray "## " behind."""
    text = (
        "<!-- SECTION: equity_assessment -->\n## Equity Assessment\n**Bold**\n"
        "<!-- SECTION: risks_provocations -->\n## Risks & Provocations\n### Evidence gaps\n"
        "<!-- SECTION: design_improvements -->\n## Design Improvements\nChallenges\n"
    )
    for size in (1, 3, 7, 11):
        parser = _SynthesisSectionParser()
        out = []
        for i in range(0, len(text), size):
            out += parser.feed(text[i : i + size])
        out += parser.flush()
        joined = {
            sid: "".join(c for s, c in out if s == sid)
            for sid in ("equity_assessment", "risks_provocations", "design_improvements")
        }
        assert joined["equity_assessment"] == "**Bold**\n", (size, joined)
        assert joined["risks_provocations"] == "### Evidence gaps\n", (size, joined)
        assert joined["design_improvements"] == "Challenges\n", (size, joined)
