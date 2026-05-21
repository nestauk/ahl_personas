# Context: Food Policy Equity Impact Tool

## Organisation

Nesta is an innovation foundation focused on social impact. The health team within Nesta works on policies around the "food environment" — the broad set of conditions that shape what people eat, including food retail, pricing, advertising, availability, and health service provision.

## Problem Statement

Evidence suggests that population-wide interventions are the most equitable way to reduce obesity because they require limited individual action or behaviour change. However, obesity follows a social gradient: people on lower incomes experience higher rates of obesity. When population-wide food policies are designed, their differential impact on lower-income and underrepresented socioeconomic/demographic groups is often poorly understood.

The ideal approach to understanding these differential impacts would be large-scale qualitative engagement with affected communities — surveys, focus groups, interviews with people from marginalised groups. This is resource-intensive and time-consuming, meaning it rarely happens at the pace policy development requires.

## What We Are Building

An AI-powered tool that helps health team analysts stress-test food environment policies against the likely experiences of underrepresented population sub-groups. The tool is explicitly positioned as a **pre-consultation analytical aid** — it sharpens the analysts' thinking and identifies blind spots before real engagement with affected communities, not as a substitute for that engagement.

## Desired Outcomes

1. **Identify impacted sub-groups**: Provide a first-pass understanding of which population sub-groups might be most affected by a policy or trial intervention.
2. **Analyse lived experience dimensions**: Understand how these sub-groups might experience the policy in terms of cost of living, access to healthy foods, equitable impact on health outcomes/eating habits, and food security.
3. **Surface evidence gaps**: Identify what we still can't know, where evidence is thin, and what would need real consultation to validate.
4. **Build the case for deeper work**: Create a case for change to deepen understanding of how to integrate work on inequalities within Nesta's health project work.

## Core Design Principles

### The tool is a thinking partner, not a report generator
The system uses a Socratic method on both sides — helping the analyst develop their policy idea through structured questioning on input, and challenging the analysis with provocations on output. It is conversational, not form-to-report.

### Grounding in evidence is non-negotiable
Every analytical claim should be traceable to the curated evidence base where possible. The tool must clearly distinguish between claims grounded in direct evidence, claims drawn from analogical evidence, and structured reasoning where evidence is absent.

### Material constraints, not simulated opinions
The tool models how policies interact with people's material circumstances (income, geography, time, access, health) rather than attempting to simulate what marginalised people "would think." The analysis is structural, not performative.

### Transparency about limitations
The tool should make visible what it can and cannot know. Evidence gaps and analytical uncertainty are first-class outputs, not footnotes.

## Use Cases (from analyst brainstorming)

These are the initial policies the analysts want to test the tool against:

1. **GLP-1 NHS wraparound support** — Optimising NHS support for durable impact of GLP-1 medications, taking into account baseline dietary behaviour, comorbidities, access to healthy food, and affordability of GLP-1-oriented dietary changes.
2. **GLP-1 rollout** — Broader population-level rollout of GLP-1 medications and differential access/impact.
3. **Tax revenue distribution** — How revenue from food/sugar taxes is redistributed and who benefits.
4. **Price caps** — Caps on pricing of essential food items and downstream effects across population groups.

## Evidence Base

The analysts have curated an initial evidence base of ~15-20 qualitative and mixed-methods research sources. These are primarily UK-based studies covering:

- Food insecurity and food bank experiences
- Shopping behaviours in deprived areas
- Cooking practices and constraints in low-income households
- Fast food / takeaway consumption as social infrastructure
- Parental food choices under financial pressure
- Food aid experiences and dignity
- Interactions with the local food retail environment

The evidence base spans approximately 2010–2026 across English regions including London, Manchester, Liverpool, West Midlands, Bradford, Great Yarmouth, Bristol, and North East England. Studies use methodologies including ethnographic research, semi-structured interviews, shop-along interviews, photo-elicitation, longitudinal interviews, and grounded theory.

**Known limitations of the current evidence base:**
- Several entries are sparse (missing links, descriptions, or methodology notes)
- Coverage may not extend to all use cases (particularly GLP-1 / pharmaceutical policy)
- Raw qualitative data (interview transcripts, survey responses) is not included in this phase
- Geographic coverage is uneven

## System Architecture (High Level)

The system has three main stages, informed by the whiteboard design from the analyst brainstorming session:

### Input Stage: Socratic Policy Development
A chatbot interface where the analyst describes a policy (potentially early-stage or loosely defined). The tool uses Socratic questioning to develop the policy into a fully specified set of policy elements suitable for analysis.

### Analysis Engine: Population × Policy
Two sub-stages:
1. **Population & Lived Experience**: Cross-references defined population sub-groups against the policy elements, analysing how each group would experience the policy across defined dimensions. Grounded in the evidence base.
2. **Deliberation**: Synthesises across population-policy intersections to surface tensions, trade-offs, patterns, and gaps.

### Output: Layered Insights and Provocations
- Top-level insights (which groups most affected, key themes)
- Stratified detail by population sub-group
- Provocations: evidence gaps, assumption challenges, Socratic questions back to the analyst ("have you considered..."), expansive thinking
- Themes, frequency of concern, points of contention, edge cases

### Foundation: Evidence Base
The curated corpus sits underneath the entire system, providing grounding for analytical claims throughout.

## Ethical Positioning

This tool must be positioned — in its UI, its outputs, and its documentation — as a pre-consultation analytical aid. Specific requirements:

- Outputs should never be framed as "the views of" any community or group
- The tool should actively recommend real engagement where its analysis is uncertain
- Confidence/evidence indicators should be visible on every analytical claim
- The tool should not create a false sense of having "consulted" affected communities

## Future Work (Out of Scope for Prototype)

- Integration of raw survey responses and interview transcripts
- Internal Nesta datasets
- Automated literature search layer
- Agent-based simulation (e.g. TinyTroupe-style multi-agent interaction)
- Quantitative modelling of financial impacts using household spending data
