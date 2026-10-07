"""Replay one stage of the tool against a saved fixture, for prompt iteration.

    uv run python scripts/replay.py <stage> fixtures/<name>.json [options]

Stages (and the prompt each one exercises):
    socratic   first Socratic turn from fixture["policy_description"]   socratic.md
    scan       relevance scan + sub-group proposal from the spec          analysis_scan.md
    subgroup   one sub-group analysis (--subgroup N, default 0)          analysis_subgroup.md
    synthesis  synthesis from the saved sub-group texts                  analysis_synthesis.md
    chat       one follow-up question over the saved reports             system.md
    chain      scan (if no sub-groups saved) + all sub-groups + synthesis

Each run writes replays/<fixture>-<stage>-<timestamp>.md: what the analyst would see
(cards, chips, collapsed headings), automatic checks against the prompt budgets, then
the raw output. Pass --save-fixture after scan/subgroup/chain to store the new
sub-groups / texts back into the fixture for later synthesis and chat replays.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from food_policy_impact_tool.core.config import get_settings  # noqa: E402
from food_policy_impact_tool.evidence.retriever import HybridRetriever  # noqa: E402
from food_policy_impact_tool.evidence.store import EvidenceStore  # noqa: E402
from food_policy_impact_tool.llm import orchestrator as orch  # noqa: E402
from food_policy_impact_tool.models.chat import ChatMessage  # noqa: E402

PROMPTS = ROOT / "src/food_policy_impact_tool/llm/prompts"
STAGE_PROMPT = {
    "socratic": "socratic.md",
    "scan": "analysis_scan.md",
    "subgroup": "analysis_subgroup.md",
    "synthesis": "analysis_synthesis.md",
    "chat": "system.md",
    "chain": "analysis_subgroup.md",
}
SYNTH_IDS = ["equity_assessment", "risks_provocations", "design_improvements"]
BADGE_RE = re.compile(r"\[(Evidence|Analogical|Inferred|Reasoning|Gap|SG\d+|Cross-cutting|Sub-group)(?::[^\]]*)?\]")
BADGE_DETAIL_RE = re.compile(r"<badge_detail>.*?</badge_detail>", re.S)
CHIPS_RE = re.compile(r"<suggested_answers>(.*?)</suggested_answers>", re.S)
STRIP_BLOCKS_RE = re.compile(r"<(policy_spec|proposed_sub_groups|suggested_answers)>.*?</\1>", re.S)


# ---------------------------------------------------------------- helpers


def words(text: str) -> int:
    return len(BADGE_DETAIL_RE.sub("", text).split())


def split_h3(md: str) -> list[tuple[str | None, str]]:
    """Mirror frontend splitByH3: (heading, body) blocks, preamble first."""
    blocks: list[tuple[str | None, str]] = []
    heading, buf = None, []
    for line in md.splitlines():
        if line.startswith("### "):
            blocks.append((heading, "\n".join(buf)))
            heading, buf = line[4:].strip(), []
        else:
            buf.append(line)
    blocks.append((heading, "\n".join(buf)))
    return blocks


def chips(text: str) -> list[str] | None:
    m = CHIPS_RE.search(text)
    if not m:
        return None
    try:
        arr = json.loads(m.group(1))
        return arr[:4] if isinstance(arr, list) else None
    except json.JSONDecodeError:
        return None


def prompt_version(filename: str) -> str:
    path = PROMPTS / filename
    h = subprocess.run(["git", "hash-object", str(path)], capture_output=True, text=True, cwd=ROOT).stdout[:8]
    dirty = subprocess.run(["git", "diff", "--quiet", "HEAD", "--", str(path)], cwd=ROOT).returncode != 0
    return f"{filename}@{h}{' (uncommitted edits)' if dirty else ''}"


def spec_messages(fx: dict) -> list[ChatMessage]:
    spec_block = "<policy_spec>\n" + json.dumps(fx["spec"]) + "\n</policy_spec>"
    return [
        ChatMessage(role="assistant", content="Policy specification confirmed.\n\n" + spec_block),
        ChatMessage(role="user", content="Please proceed to the equity analysis."),
    ]


class Collector:
    """Accumulate orchestrator parts the way the frontend does."""

    def __init__(self) -> None:
        self.text = ""
        self.sections: dict[str, str] = {}
        self.events: list[dict] = []
        self.proposed: dict | None = None

    def add(self, part: tuple[str, object]) -> None:
        kind, payload = part
        if kind == "text":
            self.text += payload  # type: ignore[operator]
        elif kind == "analysis_content":
            sid = payload["section"]  # type: ignore[index]
            self.sections[sid] = self.sections.get(sid, "") + payload["delta"]  # type: ignore[index]
        elif kind == "data":
            self.events.append(payload)  # type: ignore[arg-type]
            if payload.get("type") == "proposed_sub_groups":  # type: ignore[union-attr]
                self.proposed = payload  # type: ignore[assignment]


async def drain(aiter, col: Collector) -> None:
    async for part in aiter:
        col.add(part)


# ---------------------------------------------------------------- analyst view


def analyst_view_section(sid: str, raw: str, default_open: re.Pattern[str]) -> list[str]:
    """What AnalysisSectionPanel shows: summary card, then collapsible ### blocks."""
    out = [f"## Panel: {sid}"]
    card = orch._extract_summary_card(raw) or {}
    headline = card.get("impact_direction") or card.get("inequality_direction") or card.get("summary")
    if card:
        out.append(f"**Card headline:** {headline}")
        for kf in card.get("key_findings", []):
            out.append(f"- {kf}")
        extras = {
            k: v
            for k, v in card.items()
            if k not in ("impact_direction", "inequality_direction", "summary", "key_findings")
        }
        if extras:
            out.append(f"_card extras: {json.dumps(extras, ensure_ascii=False)}_")
        out.append("")
        out.append("[Read the full report]")
    body = orch._strip_artifact_tail_blocks(raw)
    for heading, text in split_h3(body):
        if heading is None:
            if text.strip():
                out.append(text.strip())
            continue
        state = "open" if default_open.search(heading) else "collapsed"
        out.append(f"\n▸ **{heading}** ({state}, {words(text)} words, {len(BADGE_RE.findall(text))} badges)")
        if state == "open":
            out.append(text.strip())
    return out


