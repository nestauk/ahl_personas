# Phase 3: Analysis Engine — Population × Policy

## Goal

Build the core analysis engine that takes a fully specified policy (from Phase 2) and analyses how it would be experienced by different population sub-groups, grounded in the evidence base. This produces the per-population analysis that the deliberation layer (Phase 4) will synthesise across.

## Prerequisites

- Phase 2 technical deliverables (working Socratic input stage with policy summary output)
- Analyst deliverable A2 (population/sub-group framework)
- Analyst deliverable A3 (enriched evidence base)

## Context

This phase implements the core of the system — stage 1 of the whiteboard design ("Populations + Lived Experience ↔ Policy Elements"). For each selected population sub-group, the tool analyses how the policy's elements interact with that group's material circumstances across defined dimensions of impact.

The analysis must be grounded in the evidence base. Every claim should be traceable to either: direct evidence (a study examined this population and this type of intervention), analogical evidence (a study examined a similar population or similar intervention), or structured reasoning from the group's material constraints. The evidence grounding level must be visible in the output.

## Technical Deliverables

### 3.1 Population Sub-Group Selection

The analyst needs to specify which population sub-groups to analyse. This uses the population framework (analyst deliverable A2) to let analysts either select pre-defined common sub-groups or configure custom ones.

#### Requirements
- Present the population dimensions from the framework (income, geography, household type, employment, etc.)
- Allow analysts to select pre-defined sub-groups (e.g. "single parent, low income, urban") or build custom combinations
- Support analysing multiple sub-groups in a single session
- The tool could also suggest sub-groups likely to be most affected, based on the policy characteristics — but the analyst should always have control

#### Open Questions
- How many sub-groups should the tool analyse in a single run? (More is more comprehensive but slower and potentially overwhelming)
- Should the tool proactively suggest "you might also want to consider group X" based on the policy?
- How to present custom sub-group building without it feeling like a complex configuration form?
- Should there be a "broad sweep" option that analyses across all pre-defined sub-groups before the analyst drills into specific ones?

### 3.2 Dimension-Based Analysis

For each population sub-group × policy combination, run a structured analysis across the defined dimensions of impact.

#### Dimensions of Impact (from analyst brainstorming and earlier design work)
These are the lenses the analysis should work through. The analysts should validate and refine this list, but the working set is:

1. **Cost of living / financial impact** — Direct cost changes, indirect costs, interaction with benefits, affordability relative to income
2. **Access to healthy foods** — Physical accessibility, transport requirements, digital access requirements, opening hours, geographic availability
3. **Health outcomes / eating habits** — Likely impact on dietary behaviour, nutritional outcomes, health conditions; whether the policy's health assumptions hold for this group
4. **Food security** — Impact on reliability of food access, risk of increasing food insecurity, interaction with food aid/food banks
5. **Time and cognitive burden** — Does the policy require time, planning, or executive function the group may not have?
6. **Dignity and agency** — Does the policy feel supportive or stigmatising? Does it position people as agents or recipients?
7. **Cultural appropriateness** — Does the policy respect diverse dietary practices and food cultures?
8. **Behavioural assumptions** — What does the policy assume about how this group makes food decisions? Does the evidence support those assumptions?
9. **System interactions** — How does the policy interact with other systems this group navigates (benefits, health services, school meals, food banks)?

Not every dimension will be equally relevant to every policy-population combination. The analysis should identify which dimensions are most salient and weight accordingly.

#### Requirements
- For each sub-group, analyse the policy across relevant dimensions
- Ground each analytical claim in evidence where possible, using the retrieval system
- Clearly label the evidence grounding level for each claim:
  - **Direct evidence**: A study in the evidence base examined this population type and this type of policy/intervention
  - **Analogical evidence**: A study examined a related population or related intervention, and the reasoning transfers
  - **Structured reasoning**: No directly relevant evidence; the tool is reasoning from the group's material constraints and the policy's mechanism
  - **Evidence gap**: The tool cannot make a confident claim; this area needs real consultation or further research
- Identify which dimensions are most critical for each sub-group (not all dimensions carry equal weight)

