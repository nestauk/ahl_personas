# Phase 3: Analysis Engine — Population × Policy

## Goal

Build the core analysis engine that takes a fully specified policy (from Phase 2) and analyses how it would be experienced by different population sub-groups, grounded in the evidence base. This produces per-population analysis and a cross-cutting equity assessment. Phase 4 adds the deliberation and provocation layers on top.

## Prerequisites

- Phase 2 technical deliverables (working Socratic input stage with policy specification)
- Personas framework (delivered — see below)
- Theoretical framework (delivered — embedded in analysis prompt)
- Analysis output framework (delivered — defines output structure)
- Evaluation framework (delivered — defines quality criteria)

## Analyst Deliverables (Received)

### Personas Framework

The analysts designed a modifier-based system for defining population sub-groups. Instead of fixed personas, five categories of modifiers stack combinatorially. A person can be "urban deprived" + "financially strained" + "family with children" + "time scarcity" + "non-negotiable dietary needs."

Each category has a **baseline** (default if unspecified) and **modifiers** that represent departures from that baseline. The tool selects which modifiers are most relevant to a given policy and analyses their combinations.

#### Category 1: Geography

| Variable | Example features |
|---|---|
| Urban deprived ★ | High density, high deprivation, limited green space, fast food prevalence, low supermarket competition, high public transport reliance |
| Urban mixed | High density, mixed affluence, high diversity, strong food culture, gentrification, co-existing food deserts and premium retail |
| Urban affluent | High density, high incomes, high supermarket competition, active travel infrastructure, premium retail prevalence |
| Suburban deprived | Mid-density, lower incomes, poor transport links, concentrated food retail, reliance on discount supermarkets, low car ownership |
| Suburban mixed ★ | Mid-density, mixed affluence, high car reliance, low supermarket competition, variable access to fresh food, mixed car ownership |
| Suburban affluent | Mid-density, high home ownership, wide supermarket presence, farmer's market culture, high car ownership |
| Rural deprived | Low density, high deprivation, low walkability, poor supermarket delivery coverage, poor public transport, isolated retail |
| Rural mixed | Low density, mixed affluence, high car reliance, varied access to fresh food, poor supermarket reach |
| Rural affluent | Low density, high home ownership, strong food culture, farm shops, premium supermarkets |

#### Category 2: Household and Financial Context

| Variable | Example features |
|---|---|
| Financially strained ★ | Lower income and no savings |
| Unstable cash flow | Fluctuating paychecks or irregular paydays (gig work, zero hours) |
| Stable with high overheads ★ | Stable income but overcommitted (high fixed outgoings, debt), vulnerable to shocks |
| Financially insulated | Disposable income or accumulated wealth |
| Adult living alone ★ | Decisions made independently, reduced economies of scale |
| Family with children ★ | Balancing nutrition, cost, convenience and preferences |
| Multi-adult houseshare | Storage, cooking and cleaning coordination challenges |
| Retired couple | Established food routines, changing dietary or health-related needs |
| Dependent on support | Chronic illness or disability, reliant on community transport, delivery slots, or support network |

#### Category 3: Time, Routine and Domestic Capacity

| Variable | Example features |
|---|---|
| Time scarcity | Atypical sleep/wake cycles, fatigued decision-making, limited food purchasing windows |
| Erratic routines | No fixed mealtimes, eats on impulse, reactivity to hunger cues |
| Rigid routines | Programmatic daily schedule, reliance on predictability and lists |
| Minimal capacity | Shared space, negotiated kitchen dynamics, single fridge/freezer shelf, microwave/kettle only, high friction to cook |
| Limited capacity | Compact storage and prep spaces, small fridge, few extras (air fryer, blender) |
| Hands-off consumer | Limited agency over household food shopping and cooking; influences via own OOH, snack and top-up choices |

#### Category 4: Emotional and Cognitive Bandwidth