def chat_view(text: str) -> list[str]:
    """What MessageBubble shows plus the chips MessageList renders."""
    out = ["## Chat"]
    out.append(STRIP_BLOCKS_RE.sub("", text).strip())
    c = chips(text)
    out.append("\n**Chips:** " + (" | ".join(f"[{x}]" for x in c) if c else "(none)"))
    return out


# ---------------------------------------------------------------- checks


def check(cond: bool, msg: str, out: list[str]) -> None:
    out.append(("PASS " if cond else "FAIL ") + msg)


def budget(out: list[str], label: str, text: str, limit: int) -> None:
    n = words(text)
    check(n <= limit, f"{label}: {n} words (budget {limit})", out)


BARE_SG_RE = re.compile(r"(?<!\[)\bSG\d+\b")


def badge_integrity(out: list[str], text: str) -> None:
    body = orch._strip_artifact_tail_blocks(text)
    prose = BADGE_DETAIL_RE.sub("", BADGE_RE.sub("", body))
    bare = BARE_SG_RE.findall(prose)
    check(not bare, f"no bare SG labels used as nouns in prose (found {len(bare)})", out)
    kinds = {}
    for m in BADGE_RE.finditer(body):
        k = re.sub(r"\d+", "n", m.group(1))
        kinds[k] = kinds.get(k, 0) + 1
    details = len(BADGE_DETAIL_RE.findall(body))
    evidence_like = sum(v for k, v in kinds.items() if k in ("Evidence", "Analogical", "Inferred"))
    out.append(f"INFO badges {kinds}; badge_detail blocks {details}")
    check(details >= evidence_like, "every Evidence/Analogical/Inferred badge has a badge_detail", out)


