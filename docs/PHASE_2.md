# Phase 2: Input Stage — Socratic Policy Specification

## Goal

Build the Socratic input stage: a conversational flow that takes a loosely defined policy idea from an analyst and specifies it clearly enough for the equity impact analysis in Phase 3. This is the left side of the whiteboard design.

The Socratic stage is NOT about developing a better policy or evaluating the policy's merits. It is about comprehension — understanding what the policy actually does, to whom, through what mechanism, and making any assumptions explicit. The equity analysis is the output's job, not the input's job.

## Prerequisites

- Phase 1 technical deliverables (chat interface, evidence base, retrieval)
- Policy characteristics taxonomy (delivered — see below)
- Socratic question framework (delivered — see below)
- Example policies for testing (delivered — see below)

## Analyst Deliverables (Received)

### Policy Characteristics Taxonomy

The analysts have defined the following taxonomy for decomposing food environment policies:

| Characteristic | Options (multiple allowed) |
|---|---|
| **Policy lever** | Price, Placement & Positioning, Information, Availability, Reformulation, Portion Size, Advertisement, Treatment, Education, Physical activity, Penalties, Rewards & Incentives |
| **In-scope businesses** | Retailers, Out of Home (OOH), Manufacturers, Convenience stores, Public sector (hospitals, prisons, schools etc), Takeaways |
| **Business size** | Large businesses (250+ employees), Medium businesses (50+ employees), SMEs, MSEs |
| **Delivery channel** | In-person, Public services, Food business, Online, Private providers |
| **Population** | General, Adults, Children, Lower income people, Pregnant women/young families, Adults living with obesity |
| **Geography** | UK-wide, England, Wales, Scotland |

### Socratic Question Framework (from analysts)

The analysts designed a Socratic framework with the following approach:

1. **Analyse and prioritise**: Read the policy idea, scan the characteristics taxonomy, and identify the 2-3 most critical characteristics where the specification is ambiguous or underspecified — focusing on areas where different interpretations would lead to materially different analyses.
2. **Interrogate**: Ask 1-2 highly targeted questions focusing on how these critical characteristics interact, forcing tradeoffs and clarifying the mechanism of action.
3. **Challenge**: When the analyst replies, challenge on specification clarity — surface ambiguities, unstated assumptions, and areas where the description could be interpreted multiple ways.
4. **Iterate and finalise**: Once key ambiguities are resolved, lock in the major characteristics, make reasonable assumptions for lower-priority categories (explicitly stated), and present the final policy specification formatted by the taxonomy.

The key reorientation from the analysts' original framework: the role is a **policy specification analyst**, not a policy strategist. The tool's expertise is knowing which details matter for a complete specification, not evaluating whether the policy is well-designed. The challenge framing targets specification clarity ("You said this targets lower-income people — does that mean means-tested against a specific threshold, or self-identified, or defined by geographic deprivation index?"), not strategic effectiveness.

### Example Policies for Testing

Six example policies provided by the analysts, covering a range of mechanisms:

1. **Healthy Start expansion**: Provide direct-to-consumer benefits via vouchers to purchase healthier foods, such as by expanding the Healthy Start scheme, or a means-tested voucher for qualifying populations (such as those on universal credit or lower incomes)
2. **Manufacturer/retailer tax relief**: Give food manufacturers or retailers a percentage tax relief for improvement in health metrics (such as progress against a mandatory health target using the sales weighted average nutrient profiling model score, or a specific minimum share of sales from healthier foods)
3. **Price caps on essential goods**: Introduce price caps (price ceilings) on a defined basket of essential goods (e.g. eggs, flour, butter) at any point of sale for foods
4. **GLP-1 co-pay**: Impact of co-pay with the NHS for GLP-1s on patients (those with assets above 23k)
5. **GLP-1 via private providers**: Expanding access to GLP-1s via private providers that are commissioned by the NHS so that the NHS handles the medicine access and private providers handle the wraparound support
6. **NHS wraparound support optimisation**: Optimising NHS wraparound support so that the right amount of support is provided to patients based on certain criteria e.g. ethnicity, starting BMI, age, gender etc.

