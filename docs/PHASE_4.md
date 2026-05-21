# Phase 4: Deliberation and Provocations

## Goal

Build the deliberation layer that synthesises across the per-population analyses from Phase 3 to surface tensions, trade-offs, evidence gaps, and provocative challenges. This transforms the tool from "analysis per group" into the cross-cutting insights that are most valuable for policy development. This is stage 2 of the whiteboard design ("Deliberation") and the right-side outputs ("Provocations").

## Prerequisites

- Phase 3 technical deliverables (working per-population analysis engine)
- Analyst deliverable on deliberation structure and provocation taxonomy (developed during/after Phase 3, once analysts have seen real outputs)

## Context

The per-population analysis (Phase 3) tells the analyst how each sub-group experiences the policy. The deliberation layer answers the harder questions: where does the policy create winners and losers? Where do benefits for one group come at the cost of another? What assumptions is the policy making that the evidence challenges? What can't we know without real consultation?

The analysts' brainstorming session was clear that the outputs should be structured as provocations — pointed challenges, not neutral summaries. The tool should push back on policies, surface what the analysts haven't considered, and make the case for real engagement where the evidence is thin.

The output structure from the brainstorming session follows a funnel: top insights → stratified detail → themes, frequency, contention, edge cases.

## Technical Deliverables

### 4.1 Cross-Population Synthesis

Analyse across all per-population results to identify patterns, tensions, and differential impacts.

#### Requirements
- **Tension mapping**: Identify where a policy creates opposing effects across groups (benefits group A, harms group B; or benefits on dimension X but worsens dimension Y for the same group)
- **Comparative impact ranking**: Indicate which sub-groups face the most significant concerns and on which dimensions — this is the "top insights" layer
- **Theme extraction**: Identify recurring themes across populations (e.g. "time burden is a concern for 4 of 6 groups", "behavioural assumptions are challenged for all low-income groups")
- **Edge cases**: Surface specific population-policy combinations where the impact is likely to be extreme, unexpected, or qualitatively different from the general case
- **Contention identification**: Flag where the analysis itself is uncertain — where different evidence sources point in different directions, or where reasonable people might disagree about the likely impact

#### Open Questions
- How to prompt the LLM to synthesise across multiple population analyses without losing nuance?
- Should the synthesis work from the per-population outputs directly, or should it have access to the underlying evidence and policy specification as well?
- How to prevent the synthesis from being a bland summary — it needs to surface sharp insights, not average everything out?
- How to handle the case where per-population analyses partially contradict each other?

### 4.2 Provocation Generation

Generate targeted provocations that challenge the analyst's thinking about the policy.

#### Provocation Types (working taxonomy, to be refined by analysts)

1. **Assumption challenges**: "This policy assumes [X], but for [group Y] the evidence suggests [Z]." Identifies where the policy's embedded assumptions break down for specific populations.

2. **Evidence gaps**: "There is no evidence in the current base on how [group Y] would experience [mechanism Z]. This is a priority area for real engagement." Explicitly flags where the tool is reasoning without evidence and recommends consultation.

3. **Equity tensions**: "This policy improves [dimension A] for [group X] but worsens [dimension B] for [group Y]. This trade-off is not addressed in the current policy design." Surfaces zero-sum or trade-off dynamics between groups.

4. **Unintended consequences**: "Policies using similar mechanisms have produced [unexpected outcome] in [context]. Consider whether [specific risk] applies here." Draws on evidence of similar interventions to flag risks.

5. **Socratic challenges**: "Have you considered how [specific aspect] interacts with [existing system/policy/reality]?" Opens up areas the analyst may not have thought about. These are expansive — they push the boundary of the analysis outward.

6. **Mitigation prompts**: "For [group Y], the impact on [dimension] could be mitigated by [approach]. Has this been considered?" Moves beyond critique toward constructive suggestions.

#### Requirements
- Provocations should be specific and grounded, not generic (not "have you considered equity?" but "have you considered that GLP-1 patients in rural areas may not have a GP surgery within 30 minutes that offers the required monitoring?")
- Each provocation should clearly state what type it is and what evidence (or lack thereof) underlies it
- Provocations should be prioritised — the most important challenges first
- The tone should be constructive-critical: the tool is a rigorous colleague, not an adversary

#### Open Questions
- How many provocations per analysis? (Too few is unhelpful; too many is overwhelming)
- Should provocations be generated per sub-group, or only at the cross-population level?
- How to ensure provocations are genuinely novel rather than restating what the per-population analysis already surfaced?
- Should the analyst be able to respond to provocations (e.g. "yes, we've considered that" or "tell me more about this risk") and have the tool drill deeper?
- How to prevent the LLM from generating provocations that are speculative or unfounded — what guardrails?

### 4.3 Evidence Gap Summary

