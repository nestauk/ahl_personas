# Phase 5: Evaluation and Iteration

## Goal

Systematically test the complete tool across all four use cases, apply the evaluation criteria developed by the analysts, and iterate on the system based on findings. This phase transitions the tool from prototype to something the health team can begin using in their real policy work.

## Prerequisites

- Phase 4 technical deliverables (complete system with deliberation and provocations)
- Analyst deliverable A10 (evaluation criteria)

## Context

Phases 1–4 built and tested the system incrementally, but primarily against the GLP-1 wraparound care use case. Phase 5 stress-tests across all four use cases, involves analysts who weren't part of the build process, and establishes whether the tool is genuinely useful for policy work — not just technically functional.

This phase also surfaces what should be prioritised in future development (raw data integration, literature search, quantitative modelling) based on real experience with the tool's current limitations.

## Evaluation Structure

### 5.1 Use Case Testing

Run the complete flow for each of the four use cases. For each:

1. **GLP-1 NHS wraparound support** — The primary development use case. Test whether the accumulated iteration has produced strong outputs, and whether the tool handles the complexity of a policy touching pharmaceutical access, dietary behaviour, health services, and food affordability.

2. **GLP-1 rollout** — Related to the wraparound case but broader and more population-level. Tests whether the tool handles a policy with wider reach and less specificity about implementation.

3. **Tax revenue distribution** — A fiscal mechanism, structurally different from the health service policies. Tests whether the tool generalises to policies operating through financial redistribution rather than direct service provision.

4. **Price caps** — A market intervention. Tests whether the tool can reason about downstream supply chain effects, retailer behaviour, and how price signals interact with different shopping strategies across populations.

#### For each use case, capture:
- Does the Socratic input stage ask the right questions and produce a useful policy specification?
- Does the population selection cover the right sub-groups?
- Is the per-population analysis grounded, relevant, and at the right level of detail?
- Does the deliberation surface cross-cutting insights the analysts find valuable?
- Are the provocations specific, grounded, and genuinely challenging?
- Are the evidence gaps accurately identified and the engagement recommendations actionable?
- What did the tool get wrong, miss, or overstate?

### 5.2 Analyst Evaluation Sessions

Structured sessions where analysts use the tool and evaluate its outputs against their criteria (deliverable A10).

#### Session Design
- Include analysts who were involved in the build (they can assess whether the tool reflects their input) and analysts who were not (they can assess cold usability)
- Each analyst works through at least one use case independently, then the group discusses
- Capture both structured evaluation (against the defined criteria) and open feedback

#### Evaluation Dimensions
These should be refined based on the analysts' evaluation criteria (A10), but a working framework:

- **Accuracy**: Are the analytical claims factually correct and consistent with the evidence base?
- **Relevance**: Does the analysis focus on the dimensions and sub-groups that actually matter for this policy?
- **Novelty**: Did the tool surface concerns or perspectives the analyst hadn't already considered?
- **Evidence grounding**: Are citations relevant and correctly assigned? Does the tool distinguish clearly between evidence-backed claims and reasoning?
- **Honesty about limits**: Does the tool flag what it doesn't know? Are evidence gaps accurately identified?
- **Usefulness**: Would the analyst change their approach to the policy based on this output? Would they share it with colleagues?
- **Tone and framing**: Does the output feel like a rigorous analytical aid, not a simulation of community voices?

### 5.3 Failure Mode Analysis

Actively look for the ways the tool breaks or misleads.

#### Known Risk Areas
- **Confabulation**: Does the tool generate plausible-sounding claims that aren't grounded in evidence, without flagging them as speculative?
- **Stereotype reinforcement**: Does the tool fall into stereotypical representations of any population group rather than reasoning from material constraints?
- **False confidence**: Does the tool present uncertain claims with inappropriate confidence?
- **Evidence misattribution**: Does the tool cite evidence that doesn't actually support the claim it's making?
- **Blind spot reproduction**: Does the tool reproduce the blind spots in the evidence base (e.g. if rural communities are underrepresented in the evidence, does it fail to flag this)?
- **Flatness**: Does the deliberation produce bland synthesis rather than sharp, specific insights?
- **Overpromising**: Does the tool's output create the impression of having "consulted" affected communities?

### 5.4 Iteration Priorities

Based on evaluation findings, identify and prioritise improvements.

#### Categories
- **Prompt engineering**: Adjustments to system prompts, Socratic questions, analysis structure, or provocation generation
- **Evidence base**: Additional sources needed for specific use cases or populations
- **Framework refinement**: Changes to the policy characteristics taxonomy, population dimensions, or impact dimensions
- **Interface improvements**: UX changes based on how analysts actually use the tool
- **Architectural changes**: If any phase's technical approach isn't working, identify what needs restructuring

---

## Future Work Prioritisation

Based on what the analysts learn from using the prototype, prioritise the future development roadmap. Candidates from the brainstorming session:

### Raw Data Integration
Ingesting actual survey responses and interview transcripts (with appropriate consent) to ground the tool in first-person language and experiences rather than research summaries. This was identified as the most impactful improvement but requires data engineering and consent frameworks.

### Internal Datasets
Connecting the tool to Nesta's internal data and research. Scope and feasibility to be determined based on what's available and what permissions are needed.

### Literature Search Layer
Automated retrieval from academic databases and grey literature beyond the curated evidence base. Would significantly expand coverage but introduces quality control challenges.

### Quantitative Modelling
Incorporating household spending data, food pricing data, geographic food access data, and IMD profiles to complement the qualitative analysis with quantitative estimates (e.g. "this price cap would save household type X approximately £Y per week").

### Agent-Based Simulation
Exploring TinyTroupe or similar frameworks for multi-agent simulation of how populations respond collectively to policy changes. Most relevant for policies with network effects or social dynamics.

---

## Outputs of Phase 5

1. **Evaluation report**: Structured assessment of the tool's performance across all four use cases, including scores against evaluation criteria, failure modes identified, and analyst feedback.
2. **Iteration backlog**: Prioritised list of improvements, categorised by effort and impact.
3. **Future roadmap**: Recommended next phases of development based on what would add the most value.
4. **Usage guidance**: Documentation for analysts on how to use the tool effectively, including its strengths, limitations, and how to interpret outputs.
5. **Ethical use guidelines**: Clear guidance on how outputs should and should not be used, cited, or shared — informed by the real outputs the evaluation produced.