| Variable | Example features |
|---|---|
| Neurodivergence, psychological distress and burn-out | Challenges with multi-step meal planning and busy retail environments, sensory boundaries, stress-driven or avoidant food choices |
| Socially isolated | Limited support network, reduced social motivation around food |
| Digitally excluded | Low access to ecommerce, delivery, price comparison, online banking |

#### Category 5: Diet, Food and Health Needs

| Variable | Example features |
|---|---|
| Active GLP-1 user ★ | Medical appetite suppression, side-effect management |
| Living with obesity ★ | Changing relationship with food; motivated by weight maintenance |
| Past GLP-1 user | Weight regain risk, adapted dietary habits |
| Performance diet | Food as fuel, whole food/high protein, macro tracking |
| Non-negotiable dietary needs | Plant-based, non-Western, religious diets and intolerances; needs variably met within the mainstream food offer |

#### Category 6: Ethnicity and Cultural Food Practices

| Variable | Example features |
|---|---|
| South Asian dietary traditions | Specific staple ingredients (ghee, spices, lentils, specific flours), religious dietary requirements (halal, vegetarianism), multi-generational household food dynamics, food as cultural/social practice |
| Black Caribbean and African dietary traditions | Specific staple ingredients (plantain, yam, specific seasonings), cultural significance of specific food preparation methods, limited mainstream retail availability of key ingredients |
| Eastern European dietary traditions | Specific staple foods, reliance on specialist retailers, language barriers in navigating mainstream food systems |
| Other culturally specific dietary patterns | Any dietary pattern shaped by cultural or religious practice that interacts with mainstream UK food retail, policy assumptions, or nutritional guidance |

**Note:** Ethnicity modifiers should be applied when the policy mechanism interacts with dietary practices, food retail availability, nutritional guidance assumptions, or food cultures. They should NOT be applied as a default for all analyses. The tool should reason about how policies interact with specific food practices, not make generalised claims about ethnic groups.

#### Priority Modifiers for Prototyping

The analysts have highlighted these as highest priority — the tool should consider these first when selecting sub-groups for analysis:

- Urban deprived
- Suburban mixed
- Financially strained
- Stable with high overheads
- Adult living alone
- Family with children
- Active GLP-1 user
- Living with obesity

### Theoretical Framework (Embedded in Analysis Prompt)

Four analytical lenses that guide HOW the tool reasons about policy impacts. These are not user-facing categories — they are embedded in the system prompt as reasoning instructions.

1. **Social determinants of health** (Marmot, 2010): How health outcomes are patterned by socioeconomic position over the life course. Disadvantage accumulates through material and social conditions. *Use when reasoning about who experiences what conditions and inequalities across groups.*

2. **Structural determinants of health** (Heller et al., 2024): How structural factors (power, governance, political and economic mechanisms) produce material and social conditions. *Use when reasoning about root causes of conditions and inequalities — why they exist and persist.*

3. **Commercial determinants of health** (Kickbusch et al., 2016): The role market forces and commercial actors play in shaping health outcomes. *Use when reasoning about how industry and markets shape behaviour, norms, and consumption — and how they will respond to policy.*

4. **Intersectionality** (Crenshaw, 1989): How conditions and aspects of identity interact to produce distinct constraints, opportunities, advantages, and disadvantages. *Use when reasoning about why similar policies can have non-uniform outcomes across groups — the interaction effects between modifiers.*

### Analysis Output Framework (Defines Output Structure)

The analysts provided a worked example for the GLP-1 co-pay policy defining four output sections:

1. **Policy classification table** — the policy specification mapped to the taxonomy (from Phase 2)
2. **Population impacts table** — per sub-group analysis: who is impacted, how, benefits and harms, financial/health/access impacts, uncertainties
3. **Equity assessment** — who benefits most, who benefits least / is harmed, inequality impact direction (increase/decrease/mixed), unintended distributional effects, implementation burden differences
4. **Provocations** — evidence gaps, assumption risks, equity tensions, unintended consequences, implementation risks, design improvements