---

## Technical Deliverables

### 2.1 Socratic System Prompt

A new system prompt for the Socratic stage that replaces (or extends) the Phase 1 general-purpose prompt. Stored as an editable markdown file at `llm/prompts/socratic.md`.

#### Prompt Design

The prompt should encode:

**Role**: You are a policy specification analyst. Your job is to understand what a proposed food environment policy actually does — its mechanism, scope, target population, delivery channel, and geography — clearly enough that a separate equity impact analysis can be run against it. You are not evaluating whether the policy is good or advising on policy design.

**Task**: Take the analyst's policy description and, through targeted questioning, produce a complete specification mapped to the characteristics taxonomy. The specification is "complete" when every characteristic in the taxonomy has either an explicit value (from the analyst) or an explicit assumption (stated by you and confirmed by the analyst).

**Approach** (from the analyst framework):
- Read the policy idea and identify the 2-3 characteristics where the description is most ambiguous or underspecified — where different interpretations would lead to materially different equity analyses
- Ask 1-2 targeted questions per exchange, focusing on those critical ambiguities
- When the analyst responds, challenge on specification clarity: surface unstated assumptions, flag where the description could be interpreted multiple ways
- Do NOT probe for equity considerations — that is the analysis stage's job
- Do NOT evaluate whether the policy is well-designed or strategically sound
- Accept "I don't know" or "that's not defined yet" as valid answers — record these as open questions for the analysis to note

**Output**: Once key ambiguities are resolved, present a structured policy specification mapped to the taxonomy. Every characteristic should have a value or an explicitly stated assumption. Assumptions should be clearly flagged so the analyst can correct them before analysis begins.

**Tone**: A knowledgeable colleague clarifying what you mean, not an interviewer working through a checklist. Efficient — 2-4 exchanges total, not 10.

#### The evidence base is NOT used in this stage.
The Socratic stage works from the taxonomy and the analyst's input only. Evidence comes in during Phase 3 analysis. Mixing evidence into the specification conversation risks the tool arguing for or against the policy, which isn't its job at this stage.

#### Requirements
- The prompt must include the full characteristics taxonomy so the LLM knows what a complete specification looks like
- The prompt should include 1-2 examples of good Socratic exchanges (from the example policies) to demonstrate the right tone and depth
- The prompt must instruct the LLM to present the final specification in a consistent structured format that Phase 3 can consume

### 2.2 Conversation Stage Management

The chat interface now needs to manage conversation stages — the Socratic stage has a different system prompt and behaviour from the general chat in Phase 1, and will hand off to the analysis stage in Phase 3.

#### Requirements
- The orchestrator needs a concept of "stage" — at minimum: `specifying` (Socratic flow active) and `chatting` (general conversation / post-specification discussion)
- The stage determines which system prompt is used
- The conversation starts in the `specifying` stage
- When the Socratic flow produces a final policy specification, the stage transitions — in Phase 2, this means the tool confirms the specification and the analyst can continue chatting. In Phase 3, this will trigger the analysis engine
- The analyst should be able to restart the specification process (e.g. "let me try a different policy") which resets to the `specifying` stage
- Stage management should be extensible — Phase 3 will add an `analysing` stage, Phase 4 will add a `deliberating` stage

#### Open Questions
- Should stage be tracked server-side (in the API) or client-side (in the frontend state)?
- How to detect that the Socratic flow has concluded? Options: the LLM includes a structured marker in its output, the LLM calls a tool/function to submit the specification, or the user explicitly confirms ("yes, that looks right")
- Should the policy specification be extracted as structured data (JSON matching the taxonomy) or kept as formatted text? Structured data is cleaner for Phase 3 but adds extraction complexity.

### 2.3 Policy Specification Output

At the end of the Socratic flow, the system produces a structured policy specification mapped to the characteristics taxonomy.