def check_subgroup(raw: str, out: list[str]) -> None:
    body = orch._strip_artifact_tail_blocks(raw)
    heads = [h for h, _ in split_h3(body) if h]
    want = ["Who is impacted", "Benefits and harms", "Uncertainties"]
    check([h for h in heads if h != "Also worth noting"] == want, f"headings {heads}", out)
    budget(out, "total", body, 650)
    for h, t in split_h3(body):
        lim = {"Who is impacted": 60, "Benefits and harms": 400, "Also worth noting": 120, "Uncertainties": 100}.get(
            h or ""
        )
        if lim:
            budget(out, h, t, lim)
    badge_integrity(out, raw)
    check(orch._extract_step_summary(raw) is not None, "step_summary present", out)
    card = orch._extract_summary_card(raw)
    check(card is not None, "summary_card present", out)
    if card:
        check(
            len(card.get("key_findings", [])) == 3, f"key_findings == 3 (got {len(card.get('key_findings', []))})", out
        )
        check(bool(card.get("impact_direction")), "impact_direction present", out)


def check_synthesis(sections: dict[str, str], fx: dict, out: list[str]) -> None:
    check(all(s in sections for s in SYNTH_IDS), f"three sections routed: {sorted(sections)}", out)
    budgets = {"equity_assessment": 450, "risks_provocations": 350, "design_improvements": 400}
    heads_want = {
        "equity_assessment": ["Who benefits most", "Who benefits least or is harmed", "Where groups diverge"],
        "risks_provocations": ["Evidence gaps", "Key assumptions and tensions"],
    }
    for sid in SYNTH_IDS:
        raw = sections.get(sid, "")
        body = orch._strip_artifact_tail_blocks(raw)
        budget(out, sid, body, budgets[sid])
        heads = [h for h, _ in split_h3(body) if h]
        if sid in heads_want:
            check(heads == heads_want[sid], f"{sid} headings {heads}", out)
        else:
            n_out = len(fx["spec"]["spec"].get("outcomes_of_interest") or [])
            check(
                n_out == 0 or len(heads) == n_out,
                f"design headings ({len(heads)}) match outcomes of interest ({n_out}): {heads}",
                out,
            )
        card = orch._extract_summary_card(raw)
        check(card is not None, f"{sid} summary_card present", out)
        if card:
            check(len(card.get("key_findings", [])) == 3, f"{sid} key_findings == 3", out)
        if sid == "design_improvements" and card:
            fu = card.get("suggested_followups") or []
            check(len(fu) == 3 and all(len(x.split()) <= 18 for x in fu), f"suggested_followups: {fu}", out)
        badge_integrity(out, raw)


def check_scan(raw: str, col: Collector, out: list[str]) -> None:
    body = orch._strip_artifact_tail_blocks(raw)
    heads = [h for h, _ in split_h3(body) if h]
    check(len(heads) == 6, f"six category headings (got {len(heads)}): {heads}", out)
    subs = (col.proposed or {}).get("subgroups") or []
    check(4 <= len(subs) <= 6, f"proposed sub-groups: {len(subs)}", out)
    check(all(2 <= len(s.get("modifiers", [])) <= 4 for s in subs), "each sub-group has 2-4 modifiers", out)
    check(bool((col.proposed or {}).get("relevance_scan")), "relevance_scan JSON present", out)
    out.append(f"INFO scan body {words(body)} words, {len(body)} chars")
    for s in subs:
        out.append(f"INFO   - {s.get('name')}  ({', '.join(m.get('value', '') for m in s.get('modifiers', []))})")


def check_chat(text: str, deep: bool, has_reports: bool, out: list[str]) -> None:
    body = STRIP_BLOCKS_RE.sub("", text)
    budget(out, "reply", body, 350 if deep else 150)
    c = chips(text)
    check(c is not None and len(c) == 3, f"3 chips: {c}", out)
    if c:
        check(all(len(x.split()) <= 18 for x in c), "chips <= ~16 words", out)
        check(not any(re.search(r"\bSG\d", x) for x in c), "chips use full names, not SG labels", out)
    if has_reports:
        check(bool(re.search(r"\[SG\d+", body)), "cites at least one [SGn]", out)
    badge_integrity(out, text)


def check_socratic(text: str, out: list[str]) -> None:
    prose = STRIP_BLOCKS_RE.sub("", text)
    check(prose.count("?") <= 1, f"one question at a time ({prose.count('?')} question marks)", out)
    budget(out, "reply", prose, 150)
    c = chips(text)
    check(c is not None and 1 <= len(c) <= 4, f"chips: {c}", out)
    spec = orch._extract_spec_from_response(text)
    check(spec is not None, "policy_spec block parses", out)
    if spec:
        out.append(f"INFO spec keys: {sorted((spec.get('spec') or spec).keys())}")