**Key change from the worked example:** The population impacts section must use sub-groups defined by the personas framework (modifier combinations), not ad-hoc demographic groups. And every claim must show its evidence grounding level.

### Evaluation Framework (Defines Quality Criteria)

Three evaluation dimensions from the analysts:

**Accuracy:**
- Summary of top themes relevant to the policy, plus diverging views
- Understanding of strengths and limitations of available evidence
- Evidence appropriately cited (no hallucinated citations)
- Clear distinction between evidence-backed claims and structured reasoning

**Relevance:**
- Most critical policy design decisions identified for impact on obesity
- Population sub-groups most impacted from an equity lens are identified
- Proportionate weighting — not over or under indexing data relative to prevalence

**Challenge:**
- Ends with questions to nudge additional thinking
- References more than one sub-population viewpoint
- Includes systems understanding of different actors, unintended consequences, market forces
- Missing or less developed policy features identified

---

## Technical Deliverables

### 3.1 Analysis System Prompt

Create `llm/prompts/analysis.md` — the system prompt for the equity impact analysis stage.

This is the most critical prompt in the system. It must encode:

**Role**: Equity impact analyst for UK food environment policy. Analyses how population-wide policies are experienced differently by different population sub-groups, using a curated evidence base of qualitative research on food environments and lived experience.

**Theoretical reasoning lenses** (embedded, not user-facing):
- Social determinants: who experiences what conditions, how disadvantage accumulates
- Structural determinants: root causes, why inequalities exist and persist
- Commercial determinants: how industry/markets shape behaviour and will respond to policy
- Intersectionality: why modifier combinations produce distinct experiences, non-uniform outcomes

**Personas framework**: The full modifier system with all five categories (six including ethnicity), with instructions on how to select and combine modifiers for a given policy.

**Sub-group selection logic**: Given the policy specification, the tool runs a two-part process:

**Part 1 — Modifier relevance scan.** For every modifier in the personas framework, the tool assesses whether the policy's mechanism, delivery channel, scope, or target population would meaningfully interact with that modifier's material features. Each modifier is rated HIGH / MODERATE / LOW. The scan results are presented as a table so the analyst can see the reasoning and override if needed.

The scan is guided by a policy-modifier heuristic mapping embedded in the prompt — connecting policy characteristics from the taxonomy to the modifier categories most likely affected. For example: policy lever = Price → prioritise financial context modifiers; delivery channel = Online → prioritise digitally excluded and rural geography modifiers; in-scope businesses = Convenience stores → prioritise urban deprived geography. The LLM uses this mapping as a floor and identifies additional interactions through its own reasoning.

**Part 2 — Sub-group composition.** The tool combines HIGH-rated modifiers into 4-6 sub-groups that capture the range of likely differential impacts. It prioritises the analysts' highlighted modifiers when they are rated HIGH.

5. Include at least one sub-group likely to benefit and at least one likely to be disadvantaged
6. Explain briefly why each sub-group was selected
7. The analyst can then accept, modify, or add sub-groups before the full analysis runs

**Evidence grounding**: Every analytical claim must be tagged with one of four grounding levels:
- **[Evidence]**: A study in the evidence base examined this population type and this type of intervention/context
- **[Analogical]**: A study examined a related population or intervention; the reasoning transfers with caveats
- **[Reasoning]**: No directly relevant evidence; reasoning from the group's material constraints and the policy's mechanism
- **[Gap]**: Cannot make a confident claim; this needs real consultation or further research

**Output structure** (from the analysis output framework):
1. Policy classification (the Phase 2 specification, confirmed)
2. Population impacts (per sub-group: who, how, benefits/harms, impacts across dimensions, uncertainties — each claim grounded)
3. Equity assessment (who benefits most/least, inequality direction, distributional effects, burden differences)
4. Provocations (evidence gaps, assumption risks, equity tensions, unintended consequences, implementation risks, design improvements)

