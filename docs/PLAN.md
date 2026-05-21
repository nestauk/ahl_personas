# Project Plan: Food Policy Equity Impact Tool

## Overview

This project is built in five phases. Each phase produces something testable so the analysts can evaluate and course-correct incrementally. The analyst team (non-technical, domain experts in food policy and qualitative methods) is developing domain-specific components in parallel with technical implementation.

## Phase Summary

| Phase | Name | Technical Deliverable | Analyst Deliverable | Testable Outcome |
|-------|------|----------------------|---------------------|------------------|
| 1 | Foundations | Chat interface, evidence base ingestion, retrieval system | Policy characteristics taxonomy, population framework, evidence base gap-fill | "Can I chat with the tool and get relevant evidence retrieved for a policy query?" |
| 2 | Input Stage | Socratic policy development chatbot | Socratic question framework, worked GLP-1 example | "Does the chatbot successfully develop a vague policy idea into a fully specified one?" |
| 3 | Analysis Engine | Per-population policy impact analysis | Lived experience analysis structure, output specification | "Given a policy and a population, does the analysis surface relevant concerns grounded in evidence?" |
| 4 | Deliberation & Provocations | Cross-population synthesis, provocation generation | Deliberation structure, provocation taxonomy, evaluation criteria | "Does the tool surface tensions, gaps, and challenges the analysts hadn't considered?" |
| 5 | Evaluation & Iteration | Refinement across all use cases | Evaluation against criteria, feedback on all four use cases | "Is this tool genuinely useful for our policy work?" |

## Dependencies

```
Phase 1 (technical) ←→ Phase 1 (analyst)    [parallel, no dependencies]
Phase 2 (technical) ← Phase 1 (analyst)      [needs policy characteristics + Socratic framework]
Phase 3 (technical) ← Phase 2 (technical)    [needs working input stage]
Phase 3 (technical) ← Phase 1 (analyst)      [needs population framework]
Phase 4 (technical) ← Phase 3 (technical)    [needs working analysis engine]
Phase 4 (technical) ← Phase 4 (analyst)      [needs deliberation structure + provocation taxonomy]
Phase 5             ← Phase 4                 [needs full system]
```

### Critical Path

The analyst deliverables in Phase 1 gate all subsequent technical work. The most important items to complete first are:

1. **Policy characteristics taxonomy** — gates Phase 2
2. **Population/sub-group framework** — gates Phase 3
3. **Evidence base gap-fill** — improves quality at every phase but does not hard-block

## Analyst Briefs

Each phase file contains a section describing what the analysts need to deliver, in what format, and with guiding questions to help them structure their thinking. These can be shared directly with the analyst team.

## Technical Architecture Decisions

Implementation decisions are deferred to each phase. Each phase file includes an "Open Questions" section listing decisions to resolve at implementation time. This allows the architect to evaluate options in context rather than committing prematurely.

## File Structure

```
CONTEXT.md          — Problem statement, project background, design principles
PLAN.md             — This file. Overarching plan and sequencing.
PHASE_1.md          — Foundations: chat interface, evidence base, retrieval
PHASE_2.md          — Input stage: Socratic policy development
PHASE_3.md          — Analysis engine: population × policy
PHASE_4.md          — Deliberation and provocations
PHASE_5.md          — Evaluation and iteration
```

## Evidence Base

The curated evidence CSV (`HACK_DAY__Personas_chatbot_-_Sheet1.csv`) is the initial evidence base. It contains ~15-20 sources with fields:

- `Data source name`
- `Open access link to output`
- `Description`
- `Data collection methodology/ limitations`
- `Data type` (Qual / Mixed methods)
- `Any other notes` (thematic annotations from analysts)

This file will be enriched by the analysts during Phase 1 and may grow as new sources are added for specific use cases.