#### Open Questions
- How should the LLM be prompted to produce dimension-by-dimension analysis? (Single prompt per sub-group, or separate prompts per dimension?)
- How to handle conflicting evidence within the evidence base?
- Should the analysis retrieve evidence once per sub-group, or per sub-group × dimension combination?
- How to calibrate the length/depth of analysis per dimension — should it be uniform or proportional to relevance?
- How to prevent the LLM from being overly speculative when evidence is thin — what guardrails ensure it says "I don't know" rather than confabulating?

### 3.3 Evidence Citation and Grounding

The analysis must cite its sources and make evidence grounding visible.

#### Requirements
- Each analytical claim should reference the specific evidence source(s) it draws on
- Citations should include source name, date, geographic context, and population studied — enough for the analyst to assess relevance
- The evidence grounding level (direct/analogical/structured reasoning/gap) should be visually distinct in the output
- Where no evidence supports a claim, the tool should flag this explicitly rather than presenting reasoning as if it were evidence-backed

#### Open Questions
- How to present citations without cluttering the output? (Inline, footnotes, expandable sections, sidebar?)
- Should the tool link to the original sources where URLs are available?
- How to handle the sparse evidence entries (those without descriptions or links)?
- Should there be a separate "evidence map" view showing which sources were used and for what?

### 3.4 Per-Population Output

The analysis for each sub-group needs to be presented in a clear, layered format.

#### Requirements
- Each sub-group's analysis should have a summary (top-line finding) and detailed dimension-by-dimension breakdown
- The summary should highlight the most critical dimensions for that group
- The output should be scannable — analysts should be able to quickly identify which groups face the biggest concerns without reading every dimension
- The format should support comparison across sub-groups (Phase 4 will synthesise, but even at the per-population level, patterns should be visible)

#### Open Questions
- What output format did the analysts prefer in the brainstorming session? (Structured sections, narrative, cards, table?)
- Should the output be generated all at once or streamed as it's produced?
- How much text per sub-group per dimension? (A sentence? A paragraph? Depends on relevance?)
- Should analysts be able to ask follow-up questions about a specific sub-group's analysis?

---

## Analyst Deliverables

### A6. Lived Experience Analysis Structure

**What we need:** A specification of how the per-population analysis should work. Given a policy and a population sub-group, what should the analysis walk through, in what order, and at what depth?

**Guiding questions for the analysts:**
- When you assess a policy's impact on a specific group, what is your mental process? What do you consider first?
- Are the nine dimensions listed above the right ones? Are any missing? Are any redundant?
- How do you decide which dimensions matter most for a given policy-group combination?
- How do you currently handle situations where you have strong evidence for one dimension but none for another?
- What level of detail is useful — a sentence per dimension, a paragraph, or does it depend?

**Desired output format:** A validated and potentially revised set of dimensions, with notes on prioritisation logic (which dimensions are most important for which types of policies/groups) and an example of what the analysis should look like for the GLP-1 wraparound care use case applied to one or two sub-groups.

### A7. Output Specification

**What we need:** A concrete example of what ideal tool output looks like. Take the GLP-1 wraparound care policy and one or two sub-groups and hand-write what you'd want the tool to produce.

**This should include:**
- The summary/top-line for each sub-group
- The dimension-by-dimension detail for at least one sub-group
- How evidence citations should appear
- How uncertainty should be flagged
- What's too much detail and what's too little

**Why this matters:** This is the gold standard the implementation builds toward. Without it, we're guessing at what "good" looks like.

---

## Testing at Phase 3 Completion

1. **GLP-1 test case**: Run the full flow — Socratic input → policy summary → population selection → per-population analysis — for the GLP-1 wraparound care use case. Compare the output against the analyst's hand-written ideal (deliverable A7).

2. **Evidence grounding test**: Review the analysis and verify that evidence citations are relevant, that grounding levels are accurately assigned, and that the tool flags gaps rather than confabulating.

3. **Dimension relevance test**: Check that the tool identifies the most critical dimensions for each sub-group and doesn't give equal weight to irrelevant dimensions.

4. **Second use case test**: Run the same flow for a different use case (e.g. price caps) to check generalisation.

5. **Analyst usability test**: Have an analyst use the tool end-to-end without guidance and capture feedback on the experience.