**What the prompt must NOT do:**
- Frame outputs as representing the views of any community
- Make confident claims without evidence
- Treat the analysis as definitive rather than a first-pass analytical aid
- Ignore the limitations of the evidence base

### 3.2 Analysis Flow and Stage Management

When the analyst clicks "Proceed to analysis" in Phase 2, the stage transitions to `analysing`. The analysis runs in two steps:

**Step 1 — Sub-group selection**: The tool examines the policy specification and proposes 4-6 sub-groups (modifier combinations) to analyse. These are presented to the analyst for confirmation. The analyst can accept, add, remove, or modify sub-groups.

**Step 2 — Full analysis**: Once the analyst confirms the sub-groups, the tool runs the full equity impact analysis and streams the output.

#### Requirements
- Add `analysing` stage to the stage management system (alongside `specifying` and `chatting`)
- The `analysing` stage uses the analysis system prompt and retrieves evidence from the evidence base
- Evidence retrieval should be targeted: retrieve evidence relevant to each sub-group × policy combination, not just the policy in general
- The analysis should be streamed — it will be long, and the analyst shouldn't wait for the entire output before seeing anything
- After the analysis is complete, the stage transitions to `chatting` where the analyst can ask follow-up questions about specific sub-groups, dimensions, or provocations — with the full analysis in conversation history

#### Open Questions
- Should sub-group selection be a separate LLM call, or can it be the first part of a single analysis response?
- How to handle the evidence retrieval for multi-sub-group analysis — one retrieval per sub-group, or one broad retrieval for the whole policy?
- Should the analysis be one long streamed response, or broken into sections (sub-group 1, sub-group 2, ..., equity, provocations) with pauses between?
- How much of the analysis output should be structured data (for UI rendering) vs streamed text (for the chat)?

### 3.3 Sub-Group Selection UI

After the analyst clicks "Proceed to analysis", the tool proposes sub-groups to analyse. The analyst needs a way to see, modify, and confirm these.

#### Requirements
- Display proposed sub-groups as cards or list items, each showing the modifier combination and a brief rationale for why this sub-group was selected
- The analyst can remove sub-groups, add new ones (from the modifier options), or modify existing ones
- A "Run analysis" button confirms the selection and triggers the full analysis
- The personas framework categories and modifiers should be browsable/selectable for adding custom sub-groups

#### Open Questions
- Should this be in the chat flow (the LLM proposes sub-groups as a message, the analyst responds) or in the sidebar (sub-groups appear as interactive elements)?
- How to present modifier combination building without it being overwhelming — there are dozens of possible combinations
- Should the tool show the priority modifiers more prominently?

### 3.4 Analysis Output Rendering

The analysis output needs to be well-formatted and navigable. It will be long — potentially 2000+ words across multiple sub-groups.

#### Requirements
- The output follows the four-section structure: policy classification, population impacts, equity assessment, provocations
- Evidence grounding tags ([Evidence], [Analogical], [Reasoning], [Gap]) should be visually styled — e.g. small coloured badges inline with claims
- Citations should reference specific sources from the evidence base by name
- The population impacts section should be scannable — each sub-group has a clear header and summary before the detailed breakdown
- Consider collapsible sections so the analyst can expand sub-groups of interest without scrolling through everything

#### Open Questions
- Should the output render as markdown in the chat (consistent with Phase 1-2) or as structured UI components (cards, tables, collapsible sections)?
- If structured UI, how much of the output needs to be emitted as structured data via the data stream protocol vs parsed from markdown?
- Should the specification sidebar from Phase 2 remain visible (showing the policy being analysed) or be replaced by something else?

### 3.5 Evidence Retrieval for Analysis

The evidence retrieval (Phase 1) now needs to serve the analysis engine, not just general chat queries.

