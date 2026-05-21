# Phase 2: Input Stage — Socratic Policy Development

## Goal

Build the Socratic input stage: a conversational flow that takes a loosely defined policy idea from an analyst and develops it into a fully specified set of policy elements suitable for structured analysis. This is the left side of the whiteboard design.

## Prerequisites

- Phase 1 technical deliverables (chat interface, evidence base, retrieval)
- Analyst deliverable A1 (policy characteristics taxonomy)

## Context

Analysts will often come to the tool with early-stage policy ideas — "we're thinking about wraparound support for GLP-1 patients" rather than a fully specified intervention. The tool's first job is to help them articulate what the policy actually does, who it targets, what it assumes, and what it changes. This Socratic development process is valuable in itself — it surfaces gaps in the analyst's thinking before any impact analysis begins.

The policy characteristics taxonomy from the analysts (deliverable A1) defines what a "fully specified" policy looks like. The Socratic questioning flow is the process of eliciting those characteristics through conversation.

## Technical Deliverables

### 2.1 Policy Decomposition Logic

Given the analyst's initial policy description, the system should identify which policy characteristics (from the taxonomy) are already specified, which are partially specified, and which are missing or ambiguous.

#### Requirements
- Map free-text policy descriptions onto the structured characteristics taxonomy
- Identify gaps: which characteristics has the analyst not addressed?
- Identify ambiguities: where has the analyst said something that could be interpreted multiple ways?
- This mapping does not need to be perfect — it guides the Socratic flow, which is conversational and iterative

#### Open Questions
- Should this decomposition happen via LLM reasoning against the taxonomy, or via a more structured extraction approach?
- How to handle policies that don't map cleanly onto the taxonomy (novel or cross-cutting interventions)?
- Should the decomposition be visible to the analyst (showing them what's been captured so far) or happen behind the scenes?

### 2.2 Socratic Questioning Flow

A conversational flow that asks the analyst targeted questions to fill gaps in the policy specification. This should feel like a knowledgeable colleague asking clarifying questions, not like a form with required fields.

#### Requirements
- Questions should be sequenced intelligently — start with the most important gaps, not a rigid checklist
- The flow should adapt based on what the analyst has already said (don't re-ask things they've covered)
- Questions should be framed in the analyst's domain language (from the taxonomy), not in technical/system language
- The analyst should be able to say "I don't know yet" or "that's not defined" — the tool should note these as uncertainties rather than blocking
- The flow should conclude with a summary of the policy as understood, giving the analyst a chance to confirm or correct before analysis begins

#### Interaction Design Considerations
- How many questions is too many? The flow should be efficient — 3-6 questions, not 20
- Should the tool offer options/suggestions or only ask open questions? (e.g. "Is this a fiscal mechanism, a regulatory mechanism, or an environmental change?" vs "What mechanism does this policy use?")
- Should the analyst be able to skip the Socratic stage and provide a detailed specification directly?
- What if the analyst changes their mind mid-conversation — how does the tool handle corrections?

#### Open Questions
- How to prompt the LLM to ask good Socratic questions without being annoying or repetitive?
- Should the system use the evidence base during this stage (e.g. "similar policies have typically targeted X — is that what you're thinking?") or keep this stage evidence-free?
- How to handle the boundary between "developing the policy" and "starting the analysis"? Is there a clear handoff, or does it blend?

### 2.3 Policy Summary / Confirmation

At the end of the Socratic flow, the system produces a structured summary of the policy as understood, mapped against the characteristics taxonomy.

#### Requirements
- Present the policy summary in a clear, readable format
- Highlight any characteristics the analyst chose not to specify (these become noted uncertainties for the analysis stage)
- Allow the analyst to confirm, edit, or go back and refine
- The confirmed summary becomes the input to Phase 3's analysis engine

#### Open Questions
- What format should the summary take? (Structured card, inline text, editable form?)
- Should the summary be stored/exportable so analysts can reuse policy specifications?
- How to handle policies that evolve — should the analyst be able to return to the input stage after seeing analysis results?

---

## Analyst Deliverables

### A4. Socratic Question Framework

**What we need:** The specific questions (or question types) the tool should ask to develop a policy idea. This is essentially the "interview guide" the chatbot follows.

**Guiding questions for the analysts:**
- When a colleague describes a new policy idea to you, what are the first questions you ask?
- What information do you need to know before you can assess whether a policy might have differential impacts?
- Are there questions that are always relevant regardless of policy type, and questions that are specific to certain types (fiscal, regulatory, service-based)?
- How do you currently probe for assumptions embedded in a policy? What questions surface hidden assumptions?
- What's the difference between a policy idea that's "ready for analysis" and one that still needs development?

**Desired output format:** A set of questions organised by the policy characteristics taxonomy, with notes on sequencing (which to ask first) and conditional logic (which questions depend on answers to earlier ones).

### A5. Worked Example: GLP-1 Wraparound Care

**What we need:** A complete worked example of the Socratic flow applied to the GLP-1 wraparound care use case. The analyst starts with how they would naturally describe this policy, then walks through the questions they'd need to answer to fully specify it.

**This should include:**
- The initial "raw" policy description as an analyst would type it
- What a knowledgeable colleague would ask to develop it
- The answers to those questions
- The final "fully specified" policy description
- Any characteristics that remain uncertain or undefined, and why

**Why this matters:** This worked example becomes the primary test case for Phase 2 and the benchmark for whether the Socratic flow is working correctly.

---

## Testing at Phase 2 Completion

1. **Socratic flow test**: An analyst provides a vague policy description (e.g. the raw GLP-1 description from the worked example). The tool asks relevant clarifying questions. After the conversation, the tool produces a policy summary that matches or approximates the "fully specified" version from the worked example.

2. **Efficiency test**: The Socratic flow reaches a usable policy specification in a reasonable number of exchanges (target: 3-6 questions, not 15).

3. **Robustness test**: Try the flow with the other three use cases (GLP-1 rollout, tax revenue, price caps) to check it generalises beyond the primary test case.

4. **Skip test**: An analyst who already has a well-defined policy can provide it directly and move to analysis without being forced through unnecessary questioning.
