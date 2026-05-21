# Phase 1: Foundations

## Goal

Establish the technical scaffolding (chat interface, evidence base, retrieval) and the domain frameworks (policy characteristics, population sub-groups) that all subsequent phases build on. Technical and analyst work runs in parallel with no cross-dependencies.

## Technical Deliverables

### 1.1 Chat Interface

Build a conversational interface where an analyst can describe a food environment policy and interact with the tool. At this phase, the chat does not need to do structured analysis — it needs to:

- Accept natural language input from the analyst
- Maintain conversation history within a session
- Provide a foundation that Phases 2–4 will layer intelligence onto

The interface should feel like a professional internal tool, not a generic chatbot wrapper. The analysts are the primary users — they are non-technical but expert in their domain.

#### Requirements
- Conversational chat with message history
- Clear visual distinction between analyst input and tool output
- Ability to start a new session / clear history
- Responsive — analysts may use this on laptops of varying sizes

#### Open Questions
- What frontend framework to use? (React, Next.js, plain HTML?)
- Should sessions persist across page refreshes? If so, what storage approach?
- Is authentication needed at the prototype stage, or is this an internal-only tool?
- Should the interface be a standalone web app or embedded in an existing Nesta tool?

### 1.2 Evidence Base Ingestion

Ingest the curated evidence CSV into a format the system can retrieve from. Each source should be stored with its metadata (name, link, description, methodology, data type, thematic notes).

#### Requirements
- Parse the CSV and handle the multi-line fields (descriptions and notes span multiple CSV rows in some entries)
- Store each source as a structured record with all available fields
- Handle sparse entries gracefully (some sources have minimal metadata)
- Support adding new sources without rebuilding the entire system
- Preserve the analyst's thematic annotations — these are high-signal for retrieval

#### Open Questions
- What storage format? (Vector database, structured JSON, both?)
- Should the evidence base be chunked at source level or at a more granular level (e.g. per finding, per theme)?
- How to handle sources with URLs — should the full text be fetched and stored, or just the metadata?
- If using embeddings for retrieval, what embedding model?

### 1.3 Retrieval System

Build a retrieval pipeline that, given a policy description or analytical query, returns the most relevant evidence from the curated base.

#### Requirements
- Retrieve relevant sources given a natural language query
- Retrieval should work across multiple dimensions: population type, geographic context, food environment dimension, methodology type
- Return source metadata alongside content so the system can cite evidence
- The analyst's thematic annotations (e.g. "convenience as survival", "mental load of shopping", "takeaways as social belonging") should be high-weight retrieval signals

#### Open Questions
- Retrieval approach: semantic search (embeddings), keyword matching, hybrid?
- How many sources should be retrieved per query? (The evidence base is small enough that aggressive retrieval may be fine)
- Should retrieval happen once per policy, or dynamically per population-policy combination in later phases?
- How to evaluate retrieval quality at this stage?

---

## Analyst Deliverables

### A1. Policy Characteristics Taxonomy

**What we need:** A structured breakdown of how food environment policies can be decomposed into their component elements. When an analyst describes a policy, what are the key characteristics the tool needs to understand?

**Guiding questions for the analysts:**
- When you describe a policy to a colleague, what aspects do you cover? (e.g. mechanism, target population, what it changes, what it assumes, who implements it, cost/funding model)
- Looking at the four use cases (GLP-1 wraparound, GLP-1 rollout, tax revenue distribution, price caps) — what characteristics do they share, and where do they differ?
- Are there established frameworks in food policy for classifying interventions? (e.g. upstream vs downstream, regulatory vs voluntary, fiscal vs environmental)
- What characteristics most determine whether a policy will have differential impact on different groups?

**Desired output format:** A list or taxonomy of policy characteristics with brief descriptions and, ideally, examples from the four use cases showing how each characteristic applies.

### A2. Population / Sub-Group Framework

**What we need:** A structured definition of the population dimensions and sub-groups the tool should analyse. Not a fixed set of named personas, but a set of configurable dimensions that can be combined to represent different population segments.

**Guiding questions for the analysts:**
- What dimensions of a person's circumstances most determine how they experience food environment policies? (e.g. income, geography, household composition, employment, ethnicity, disability, age)
- Which intersections matter most? (e.g. elderly + rural + limited mobility, single parent + shift work + urban food desert)
- Are there standard stratifications used in food policy research or public health that we should align with?
- Which sub-groups do you feel the evidence base covers well? Which are blind spots?
- Should the tool offer pre-defined "common" sub-groups as starting points, or should analysts always build their own?
- How granular should this be? (e.g. "low income" vs specific income bands, "urban" vs specific neighbourhood types)

**Desired output format:** A set of dimensions with possible values/ranges for each, notes on which intersections are most policy-relevant, and an indication of evidence coverage per dimension.

### A3. Evidence Base Gap-Fill

**What we need:** The sparse entries in the evidence CSV filled in, and any additional sources identified — particularly for the GLP-1 and pharmaceutical policy use cases which may not be well served by the current corpus.

**Guiding questions for the analysts:**
- Can the Food Foundation, WHICH?, "We are Fed Up", and "Hunger in the UK" entries be completed with descriptions, links, and methodology?
- Are there sources on GLP-1 medications, weight management services, or pharmaceutical access inequalities that should be added?
- Are there sources covering populations not well represented (e.g. rural communities, ethnic minority food practices, disabled people's food access)?
- Are there government consultations, NICE guidelines, or PHE/OHID publications that should be included?

**Desired output format:** Updated CSV or additions to the existing CSV, with all fields populated as fully as possible.

---

## Testing at Phase 1 Completion

The technical system should be testable as follows:

1. **Chat interface**: An analyst can open the tool, type a policy description, and see a response.
2. **Evidence retrieval**: Given a query like "How do low-income families in urban areas experience food pricing changes?", the system retrieves relevant sources from the evidence base with appropriate metadata.
3. **Integration**: The chat interface uses retrieved evidence in its responses, with source attribution visible.

At this stage, the quality of the analytical response itself is not the focus — that comes in Phases 2–4. The focus is: does the plumbing work?