Produce a structured summary of what the tool could and couldn't assess, and where real engagement is most needed.

#### Requirements
- Map the evidence gaps identified across all populations and dimensions
- Prioritise: which gaps are most critical for this specific policy?
- For each gap, indicate why it's a gap (no relevant research exists, the evidence base doesn't cover this population, the policy mechanism is too novel)
- Recommend specific types of engagement that would fill the gap (e.g. "focus groups with [group] on [topic]", "quantitative analysis of [data]", "expert consultation on [mechanism]")
- This section should make the case for real consultation — it's the tool's honest acknowledgement of its own limits

#### Open Questions
- How to distinguish between "the evidence base doesn't have this" and "no evidence exists anywhere on this"?
- Should the tool attempt to suggest where additional evidence might be found (academic databases, government data, specific organisations)?
- How to structure gap recommendations so they're actionable for the analysts?

### 4.4 Layered Output Structure

The complete output should follow the funnel structure from the brainstorming session.

#### Output Layers

1. **Executive summary**: 3-5 sentences. Which groups are most affected, what the biggest concerns are, and what the tool can't tell you. An analyst should be able to read this and decide whether to dig deeper.

2. **Top insights**: The most important cross-population findings. Themes that recur across groups, the sharpest tensions, the most critical evidence gaps. Each insight is a short paragraph with evidence grounding visible.

3. **Population-level detail**: The per-population analyses from Phase 3, accessible per sub-group. Each with a summary and expandable dimension-by-dimension breakdown.

4. **Provocations**: The structured challenges, ordered by priority. Each labelled by type, with evidence or reasoning made explicit.

5. **Evidence gap map**: What the tool couldn't assess and what engagement would help. Prioritised by criticality to this specific policy.

6. **Methodology note**: A brief, always-present note explaining what the tool did, what evidence it drew on, and how its outputs should (and should not) be used. This is the ethical positioning made operational.

#### Open Questions
- Should all layers be generated at once, or should the tool produce the executive summary first and let the analyst choose to expand?
- How to handle the output for a session with many sub-groups — does it become unwieldy?
- Should the output be exportable (PDF, Word) for sharing with colleagues who weren't in the session?
- How should the output handle the boundary between "analysis results" and "the ongoing conversation" — does the analyst see a structured report within the chat, or does the conversation itself constitute the output?

---

## Analyst Deliverables

### A8. Deliberation Structure

**What we need:** A specification of how the cross-population synthesis should work. What types of cross-cutting insights are most valuable? How should tensions and trade-offs be identified and presented?

**Best developed after seeing Phase 3 outputs**, so the analysts have concrete examples of per-population analyses to work with.

**Guiding questions:**
- When you compare how a policy affects different groups, what patterns do you look for?
- What makes a cross-cutting insight valuable vs obvious?
- How do you currently identify trade-offs between groups in your policy work?
- What would you want to see first in a synthesis — the biggest risk, the most affected group, the widest evidence gap?

### A9. Provocation Taxonomy

**What we need:** A validated and refined taxonomy of provocation types, with examples of what good provocations look like for the GLP-1 use case.

**Guiding questions:**
- Looking at the six provocation types listed above, are they the right ones? Are any missing?
- Can you write 2-3 example provocations for the GLP-1 wraparound care policy that would be genuinely useful to you?
- What's the difference between a provocation that sharpens your thinking and one that's annoying or obvious?
- Are there provocations that would be inappropriate or harmful? Where should the tool not go?

### A10. Evaluation Criteria

**What we need:** A definition of how to assess whether the tool is working. This should cover both the quality of individual outputs and the overall usefulness of the tool.

**Guiding questions:**
- What would make you trust the tool's output? What would make you not trust it?
- Can you define 3-5 criteria you'd use to evaluate an analysis? (e.g. "surfaced a concern I hadn't thought of", "evidence citations were relevant", "didn't make claims it couldn't support")
- How would you compare the tool's output to what you'd produce manually — what's the bar?
- What would "failure" look like — an output that's wrong, misleading, or harmful?

---

## Testing at Phase 4 Completion

1. **Full system test**: Run the complete flow for GLP-1 wraparound care — Socratic input → analysis → deliberation → layered output. Review with analysts.

2. **Provocation quality test**: Are the provocations specific, grounded, and novel? Do they challenge the analysts' thinking or just restate the obvious?

3. **Evidence gap quality test**: Are the evidence gaps accurately identified? Are the engagement recommendations actionable?

4. **Cross-use-case test**: Run the full flow for all four use cases. Check that the system generalises.

5. **Output usability test**: Can an analyst who wasn't involved in building the tool understand and use the output? Is the layered structure navigable?

6. **Ethical positioning test**: Does the output consistently position itself as analytical rather than representative? Are limitations visible? Would an external stakeholder reading the output understand what it is and isn't?