# ---------------------------------------------------------------- stages


async def run(stage: str, fx: dict, args: argparse.Namespace) -> tuple[Collector, list[str], list[str]]:
    col = Collector()
    view: list[str] = []
    checks: list[str] = []
    settings = get_settings()
    # ponytail: the local Qdrant store is single-process; only open it for stages that search.
    # ponytail: the local Qdrant store is single-process; Qdrant raises a clear error if
    # the dev backend holds it, so only open it for stages that search.
    store = EvidenceStore() if stage in ("scan", "subgroup", "chat", "chain") else None
    retriever = HybridRetriever(store) if store else None
    try:
        if stage == "socratic":
            msgs = [
                ChatMessage(**m)
                for m in fx.get("socratic_messages") or [{"role": "user", "content": fx["policy_description"]}]
            ]
            await drain(
                orch.stream_response(stage="specifying", messages=msgs, spec_state=fx.get("socratic_spec_state")), col
            )
            view += chat_view(col.text)
            check_socratic(col.text, checks)

        elif stage == "scan":
            await drain(
                orch.stream_response(
                    stage="analysing", messages=spec_messages(fx), spec_state=fx["spec"], retriever=retriever
                ),
                col,
            )
            raw = col.sections.get("scan", "")
            view += chat_view(col.text)
            view += analyst_view_section("scan", raw, re.compile(r"^$"))
            check_scan(raw, col, checks)
            if args.save_fixture and col.proposed:
                fx["subgroups"] = col.proposed["subgroups"]
                fx.setdefault("sections", {})["scan"] = raw

        elif stage == "subgroup":
            sg = fx["subgroups"][args.subgroup]
            policy_spec = orch._extract_policy_spec_from_history(spec_messages(fx))
            searches: list[dict] = []
            async for part in orch._stream_subgroup_with_tools(
                orch._get_client(), policy_spec, sg, retriever, raw_searches=searches, sg_index=args.subgroup
            ):
                if part[0] == "text":
                    col.add(("analysis_content", {"section": f"sg_{args.subgroup}", "delta": part[1]}))
                else:
                    col.add(part)
            raw = col.sections[f"sg_{args.subgroup}"]
            view.append(f"## Searches ({len(searches)})")
            view += [
                f"- {s.get('query')} → {s.get('num_results', len(s.get('results', [])))} results" for s in searches
            ]
            view += analyst_view_section(f"sg_{args.subgroup}", raw, re.compile(r"benefits and harms", re.I))
            check_subgroup(raw, checks)
            if args.save_fixture:
                fx.setdefault("sections", {})[f"sg_{args.subgroup}"] = raw

        elif stage == "synthesis":
            texts = subgroup_texts(fx)
            await drain(orch.stream_synthesis_only(messages=spec_messages(fx), analysis_texts=texts), col)
            view += chat_view(col.text)
            for sid in SYNTH_IDS:
                view += analyst_view_section(sid, col.sections.get(sid, ""), re.compile(r"who benefits most", re.I))
            check_synthesis(col.sections, fx, checks)
            if args.save_fixture:
                fx.setdefault("sections", {}).update({k: v for k, v in col.sections.items() if k in SYNTH_IDS})

        elif stage == "chat":
            q = args.question or (chips(fx.get("chain_text", "")) or ["Which group is most at risk, and why?"])[0]
            texts = subgroup_texts(fx) + [
                {"id": s, "name": s, "text": orch._strip_artifact_tail_blocks(fx["sections"][s])}
                for s in SYNTH_IDS
                if s in fx.get("sections", {})
            ]
            evidence = retriever.retrieve(q, top_k=settings.retrieval_top_k)
            msgs = spec_messages(fx) + [
                ChatMessage(role="assistant", content=fx.get("chain_text", "")),
                ChatMessage(role="user", content=q),
            ]
            await drain(
                orch.stream_response(stage="chatting", messages=msgs, evidence=evidence, analysis_texts=texts), col
            )
            view.append(f"**Question:** {q}\n")
            view += chat_view(col.text)
            check_chat(col.text, args.deep, bool(texts), checks)

        elif stage == "chain":
            subs = fx.get("subgroups")
            if not subs:
                scan = Collector()
                await drain(
                    orch.stream_response(
                        stage="analysing", messages=spec_messages(fx), spec_state=fx["spec"], retriever=retriever
                    ),
                    scan,
                )
                subs = (scan.proposed or {}).get("subgroups") or []
                fx["subgroups"] = subs
                fx.setdefault("sections", {})["scan"] = scan.sections.get("scan", "")
                view.append(f"## Scan proposed {len(subs)} sub-groups")
                check_scan(scan.sections.get("scan", ""), scan, checks)
            await drain(
                orch.stream_analysis_chain(messages=spec_messages(fx), confirmed_subgroups=subs, retriever=retriever),
                col,
            )
            view += chat_view(col.text)
            for i in range(len(subs)):
                sid = f"sg_{i}"
                view += analyst_view_section(sid, col.sections.get(sid, ""), re.compile(r"benefits and harms", re.I))
                checks.append(f"--- {sid}: {subs[i].get('name')}")
                check_subgroup(col.sections.get(sid, ""), checks)
            for sid in SYNTH_IDS:
                view += analyst_view_section(sid, col.sections.get(sid, ""), re.compile(r"who benefits most", re.I))
            checks.append("--- synthesis")
            check_synthesis(col.sections, fx, checks)
            check(
                col.events and col.events[-1].get("type") == "stage_transition",
                "stage_transition is the last event",
                checks,
            )
            if args.save_fixture:
                fx.setdefault("sections", {}).update(col.sections)
                fx["chain_text"] = col.text
        else:
            raise SystemExit(f"unknown stage {stage}")
    finally:
        if store:
            store.close()
    return col, view, checks