#### Requirements
- Every characteristic from the taxonomy has either an analyst-provided value, a tool-stated assumption, or is marked as unspecified
- Assumptions are visually distinct from analyst-provided values
- Unspecified characteristics are flagged (these become noted uncertainties in the Phase 3 analysis)
- The analyst can confirm, correct, or ask to revise before proceeding
- The specification format is consistent across policies so Phase 3 can consume it programmatically

#### Output Format
The specification should be presented in a clear, readable format in the chat. Example:

```
## Policy Specification: Healthy Start Voucher Expansion

| Characteristic | Value | Source |
|---|---|---|
| Policy lever | Price; Rewards & Incentives | Analyst |
| In-scope businesses | Retailers; Convenience stores | Analyst |
| Business size | All sizes | Assumption |
| Delivery channel | Public services (benefits system) | Analyst |
| Population | Lower income people; Pregnant women/young families | Analyst |
| Geography | England | Analyst |

**Assumptions made:**
- Business size: Assumed all sizes since the Healthy Start scheme applies at any participating retailer regardless of size
- [...]

**Unspecified / open questions:**
- [any characteristics the analyst left undefined]
```

#### Open Questions
- Should the specification be stored/persisted so analysts can reuse policy specifications across sessions?
- Should the specification be exportable (e.g. as a standalone summary the analyst can share)?
- How to handle policies that don't map cleanly onto the taxonomy (novel or cross-cutting interventions)?

### 2.4 Frontend Updates

The chat interface needs minor updates to support the Socratic flow.

#### Requirements
- The welcome message should prompt the analyst to describe a policy (replacing the generic Phase 1 welcome)
- Consider a visual indicator of the current conversation stage (e.g. a subtle label showing "Policy specification" vs "Discussion")
- The policy specification output should be well-formatted in the chat (the table format above should render cleanly via markdown)

#### Open Questions
- Should there be a dedicated "Start new policy" button separate from "New session"?
- Should the specification be rendered as a special card/component rather than inline markdown?

---

## Design Decisions (Resolved)

| Decision | Choice | Rationale |
|---|---|---|
| Evidence base in Socratic stage | Not used | Keeps the stage focused on specification. Evidence comes in Phase 3. Mixing it in risks the tool evaluating the policy. |
| Questioning approach | Identify 2-3 critical ambiguities, not a full checklist | From analyst framework. More efficient, produces sharper questions. 2-4 exchanges, not 10. |
| Challenge framing | Specification clarity, not policy quality | The tool's job is comprehension, not evaluation. Equity analysis is the output's job. |
| Assumptions | Explicitly stated and flagged | Every assumption affects the equity analysis downstream. Must be visible and correctable. |

---

## Testing at Phase 2 Completion

1. **Socratic flow test — Healthy Start**: Analyst inputs "Provide direct-to-consumer benefits via vouchers to purchase healthier foods, such as by expanding the Healthy Start scheme, or a means-tested voucher for qualifying populations." The tool asks targeted clarifying questions (not a checklist) and produces a complete policy specification mapped to the taxonomy within 2-4 exchanges.

2. **Socratic flow test — GLP-1 co-pay**: Analyst inputs "Impact of co-pay with the NHS for GLP-1s on patients (those with assets above 23k)." This is more ambiguous — the tool should identify that delivery channel, in-scope businesses, and population definition are underspecified and probe accordingly.

3. **Socratic flow test — Price caps**: Analyst inputs "Introduce price caps on a defined basket of essential goods at any point of sale." Tests whether the tool handles a policy that spans multiple business types and sizes.

4. **Assumption visibility test**: Review the specifications produced above. Are assumptions clearly flagged and distinguished from analyst-provided values? Could an analyst correct a wrong assumption easily?

5. **Efficiency test**: None of the test cases should require more than 4 exchanges to reach a specification.

6. **All six example policies**: Run all six through the Socratic flow and review the specifications produced. Do they feel complete enough to analyse for equity impact?

7. **Skip test**: An analyst who provides a very detailed policy description (covering most taxonomy characteristics explicitly) should get minimal questioning — the tool should recognise what's already specified and only ask about genuine gaps.