#### Requirements
- Retrieve evidence relevant to each sub-group × policy combination
- Retrieval queries should be constructed from the modifier features (e.g. "low income families urban food shopping") and the policy mechanism (e.g. "voucher scheme healthy food")
- Include the analysts' thematic annotations from the evidence base as high-weight retrieval signals
- The amount of retrieved context will be larger than for general chat — the analysis prompt needs evidence across multiple sub-groups and dimensions
- Consider whether all evidence should be retrieved upfront (simpler, larger context window) or per sub-group (more targeted, multiple retrieval calls)

#### Open Questions
- What's the context window budget? A full analysis across 4-6 sub-groups with evidence context and the personas framework will be large. May need to manage context carefully.
- Should retrieval happen once for the whole analysis, or be run separately per sub-group?
- How to handle the case where the evidence base has nothing relevant for a specific sub-group — the analysis should flag this prominently as a gap

### 3.6 Follow-Up Chat

After the analysis is complete, the analyst should be able to ask follow-up questions. The stage transitions to `chatting` with the full analysis in conversation history.

#### Requirements
- The analyst can ask about specific sub-groups ("tell me more about how this affects families with children in urban deprived areas")
- The analyst can challenge or probe specific claims ("what evidence supports the claim about digital exclusion?")
- The analyst can request analysis of additional sub-groups not included in the original selection
- Follow-up responses should use the evidence base (evidence retrieval active)
- The conversation maintains awareness of the policy specification and the analysis already produced

---

## Design Decisions (Resolved)

| Decision | Choice | Rationale |
|---|---|---|
| Sub-group definition | Modifier combinations from personas framework | Grounded in analyst-designed categories, not ad-hoc demographics. Stacking produces specific, material-constraint-based sub-groups. |
| Theoretical frameworks | Embedded in analysis prompt as reasoning lenses | Guide how the tool thinks, not what the analyst selects. Applied automatically. |
| Evidence grounding | Four levels: Evidence, Analogical, Reasoning, Gap | From original design. Must be visible on every claim. Prevents false confidence. |
| Sub-group selection | Tool proposes, analyst confirms | Balances automation (tool identifies relevant groups) with analyst control (they can modify). |
| Ethnicity | Separate modifier category, applied when policy interacts with dietary practices | Not applied by default. Framed around food practices, not ethnic generalisations. |
| Priority modifiers | Highlighted set from analysts, used as first-pass selection | Tool prioritises these when choosing sub-groups but isn't limited to them. |

---

## Testing at Phase 3 Completion

1. **GLP-1 co-pay test**: Run the full flow (Socratic → specification → sub-group selection → analysis) for the GLP-1 co-pay policy. Compare the output structure against the analysts' worked example. Check that sub-groups use the personas framework, not ad-hoc demographics.

2. **Healthy Start test**: Run the same flow for the Healthy Start voucher expansion. This should surface very different sub-groups and dimensions than the GLP-1 case.

3. **Evidence grounding test**: Review the analysis output and verify that grounding levels are assigned to every claim, that [Evidence] tags reference real sources from the evidence base, and that [Gap] tags appear where the evidence base is thin.

4. **Sub-group relevance test**: Check that the tool's proposed sub-groups are sensible for each policy — a GLP-1 policy should prioritise "Active GLP-1 user" and health-related modifiers, a price cap policy should prioritise financial and geographic modifiers.

5. **Evaluation framework test**: Score the output against the analysts' evaluation criteria (Accuracy, Relevance, Challenge). Does it synthesise top themes? Cite appropriately? Identify critical sub-groups? End with questions? Include systems understanding?

6. **Follow-up test**: After the analysis, ask follow-up questions about specific sub-groups and claims. Does the tool maintain context and respond meaningfully?

7. **Analyst usability test**: Have an analyst run through the full flow without guidance and capture feedback.