def subgroup_texts(fx: dict) -> list[dict[str, str]]:
    subs = fx["subgroups"]
    return [
        {
            "id": f"sg_{i}",
            "name": sg["name"],
            "text": orch._strip_artifact_tail_blocks(fx["sections"].get(f"sg_{i}", orch._FAILED_SUBGROUP_TEXT)),
        }
        for i, sg in enumerate(subs)
    ]


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stage", choices=list(STAGE_PROMPT))
    ap.add_argument("fixture", type=Path)
    ap.add_argument("--subgroup", type=int, default=0, help="index into fixture['subgroups'] for the subgroup stage")
    ap.add_argument(
        "--question", help="follow-up question for the chat stage (default: first chip from the saved chain)"
    )
    ap.add_argument("--deep", action="store_true", help="chat stage: apply the 350-word deep-dive budget")
    ap.add_argument("--save-fixture", action="store_true", help="write new sub-groups / texts back into the fixture")
    args = ap.parse_args()

    fx = json.loads(args.fixture.read_text())
    settings = get_settings()
    model = {
        "scan": settings.openai_scan_model,
        "socratic": settings.openai_socratic_model,
        "chat": settings.openai_chat_model,
    }.get(args.stage, settings.openai_analysis_model)
    t0 = time.monotonic()
    col, view, checks = asyncio.run(run(args.stage, fx, args))
    secs = time.monotonic() - t0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = ROOT / "replays"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{args.fixture.stem}-{args.stage}-{stamp}.md"
    fails = sum(c.startswith("FAIL") for c in checks)
    header = [
        f"# Replay: {args.stage} / {args.fixture.stem}",
        f"- prompt: {prompt_version(STAGE_PROMPT[args.stage])}",
        f"- model: {model}",
        f"- wall-clock: {secs:.1f}s",
        f"- checks: {len(checks) - fails - sum(c.startswith(('INFO', '---')) for c in checks)} pass, {fails} fail",
        "",
    ]
    raw_dump = ["## Raw output", "", "### chat text", "", col.text, ""]
    for sid, text in col.sections.items():
        raw_dump += [f"### section {sid}", "", text, ""]
    out_path.write_text(
        "\n".join(header + ["## Checks", ""] + checks + ["", "# Analyst view", ""] + view + ["", "---", ""] + raw_dump)
    )

    print("\n".join(header))
    print("\n".join(checks))
    print(f"\nanalyst view + raw output → {out_path.relative_to(ROOT)}")
    if args.save_fixture:
        args.fixture.write_text(json.dumps(fx, indent=1, ensure_ascii=False))
        print(f"fixture updated → {args.fixture}")


if __name__ == "__main__":
    main()
