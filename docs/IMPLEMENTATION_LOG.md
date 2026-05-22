# Implementation Log

## 2025-05-21 — Repository scaffolding

### What was done

Set up the complete repository structure for the AHL Personas chatbot — an AI-powered food policy equity impact tool for Nesta's health team. This is scaffolding only; no features have been implemented.

### Stack decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | Python 3.11 / FastAPI | Best ecosystem for LLM orchestration, evidence retrieval, and data processing. FastAPI is lightweight, async, and has native Pydantic integration. |
| Frontend | Next.js 15 / React 19 / Tailwind CSS 4 | Chat-first interface needs streaming responses, rich markdown rendering, and expandable layered outputs. Tailwind enables rapid UI iteration. |
| LLM | OpenAI API (GPT-4o default) | Direct SDK usage rather than LangChain — the project's prompt engineering needs (Socratic questioning, evidence grounding, deliberation) are specific enough that an abstraction layer would add complexity without value. |
| Structured outputs | Pydantic | OpenAI SDK supports Pydantic models natively for structured LLM responses, which will be essential for the analysis engine. |
| Streaming chat | Vercel AI SDK (`ai@4`) | Open-source (Apache 2.0) library for streaming chat UIs in React. Not coupled to Vercel's commercial platform. |
| Python deps | uv | Fast, modern Python dependency management. Lock file committed for reproducibility. |
| JS deps | npm | Standard Node.js package management. |

### Structure decisions

**Monorepo with Python at root, frontend as subdirectory.** `pyproject.toml` at root manages the Python backend; `frontend/` has its own `package.json`. Simplest structure that keeps concerns separated while remaining easy to restructure later.

**Backend package layout** was initially organised by conversation stage (`input/`, `analysis/`, `deliberation/`). This was revised after review — those three stages are different prompt configurations within a single conversation flow, not separate systems. The revised structure:

```
src/food_policy_impact_tool/
├── api/              # FastAPI routes and request/response handling
├── core/
│   └── config.py     # Settings from environment variables via pydantic-settings
├── evidence/         # PDF ingestion, chunking, storage, and retrieval
├── llm/              # Single orchestration layer for all conversation stages
│   └── prompts/      # Prompt templates as editable markdown files
└── models/           # Pydantic models shared across the system
```

Key reasoning behind this layout:

- **`llm/` instead of per-stage modules** — The orchestrator manages which stage the conversation is in and selects the appropriate prompt template, but the mechanics of calling the LLM, managing history, streaming, and assembling context are shared. Stage differences live in the prompts, not the plumbing.
- **Prompts as standalone markdown files** — The analysts (non-technical, domain experts) need to review and iterate on the Socratic framework, analysis structure, and provocation taxonomy. Editable files they can read without touching Python.
- **`evidence/` as a separate module** — PDF processing, chunking, embedding, and retrieval are genuinely distinct infrastructure with their own dependencies and iteration cycle.
- **`models/` for shared Pydantic models** — Policy, population, and output structures flow between every layer. Single location keeps evolution clean as analysts deliver their frameworks.

**Evidence base structure** — the `data/` folder has two levels:

```
data/
├── *.csv              # Metadata index listing sources
└── sources/           # PDF reports referenced by the CSV
```

The CSV is a manifest; the PDFs in `sources/` are the actual corpus that will be chunked and embedded. Both are gitignored (large/binary files).

### Files created

- `pyproject.toml` — Python project config (`ahl-personas`), dependencies, ruff/pytest config
- `.python-version` — Pins Python 3.11
- `uv.lock` — Locked Python dependency versions
- `.env.example` — Template for `OPENAI_API_KEY` and optional `OPENAI_MODEL`
- `.gitignore` — Covers Python, Node.js, environment files, data files (CSVs, PDFs)
- `README.md` — Project overview, structure, stack, setup instructions, links to docs
- `src/food_policy_impact_tool/core/config.py` — Settings class using `pydantic-settings`
- `frontend/package.json` — Next.js app (`ahl-personas-frontend`) with React 19, Tailwind 4, AI SDK 4
- `frontend/tsconfig.json` — TypeScript config
- `frontend/next.config.ts` — Next.js config (empty, ready for customisation)
- `frontend/postcss.config.mjs` — Tailwind CSS via PostCSS
- `frontend/src/app/layout.tsx` — Root layout with metadata
- `frontend/src/app/page.tsx` — Placeholder landing page
- `frontend/src/app/globals.css` — Tailwind import
- Package `__init__.py` files for `api`, `core`, `evidence`, `llm`, `models`, `tests`
- `.gitkeep` files for `data/`, `data/sources/`, `llm/prompts/`

### Git

- Repository initialised on `dev` branch (org convention)
- Initial commit: `2051236` — "Initial scaffolding for AHL Personas chatbot"

### What has NOT been decided yet

- Conversation state management approach
- Authentication/authorisation (if any)

### What has NOT been implemented

- No tests

---

## 2026-05-21 — Phase 1: Foundations

### What was done

Implemented the three foundational components: evidence base ingestion, hybrid retrieval system, and streaming chat interface. The full pipeline is end-to-end functional — CSV + PDFs go in, an analyst can ask questions and get evidence-grounded streaming responses with source citations.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding model | OpenAI `text-embedding-3-small` (1536 dims) | Cheap, fast, sufficient quality for a corpus of ~16–100 documents. Already have an API key. |
| Vector store | Qdrant in-process mode (`QdrantClient(path=...)`) | File-based, no server/Docker dependency, persists to disk. Stores both dense and sparse vectors per chunk. |
| Retrieval | Hybrid — semantic (dense) + keyword (sparse TF-IDF) with reciprocal rank fusion | Domain-specific terminology (e.g. "paraliminality", "food deserts") benefits from keyword matching alongside semantic search. RRF merges both result lists in Python (Qdrant's in-process mode doesn't support server-side fusion). |
| PDF extraction | PyMuPDF (`pymupdf`) | Fast, good layout preservation for academic PDFs. |
| Chunking | Recursive text splitting (paragraph → line → sentence boundaries), ~3000 char chunks with 400 char overlap | Simple, effective for research papers. Synthetic metadata chunks created from analyst annotations (key insights, methodology) to boost retrieval relevance. |
| Streaming | Vercel AI SDK `useChat` with `streamProtocol: 'text'` + FastAPI `StreamingResponse` | SDK handles message state and streaming UI automatically. Plain text protocol avoids implementing the full AI SDK data stream format. |
| Ingestion trigger | CLI script + API endpoint | `make ingest` for initial setup, `POST /api/v1/ingest` for convenience. |

### Evidence ingestion pipeline

1. **CSV parsing** (`evidence/csv_parser.py`) — uses Python `csv.reader` to handle multi-line headers (the header row spans 5 raw lines), embedded double-quotes, commas within quoted fields, and the truncated final row (GLP-1 entry). Rows without a `pdf_filename` value are skipped with a warning.
2. **PDF extraction** (`evidence/pdf_extractor.py`) — PyMuPDF page-by-page text extraction. Handles corrupt/unreadable PDFs gracefully.
3. **Chunking** (`evidence/chunker.py`) — recursive splitting with overlap. Also creates synthetic metadata chunks from the analyst's `Key insights and themes` and `Methodology/limitations` annotations.
4. **Embedding** (`evidence/embedder.py`) — batched OpenAI API calls (up to 2048 texts per request).
5. **Storage** (`evidence/store.py`) — Qdrant with two named vectors per point: `dense` (OpenAI embedding) and `sparse` (TF-IDF with sublinear TF scaling). Content hash stored in payload for idempotent re-runs.
6. **Orchestration** (`evidence/ingest.py`) — parses CSV, extracts PDFs, chunks, embeds, stores. Compares content hashes to skip unchanged sources, deletes and re-ingests changed ones.

**Result**: 15 sources ingested (640 chunks), 3 skipped (PDFs not on disk: `which-affordable-food.pdf`, `hunger-in-uk-2025.pdf`, `glp1-patient-perspective-uk.pdf`). Re-run correctly detects all 15 as unchanged — no duplicates, no wasted API calls.

### Retrieval system

`evidence/retriever.py` — single entry point. Embeds the query (dense), computes sparse vector (TF-IDF), runs two separate Qdrant searches, merges with reciprocal rank fusion (k=60). Returns top-k results with full source metadata.

### Chat interface

**Backend** (`api/routes/chat.py`) — `POST /api/v1/chat` accepts `{ messages: [...] }` from the Vercel AI SDK. Retrieves evidence for the latest user message, injects into LLM context, streams response as plain text.

**LLM orchestrator** (`llm/orchestrator.py`) — loads system prompt from `llm/prompts/system.md`, formats evidence context with source attributions, streams via OpenAI async API.

**System prompt** (`llm/prompts/system.md`) — identifies the tool's purpose, instructs the LLM to cite sources, distinguish evidence strength, and surface gaps. British English. Does not attempt the Socratic or analysis behaviours from later phases.

**Frontend** — Next.js chat interface with:
- `ChatContainer` — wraps `useChat` hook pointed at FastAPI backend
- `MessageList` — scrollable message history with auto-scroll, welcome message when empty
- `MessageBubble` — user messages (right-aligned, blue tint) vs assistant messages (left-aligned, white, markdown-rendered via `react-markdown`)
- `ChatInput` — textarea with Enter-to-send, disabled during streaming
- `Header` — tool name + "New session" button (clears message history)

Design: muted stone/warm-grey palette, generous whitespace, professional feel appropriate for an internal Nesta tool. Responsive for laptop screens.

### Dev workflow

`Makefile` at repo root:
- `make backend` — starts FastAPI on port 8000 with hot reload
- `make frontend` — starts Next.js dev server on port 3000
- `make ingest` — runs the ingestion CLI
- `make dev` — starts both in background

### Files created

**Backend:**
- `src/food_policy_impact_tool/api/__init__.py` — FastAPI app factory with CORS, lifespan
- `src/food_policy_impact_tool/api/dependencies.py` — retriever singleton management
- `src/food_policy_impact_tool/api/routes/__init__.py`
- `src/food_policy_impact_tool/api/routes/chat.py` — streaming chat endpoint
- `src/food_policy_impact_tool/api/routes/ingest.py` — ingestion trigger endpoint
- `src/food_policy_impact_tool/evidence/csv_parser.py`
- `src/food_policy_impact_tool/evidence/pdf_extractor.py`
- `src/food_policy_impact_tool/evidence/chunker.py`
- `src/food_policy_impact_tool/evidence/embedder.py`
- `src/food_policy_impact_tool/evidence/store.py`
- `src/food_policy_impact_tool/evidence/retriever.py`
- `src/food_policy_impact_tool/evidence/ingest.py`
- `src/food_policy_impact_tool/llm/orchestrator.py`
- `src/food_policy_impact_tool/llm/prompts/system.md`
- `src/food_policy_impact_tool/models/evidence.py`
- `src/food_policy_impact_tool/models/chat.py`

**Frontend:**
- `frontend/src/components/chat/ChatContainer.tsx`
- `frontend/src/components/chat/MessageList.tsx`
- `frontend/src/components/chat/MessageBubble.tsx`
- `frontend/src/components/chat/ChatInput.tsx`
- `frontend/src/components/ui/Header.tsx`

**Config:**
- `Makefile`

**Modified:**
- `pyproject.toml` — added `qdrant-client`, `pymupdf`
- `src/food_policy_impact_tool/core/config.py` — added embedding, Qdrant, evidence, chunking settings
- `frontend/package.json` — added `react-markdown`, `lucide-react`
- `frontend/src/app/globals.css` — design tokens, markdown prose styling
- `frontend/src/app/layout.tsx` — added `antialiased`
- `frontend/src/app/page.tsx` — replaced placeholder with `ChatContainer`
- `.gitignore` — added `data/qdrant_store/`, Next.js build artifacts
- `.env.example` — added embedding model config

### What has NOT been implemented yet

- No Socratic questioning flow (Phase 2)
- No structured policy decomposition (Phase 2)
- No population framework or persona selection (Phase 3)
- No deliberation or provocation generation (Phase 4)
- No authentication or user management
- No session persistence across page refreshes
- No tests

---

## 2026-05-21 — Phase 2: Socratic Policy Specification

### What was done

Implemented the Socratic policy specification stage: a conversational flow that takes a loosely defined food environment policy from an analyst and produces a structured specification mapped to the policy characteristics taxonomy. This specification becomes the input to the equity impact analysis in Phase 3.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Streaming protocol | AI SDK data stream protocol (`x-vercel-ai-data-stream: v1`) | Enables sending structured specification state alongside streamed text. Backend emits `0:` text parts, `2:` data parts, `e:` finish step, `d:` finish message. Frontend receives spec data via `useChat`'s `data` property. |
| Specification extraction | Option A — embedded `<policy_spec>` JSON block in LLM response | LLM appends a `<policy_spec>` JSON block at the end of each response. Backend buffers the response, extracts and validates the block, then emits it as a data stream part. Frontend strips the block from rendered message content. |
| Stage tracking | Client-side, sent with each request | Matches the stateless architecture — no session persistence needed. `stage` field on `ChatRequest` determines prompt selection and whether evidence is retrieved. |
| Stage transitions | Analyst-triggered via "Proceed to analysis" button | No automatic detection of specification completeness. The analyst decides when the specification is sufficient. Button click inserts a client-generated confirmation message with both human-readable markdown table and a `<policy_spec>` JSON block for Phase 3 parsability. |
| Sidebar | Read-only, populated by LLM extraction | Reduces complexity. Values come exclusively from the Socratic conversation flow. |
| Spec extraction error handling | Graceful degradation — log and skip | If `<policy_spec>` extraction fails (malformed JSON, missing tags), no spec update is emitted. Sidebar retains previous state. Never crashes the request. |

### Socratic system prompt

`llm/prompts/socratic.md` — a policy specification analyst prompt that:
- Encodes the full six-characteristic taxonomy (policy lever, in-scope businesses, business size, delivery channel, population, geography) with all options
- Instructs the LLM to identify 2-3 most ambiguous characteristics and ask 1-2 targeted questions per exchange (not a checklist)
- Challenges on specification clarity, accepts "I don't know" as valid
- Requires a `<policy_spec>` JSON block at the end of every response with current spec state, source attribution (analyst/assumed/unspecified/empty), assumption rationale, and `active_characteristic` for taxonomy hint display
- Includes one worked example (Healthy Start voucher expansion) demonstrating the right tone and depth
- Does NOT use the evidence base — evidence comes in Phase 3
- Has a `{{CURRENT_SPEC_STATE}}` placeholder injected at runtime with the current sidebar state

### Conversation stage management

Two stages implemented in the orchestrator:
- `specifying` — Socratic flow active. Uses `socratic.md` system prompt. No evidence retrieval. Spec extraction active.
- `chatting` — Post-specification general conversation. Uses Phase 1 `system.md` prompt. Evidence retrieval active.

Stage is sent by the frontend with each request. The orchestrator selects the prompt and behaviour based on it. Extensible for Phase 3 (`analysing`) and Phase 4 (`deliberating`) via the `ConversationStage` type alias.

### Data stream protocol implementation

Backend emits lines in the AI SDK v4 data stream format:
- `0:"json escaped text"\n` for text deltas (streamed token by token)
- `2:[{spec_metadata}]\n` for specification state (emitted once after stream completes)
- `e:{finishReason, usage, isContinued}\n` for step completion
- `d:{finishReason, usage}\n` for message completion (must be last)

Response includes `x-vercel-ai-data-stream: v1` header and `text/plain; charset=utf-8` content type.

### Progressive specification sidebar

Right-side panel (`SpecificationSidebar.tsx` + `SpecificationRow.tsx`) showing all six taxonomy characteristics:
- Each row shows one of four visual states: **empty** (greyed out), **analyst-provided** (solid styling), **assumed** (italic amber with rationale tooltip), **unspecified** (TBD label)
- Updates once per exchange (after each LLM response completes), not within a single streamed response
- Shows a progress counter ("N of 6 characteristics specified")
- "Proceed to analysis" button at bottom — always clickable, becomes visually prominent (blue accent) when 5+ characteristics are filled
- Hidden when stage transitions to `chatting`

### Policy specification output

When the analyst clicks "Proceed to analysis", the frontend generates and inserts a synthetic assistant message containing:
1. A human-readable markdown specification table with characteristic values and sources
2. A `<policy_spec>` JSON block in the same format the LLM produces

This dual format ensures Phase 3 can reliably extract the finalised specification from conversation history.

### Frontend updates

**Two-panel layout**: Chat occupies the left/main area, specification sidebar occupies the right (320px fixed width). The sidebar is only visible during the `specifying` stage.

**Welcome state with example policy cards**: Six clickable cards representing the analyst-provided example policies. Each shows a short title and summary. Clicking a card inserts the full policy description as the first user message, starting the Socratic flow.

**Updated welcome message**: "Describe a food environment policy you'd like to analyse for equity impact. This can be a rough idea — I'll ask some questions to clarify the details."

**Stage indicator**: A pill badge in the header showing "Specifying policy" or "Ready for analysis".

**Taxonomy hints**: When the LLM is asking about a specific characteristic, subtle chips appear above the chat input showing the relevant taxonomy options (e.g. all geography options when asking about geography). Clicking a chip inserts the text into the input field. Gracefully degrades: if `active_characteristic` is missing or unrecognised, no hints are shown.

**Markdown table styling**: Added `.prose table`, `.prose th`, `.prose td` styles so the policy specification tables render cleanly in assistant messages.

**Spec block stripping**: `MessageBubble` strips `<policy_spec>` blocks from rendered message content via regex, so the JSON extraction block is never visible to the analyst.

### Files created

**Backend:**
- `src/food_policy_impact_tool/llm/prompts/socratic.md` — Socratic system prompt with full taxonomy

**Frontend:**
- `frontend/src/lib/types.ts` — shared TypeScript types (PolicySpecification, SpecValue, SpecMetadata, TAXONOMY constant, ConversationStage)
- `frontend/src/lib/spec-helpers.ts` — helper functions (buildSpecMarkdown, buildSpecBlock, filledCount)
- `frontend/src/components/specification/SpecificationSidebar.tsx` — sidebar panel
- `frontend/src/components/specification/SpecificationRow.tsx` — individual characteristic row
- `frontend/src/components/chat/PolicyCards.tsx` — example policy starter cards
- `frontend/src/components/chat/TaxonomyHints.tsx` — taxonomy option chips

### Files modified

**Backend:**
- `src/food_policy_impact_tool/models/chat.py` — added `ConversationStage` type, `SpecValue`, `PolicySpecification`, `SpecMetadata` models, `stage` and `spec_state` fields on `ChatRequest`
- `src/food_policy_impact_tool/llm/orchestrator.py` — replaced `stream_chat_response` with `stream_response` supporting stage-aware prompt selection, `<policy_spec>` extraction with graceful error handling, spec state injection into Socratic prompt
- `src/food_policy_impact_tool/api/routes/chat.py` — switched from plain text to AI SDK data stream protocol, added stage-based routing (skip evidence during specifying), data stream formatter functions

**Frontend:**
- `frontend/src/components/chat/ChatContainer.tsx` — major refactor: two-panel layout, spec state management, stage tracking, `useChat` with data stream protocol and `body` option, proceed/reset handlers
- `frontend/src/components/chat/MessageList.tsx` — updated welcome message, integrated PolicyCards
- `frontend/src/components/chat/MessageBubble.tsx` — strips `<policy_spec>` blocks from rendered content
- `frontend/src/components/chat/ChatInput.tsx` — removed border-t (managed by parent), adjusted for taxonomy hints above input
- `frontend/src/components/ui/Header.tsx` — added stage indicator pill badge
- `frontend/src/app/globals.css` — added design tokens for assumed/unspecified states, accent-light, table styling for markdown specification output

### What has NOT been implemented yet

- No equity impact analysis (Phase 3)
- No population framework or sub-group selection (Phase 3)
- No deliberation or provocation generation (Phase 4)
- No persistence of policy specifications across sessions
- No structured JSON extraction for backend consumption — sidebar state and markdown table are sufficient for now
- No authentication or user management
- No tests

---

## 2026-05-21 — Phase 3: Equity Impact Analysis Engine

### What was done

Implemented the equity impact analysis engine — the core value of the tool. When the analyst finishes specifying a policy (Phase 2) and clicks "Proceed to analysis", the tool now:

1. Scans every modifier in the personas framework against the policy specification, rating relevance as HIGH / MODERATE / LOW
2. Proposes 4–6 population sub-groups (combinations of modifiers) with rationale
3. The analyst confirms, removes, or requests additions via chat
4. Runs a full equity impact analysis: per-sub-group impacts grounded in the evidence base via agentic tool calling, a cross-cutting equity assessment, and provocations
5. Transitions to follow-up chat

The analysis runs as a **chain of focused LLM calls** (not one monolithic call), with **agentic RAG** via OpenAI function calling for evidence retrieval during each per-sub-group analysis.

### Architecture: chained analysis with agentic RAG

The analysis is structured as a multi-call chain managed by the orchestrator, streamed as a single long-lived HTTP response:

| Call | Purpose | Evidence | Tools |
|------|---------|----------|-------|
| Call 1 — Modifier scan | Relevance scan + sub-group proposal | None | None |
| Calls 2–N — Per-sub-group | Detailed impact analysis for one sub-group | Agentic (tool calls) | `search_evidence` |
| Final call — Synthesis | Equity assessment + provocations | None (synthesises from per-sub-group text) | None |

**Why chained, not monolithic**: A single call would need the full personas framework, all evidence across multiple sub-groups, the policy specification, theoretical lenses, and output format instructions simultaneously. Even if it fits the context window, reasoning quality degrades when the model juggles too many things at once, and evidence retrieval cannot be targeted per sub-group.

**Why agentic RAG, not pre-retrieval**: Each sub-group analysis needs evidence on multiple dimensions (financial impact, food access, shopping behaviour, cooking capacity, health outcomes). The LLM knows what it needs as it reasons and can formulate targeted queries — 3–6 searches per sub-group. If a search returns nothing relevant, the LLM flags the area as `[Gap]` rather than confabulating evidence. This avoids the "dump 30 chunks into context and hope the LLM uses the right ones" problem.

**Why single streaming response**: The frontend sees one HTTP stream with interleaved `2:` data messages for progress events. No orchestration loop, no state machine on the frontend, no error handling for partial failures across separate requests. The entire analysis is one logical assistant message.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Analysis architecture | Chained multi-call (scan → per-sub-group × N → synthesis) | Targeted evidence per sub-group, deeper reasoning per call, manageable context windows, incremental streaming |
| Evidence retrieval | Agentic RAG via OpenAI function calling (`search_evidence` tool) | LLM formulates targeted queries as it reasons; naturally handles evidence gaps; extensible as corpus grows |
| HTTP model | Single long-lived streaming response for the full chain | Frontend simplicity — one stream, one message. Data stream events interleaved for progress. No timeout concerns on localhost |
| Sub-group selection UI | Sidebar cards with remove buttons; additions via chat | A full modifier picker (6 categories, 30+ modifiers) would be substantial UI work. Chat-based additions trigger a lightweight re-scan |
| Evidence grounding tags | Strict regex in MessageBubble → styled `<span>` via `rehype-raw` | Only four known tag patterns are matched and converted to HTML spans. All other content passes through as-is. Prevents arbitrary HTML injection from LLM output |
| Analysis output rendering | Styled markdown with prominent headers + sidebar stepper for navigation | Collapsible sections were considered but deferred — the content-splitting during streaming is genuinely hard and a significant source of bugs. Sidebar jump-to-section gives 80% of the UX benefit |
| Error handling | Per-sub-group try/except, chain continues on failure | A failed sub-group emits an error banner and error status in the stepper, then the next sub-group proceeds. Synthesis receives whatever analyses completed |
| Retry logic | Exponential backoff on transient OpenAI errors (429, 500, 503), up to 2 retries per call | Long chains are more likely to hit rate limits or transient failures |

### Three prompt templates

Instead of one monolithic prompt, three focused templates that each do one thing well:

**`analysis_scan.md`** (Call 1) — The largest prompt. Contains the full personas framework (6 categories, 36+ modifiers, each with example material features), the policy-modifier heuristic mapping (policy lever × modifier interactions, delivery channel × modifier interactions, in-scope business × modifier interactions), the two-part scan process (modifier relevance scan → sub-group composition), priority modifier list, ethnicity guidance, and the `<proposed_sub_groups>` structured output requirement. Placeholder: `{{POLICY_SPECIFICATION}}`.

**`analysis_subgroup.md`** (Calls 2–N) — Focused single-sub-group analysis. Contains the four theoretical reasoning lenses (social determinants, structural determinants, commercial determinants, intersectionality) as reasoning instructions — the LLM applies them without naming them in the output. Contains evidence grounding requirements with all four levels (`[Evidence: Source, Year]`, `[Analogical: Source, Year]`, `[Reasoning]`, `[Gap]`), search strategy guidance (3–6 targeted searches per sub-group), output structure (who/how/benefits-harms/impact dimensions/uncertainties), and ethical guardrails. Placeholders: `{{POLICY_SPECIFICATION}}`, `{{SUB_GROUP_NAME}}`, `{{SUB_GROUP_MODIFIERS}}`.

**`analysis_synthesis.md`** (Final call) — Cross-cutting equity assessment and provocations. The four theoretical lenses are more prominent here for cross-cutting analysis. Output structure covers equity assessment (who benefits most/least, inequality direction, distributional effects, implementation burden differences) and provocations (evidence gaps, assumption risks, equity tensions, unintended consequences, implementation risks, design improvements). Placeholders: `{{POLICY_SPECIFICATION}}`, `{{SUB_GROUP_ANALYSES}}`.

### Orchestrator changes

Major additions to `llm/orchestrator.py`:

- **`stream_analysis_chain()`** — top-level async generator managing the multi-call flow. Iterates over confirmed sub-groups, runs each analysis with error handling, then runs synthesis. Emits data stream events at each transition.
- **`_stream_subgroup_with_tools()`** — per-sub-group call with OpenAI function calling loop. Streams text, collects tool call fragments, executes `search_evidence` via the existing `HybridRetriever`, feeds results back, continues until `finish_reason == "stop"`.
- **`_stream_synthesis()`** — final synthesis call (no tools). Receives all per-sub-group analyses as text input.
- **`_format_tool_evidence()`** — formats retrieval results as tool call responses. When no results found, returns an explicit instruction to flag as `[Gap]` — this is in the tool response itself, not just the system prompt, ensuring the LLM doesn't confabulate.
- **`_extract_subgroups_from_response()`** — parses `<proposed_sub_groups>` JSON block from scan output. Same graceful degradation pattern as Phase 2's `<policy_spec>` extraction.
- **`_extract_policy_spec_from_history()`** — scans conversation history backwards for the `<policy_spec>` block that contains the confirmed specification from Phase 2.
- **`_stream_with_retry()`** — wraps `client.chat.completions.create` with exponential backoff retry on transient errors.
- Updated `stream_response()` to handle `analysing` stage: routes to scan call (no confirmed sub-groups) or delegates to `stream_analysis_chain()` (with confirmed sub-groups).

### Data stream events

The orchestrator emits typed `2:` data messages that the frontend parses to drive the progress panel and evidence indicator:

| Event | When | Frontend action |
|-------|------|-----------------|
| `{ type: "analysis_step", step: "scan", status: "active" }` | Call 1 starts | Show scanning state in sidebar |
| `{ type: "analysis_step", step: "scan", status: "complete" }` | Call 1 finishes | Mark scan complete |
| `{ type: "proposed_sub_groups", subgroups: [...], relevance_scan: {...} }` | Extracted from scan output | Populate sub-group selection cards in sidebar |
| `{ type: "analysis_step", step: "subgroup", index, name, status: "active" }` | Sub-group call starts | Mark step active in stepper |
| `{ type: "evidence_search", query: "..." }` | Tool call made | Show evidence search indicator |
| `{ type: "analysis_step", step: "subgroup", index, status: "complete" }` | Sub-group call finishes | Mark complete, clear evidence indicator |
| `{ type: "analysis_step", step: "subgroup", index, status: "error" }` | Sub-group call failed | Mark error in stepper, chain continues |
| `{ type: "analysis_step", step: "synthesis", status: "active"/"complete" }` | Synthesis call | Update stepper |
| `{ type: "stage_transition", stage: "chatting" }` | Chain done | Transition to chatting |

### Error handling

Three failure modes are handled explicitly:

1. **Per-sub-group call failure**: Wrapped in try/except. Emits a visible markdown error banner (`> **Analysis error**: ...`), emits an `"error"` status data event for the stepper, and continues with the next sub-group. The synthesis call receives whatever analyses completed and notes which are missing.

2. **Malformed `<proposed_sub_groups>` JSON**: Same pattern as Phase 2 spec extraction — log warning, skip data emission, frontend retains previous state. The analyst can still see the proposed sub-groups in the chat markdown and respond conversationally.

3. **`search_evidence` returns no results**: The tool response explicitly instructs the LLM to flag as `[Gap]` and reason from material constraints if possible as `[Reasoning]`. This instruction is in the tool response content, not just the system prompt.

4. **Transient OpenAI API errors**: Exponential backoff retry (2^attempt seconds) on status codes 429, 500, 503, up to 2 retries per call. Exhausted retries fall through to the per-sub-group failure handler.

### Frontend: ChatContainer state management

New state in `ChatContainer`:
- `proposedSubGroups` — extracted from `proposed_sub_groups` data stream event, like `specMeta` in Phase 2
- `confirmedSubGroups` — initially set from proposed, modified by analyst (remove via sidebar button). Sent in `useChat` body when "Run analysis" is clicked
- `analysisProgress` — tracks all steps with their statuses, driven by `analysis_step` data events
- `activeEvidenceSearch` — current search query string (or null), driven by `evidence_search` events, cleared when a new step starts

`handleProceed` now transitions to `"analysing"` and auto-sends a trigger message via `append()` to initiate the scan call.

`handleRunAnalysis` initialises the progress stepper with the confirmed sub-group names and sends the analysis trigger message.

Data stream parsing handles all event types — `analysis_step`, `evidence_search`, `stage_transition`, `proposed_sub_groups` — in addition to the existing `spec` metadata parsing.

### Frontend: sidebar three-mode design

The `SpecificationSidebar` now has three modes during the `analysing` stage:

1. **Scanning** (no proposed sub-groups yet): Compact policy spec view at top, "Scanning modifier relevance…" message below.

2. **Sub-group selection** (proposed but not confirmed): Compact policy spec, sub-group cards with category-coloured modifier pills and remove buttons, rationale text, and a "Run analysis (N sub-groups)" button. No modifier picker — adding sub-groups is via chat.

3. **Analysis running/complete**: Compact policy spec, `AnalysisProgressPanel` component (vertical stepper).

### Frontend: new components

**`AnalysisProgressPanel`** — vertical stepper in the sidebar showing each analysis step with four visual states:
- **Pending**: greyed circle + muted text
- **Active**: accent-coloured circle with CSS pulse animation + bold text
- **Complete**: checkmark circle, clickable — scrolls to the relevant `h2`/`h3` heading in the chat via `document.querySelectorAll` text matching
- **Error**: warning icon + red text

Includes time estimate banner ("Analysing N sub-groups — typically takes 1–2 minutes") and completion state ("Analysis complete — ask follow-up questions below").

**`EvidenceSearchIndicator`** — small inline component shown above the chat input during `search_evidence` tool calls. Shows a search icon + the query text in muted italic with a CSS shimmer animation. Disappears when `activeEvidenceSearch` returns to null.

### Frontend: evidence grounding badges

`MessageBubble` now applies strict regex pre-processing to convert the four grounding tag patterns into styled `<span>` elements:

- `[Evidence: Source Name, Year]` → `<span class="badge-evidence">Evidence: Source Name, Year</span>` (teal/green pill)
- `[Analogical: Source Name, Year]` → `<span class="badge-analogical">...</span>` (amber pill)
- `[Reasoning]` → `<span class="badge-reasoning">Reasoning</span>` (grey pill)
- `[Gap]` → `<span class="badge-gap">Gap</span>` (red/pink pill)

Only these four patterns are matched — no arbitrary HTML from LLM output passes through. The spans are rendered via `rehype-raw` (new dependency).

`MessageBubble` also now strips `<proposed_sub_groups>` blocks from rendered content, same pattern as `<policy_spec>` stripping.

### CSS additions

- **Grounding badge styles**: four pill variants (teal, amber, grey, red/pink) with inline display and appropriate borders
- **Analysis section spacing**: `h2` elements in `.prose` get extra top margin and a top border for visual separation between sub-group sections
- **Stepper pulse animation**: `@keyframes stepper-pulse` on the active step circle
- **Evidence search shimmer**: `@keyframes evidence-shimmer` — subtle opacity pulse on the search indicator

### Files created

**Backend (3 prompt templates):**
- `src/food_policy_impact_tool/llm/prompts/analysis_scan.md`
- `src/food_policy_impact_tool/llm/prompts/analysis_subgroup.md`
- `src/food_policy_impact_tool/llm/prompts/analysis_synthesis.md`

**Frontend (2 new components):**
- `frontend/src/components/analysis/AnalysisProgressPanel.tsx`
- `frontend/src/components/chat/EvidenceSearchIndicator.tsx`

### Files modified

**Backend:**
- `src/food_policy_impact_tool/models/chat.py` — added `"analysing"` to `ConversationStage`, added `confirmed_subgroups` field to `ChatRequest`
- `src/food_policy_impact_tool/llm/orchestrator.py` — major rewrite: chained analysis flow, tool call loop, retry logic, data stream event emission, sub-group/spec extraction from history, error handling
- `src/food_policy_impact_tool/api/routes/chat.py` — routes `analysing` stage to scan or analysis chain, passes retriever and confirmed sub-groups to orchestrator

**Frontend:**
- `frontend/src/lib/types.ts` — added `SubGroup`, `ProposedSubGroups`, `AnalysisProgress`, `AnalysisStep`, all data stream event interfaces, helper functions
- `frontend/src/components/chat/ChatContainer.tsx` — significant: analysis state management, data stream parsing for all event types, sub-group editing callbacks, `handleRunAnalysis`, `handleProceed` now triggers analysing stage
- `frontend/src/components/specification/SpecificationSidebar.tsx` — significant: three-mode sidebar (sub-group selection, progress panel, scanning state), compact spec view, sub-group cards with modifier pills and remove buttons
- `frontend/src/components/chat/MessageBubble.tsx` — `<proposed_sub_groups>` stripping, grounding badge regex pre-processing, `rehype-raw` integration
- `frontend/src/components/ui/Header.tsx` — added `analysing: "Analysing equity impact"` stage label
- `frontend/src/app/globals.css` — grounding badge styles, analysis section spacing, stepper pulse animation, evidence search shimmer

**Dependencies:**
- `frontend/package.json` — added `rehype-raw`

### Design decisions deferred

- **Collapsible sub-group sections**: Dropped for the prototype. The content-splitting during streaming is genuinely hard — tracking character offsets, correlating with data events, splitting into separate components in real-time. Styled markdown headers + sidebar jump-to-section gives most of the UX benefit. Revisit if analysts find the long output unmanageable.
- **Modifier picker for sub-group additions**: A usable UI for composing custom modifier combinations from 6 categories and 30+ options is substantial work. For the prototype, the analyst types adjustments in the chat ("also add a sub-group for rural deprived + retired couple") and the backend re-runs a lightweight scan call.

### What has NOT been implemented yet

- No deliberation layer beyond what's in the provocations section (Phase 4)
- No multi-turn analysis refinement (re-running with different sub-groups is a new session)
- No export of analysis outputs (PDF, Word)
- No quantitative modelling beyond the qualitative evidence base
- No persistence of analyses across sessions
- No authentication or user management
- No tests

---

## 2026-05-21 — Phase 3 follow-up: Scan output as artefact + unified sidebar

### What was done

Two related changes to the analysis flow UX:

1. **Scan output moved to artefact panel** — the population relevance scan (previously a long table streamed inline in the chat) now renders in the same artefact panel used for the per-sub-group analysis. The chat receives a brief summary message instead.

2. **Unified progressive sidebar** — the three-mode sidebar (scanning placeholder → sub-group selection cards → analysis progress stepper) was replaced with a single progressive tracker that builds up sections as the analysis proceeds. Previous steps remain visible and navigable at all stages.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scan output destination | Artefact panel via `analysis_content` data events | Consistent with per-sub-group analysis. Keeps the chat clean — scan output is reference material, not conversational. |
| Scan output format | Per-category tables with `[High]`/`[Moderate]`/`[Low]` badge tags | Tables give density; category grouping gives scannability. Badge tags render as colour-coded pills via the existing grounding badge infrastructure. |
| Chat summary | Programmatic (constructed from extracted `relevance_scan` data) | No extra LLM call needed. Summary includes characteristic count and high-relevance count. |
| Sidebar architecture | Single progressive layout replacing three conditional modes | Avoids context loss when transitioning between phases. Sub-group cards collapse but remain expandable. Scan step stays visible with a summary. |
| Relevance badge rendering | Extend existing `renderGroundingBadges()` with `[High]`/`[Moderate]`/`[Low]` regex patterns | Reuses the same rendering pipeline as evidence grounding badges — no new components or rendering paths. |

### Scan output as artefact

**Backend** — the scan call in the orchestrator now yields `("analysis_content", {"section": "scan", "delta": ...})` instead of `("text", delta)`. After the scan completes and sub-groups are extracted, a brief text summary is yielded to the chat (e.g. "I've assessed all population characteristics against this policy. 8 rated as highly relevant — see the full assessment in the analysis panel.").

**Prompt** — `analysis_scan.md` output format changed from a single 36-row table to per-category tables with `### Category` headings, sorted HIGH-first within each category. Tags use title case (`[High]`, `[Moderate]`, `[Low]`).

**Frontend** — the artefact panel (`AnalysisView`) now appears as soon as the scan starts (split view with chat) rather than only when the full analysis chain runs. An empty scan section is created immediately when the `analysis_step scan active` event fires, so the panel and streaming dots appear before the first LLM token. The `AnalysisView` header shows a contextual subtitle for the scan section: "Initial assessment based on policy characteristics — the detailed analysis will draw on the evidence base."

**Grounding badges** — added `[High]`/`[Moderate]`/`[Low]` patterns (matching both title-case and uppercase) to `renderGroundingBadges()`. CSS styles: `.badge-high` (orange), `.badge-moderate` (amber), `.badge-low` (grey).

**Block stripping** — `AnalysisSectionPanel` now strips `<proposed_sub_groups>` JSON blocks from rendered content, same pattern as `MessageBubble`.

### Unified progressive sidebar

Replaced the three-mode conditional in `SpecificationSidebar` with a single vertical layout that accumulates sections:

1. **CompactSpecView** — confirmed policy summary (unchanged)
2. **Scan step** — `StepEntry` component. Active: pulsing dot + "Assessing population characteristics…". Complete: checkmark + summary text (e.g. "36 assessed, 8 high relevance") derived from `proposedSubGroups.relevance_scan`. Clickable to navigate to scan section in panel.
3. **Sub-group section** — `SubGroupSection` component with expand/collapse. During selection: expanded with editable cards + remove buttons + "Run analysis" button pinned at bottom. During/after analysis: collapsed to "N sub-groups confirmed" with chevron toggle to expand read-only cards.
4. **Analysis steps** — `StepEntry` entries for each sub-group and synthesis, with evidence search indicators on active steps.
5. **Banners** — time estimate during analysis, completion banner when done.

`AnalysisProgressPanel` deleted — its stepper logic absorbed into the sidebar via the reusable `StepEntry` component.

### Terminology changes

- "Scanning modifier relevance" → "Identifying affected populations" (sidebar, stepper)
- "modifier" removed from all user-facing text — replaced with "population characteristic" or "population group"
- Auto-sent trigger message updated to "Please assess population relevance and propose sub-groups"

### Backend logging

Added structured logging to the scan path in `orchestrator.py`: scan start, LLM call (with model), first token received, stream completion (with chunk count), sub-group extraction results (with counts), and a warning when extraction fails.

### Files created

None.

### Files modified

**Backend:**
- `src/food_policy_impact_tool/llm/orchestrator.py` — scan output redirected from text to `analysis_content`, chat summary generation, structured logging
- `src/food_policy_impact_tool/llm/prompts/analysis_scan.md` — output format changed to per-category tables with badge tags

**Frontend:**
- `frontend/src/components/specification/SpecificationSidebar.tsx` — major rewrite: unified progressive sidebar with `StepEntry`, `SubGroupSection`, `SubGroupCard` local components
- `frontend/src/components/chat/ChatContainer.tsx` — scan section handling (immediate creation on step active, auto-select), `showAnalysisView` logic (triggered by section existence), split view during scan/selection phase, terminology updates
- `frontend/src/components/analysis/AnalysisView.tsx` — contextual subtitle for scan section header
- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — `<proposed_sub_groups>` block stripping
- `frontend/src/lib/grounding-badges.ts` — `[High]`/`[Moderate]`/`[Low]` badge patterns (title-case and uppercase)
- `frontend/src/app/globals.css` — `.badge-high`, `.badge-moderate`, `.badge-low` styles

### Files deleted

- `frontend/src/components/analysis/AnalysisProgressPanel.tsx` — logic absorbed into `SpecificationSidebar`

### What has NOT been implemented yet

- No deliberation layer beyond what's in the provocations section (Phase 4)
- No multi-turn analysis refinement (re-running with different sub-groups is a new session)
- No export of analysis outputs (PDF, Word)
- No quantitative modelling beyond the qualitative evidence base
- No persistence of analyses across sessions
- No authentication or user management
- No tests

---

## 2026-05-22 — Dynamic Policy Specification

### What was done

Replaced the fixed 6-field taxonomy-driven policy specification with a free-form, conversation-driven approach. The Socratic conversation now produces a natural language policy summary (the primary artifact) and a lightweight taxonomy annotation (secondary, for the analysis engine), rather than filling in 6 predefined fields.

### Why

The fixed taxonomy (policy lever, in-scope businesses, business size, delivery channel, population, geography) forced every conversation through the same structure regardless of the policy being described. A GLP-1 medication policy doesn't naturally map to "in-scope businesses" or "business size". A rough concept like "do something about food prices for struggling families" doesn't need 6 fields filled before an analysis can begin. The taxonomy was creating friction rather than aiding comprehension.

The taxonomy remains useful as an analytical lens — the relevance scan's heuristic mapping (policy lever → financial modifiers, delivery channel → geography modifiers, etc.) depends on knowing these dimensions. But the conversation shouldn't be structured around filling them in.

### Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary specification output | Natural language policy summary | Captures nuance, mechanism detail, and scope in a form that works for any type of food environment policy — not constrained to 6 predefined categories |
| Taxonomy role | Soft conversational guide + structured annotation for analysis engine | The taxonomy dimensions are mentioned as "often relevant" in the prompt, not as fields to fill. The LLM maps to whichever dimensions apply and omits irrelevant ones |
| Conversation depth | Adaptive — no hardcoded exchange count | Well-specified inputs may need zero clarifying questions. Rough concepts may need 3-5 exchanges. The LLM judges readiness based on the policy's specificity |
| Readiness signal | LLM-set `ready_for_analysis` boolean + button always clickable as override | Replaces the old `filledCount >= 5` heuristic. The analyst can always proceed early |
| Open questions framing | "Questions for the analysis to consider" — not gaps to fill | These are directions the equity analysis should explore, not specification failures |
| Layout order | Sidebar (left) → Chat (centre) → Artifacts panel (right) | Left-to-right workflow: navigate → interact → read output. Chat always present, never hidden |
| Chat during analysis | Input disabled with explanatory placeholder, history visible | Analyst can reference the Socratic conversation while watching the analysis build |
| Policy summary display | Artifacts panel, rendered from `specMeta` state (not streamed) | The summary is extracted from the `<policy_spec>` JSON block after each response — it's state, not streaming content. No new event type needed |
| Width ratios | Stage-dependent: specifying 60/40, analysing 35/65, chatting 40/60 | Chat-dominant during active conversation, artifacts-dominant during analysis |

### New `<policy_spec>` payload shape

The `<policy_spec>` JSON block produced by the Socratic prompt changed from 6 structured `SpecValue` fields to:

```json
{
  "spec": {
    "policy_name": "Essential food basket price cap",
    "policy_summary": "This policy introduces price ceilings on a defined basket of essential food items...",
    "taxonomy_mapping": {
      "policy_lever": ["Price"],
      "in_scope_businesses": ["Retailers", "Convenience stores"],
      "geography": ["England"]
    },
    "open_questions": [
      "Enforcement mechanism not defined",
      "Basket composition not finalised"
    ],
    "ready_for_analysis": true
  }
}
```

`taxonomy_mapping` only includes dimensions that are relevant — omits inapplicable ones rather than marking them as "not applicable" or "empty". Values are free-form strings, not constrained to predefined options.

### Layout restructure

Reordered from `AnalysisView | Chat | Sidebar` to `Sidebar | Chat | AnalysisView`:

- **Sidebar (left, fixed `w-80`)**: Always present. During specifying: policy name, taxonomy pills, open questions count, proceed button. During analysis: compact spec view, stepper, sub-groups.
- **Chat (centre, always present)**: Never hidden. During analysis, input disabled with placeholder "Analysis in progress — follow-up questions available when complete". Conversation history remains scrollable.
- **Artifacts panel (right, conditional)**: Appears when policy summary exists or analysis sections exist. Shows policy summary as first section, then analysis sections.

Width ratios adapt by stage (chat/artifacts split, excluding fixed sidebar):
- Specifying (no summary): chat 100%
- Specifying (summary exists): chat 60%, artifacts 40%
- Analysis running: chat 35%, artifacts 65%
- Follow-up chatting: chat 40%, artifacts 60%

### How the analysis engine consumes the new format

`_extract_policy_spec_from_history()` in the orchestrator now formats the spec for analysis prompts as:

```
**Policy**: Essential food basket price cap

This policy introduces price ceilings on a defined basket of essential food items...

Relevant taxonomy dimensions: Policy lever: Price; In-scope businesses: Retailers, Convenience stores; Geography: England.

Open questions: Enforcement mechanism not defined; Basket composition not finalised.
```

The heuristic mapping in `analysis_scan.md` works from this — it matches concepts (pricing → financial modifiers, retailers → geography modifiers) regardless of whether the input is structured fields or natural language. An additional instruction was added: "If the policy summary does not explicitly address all taxonomy dimensions, consider all plausible interpretations and flag the ambiguity."

The subgroup and synthesis prompts consume `{{POLICY_SPECIFICATION}}` as opaque context — they are unaffected by the format change.

### Backend changes

**`models/chat.py`** — Replaced `SpecValue`, `PolicySpecification` with `PolicySummarySpec` (policy_name, policy_summary, taxonomy_mapping, open_questions, ready_for_analysis). `SpecMetadata` now wraps `PolicySummarySpec`. Removed `SpecSource` type.

**`orchestrator.py`** — Three functions rewritten:
- `_format_spec_state()`: formats policy summary + taxonomy mapping + open questions as text for `{{CURRENT_SPEC_STATE}}` injection (was: 6-field iteration)
- `_extract_policy_spec_from_history()`: formats summary + taxonomy annotation + open questions for analysis prompt injection (was: 6-field bullet list)
- `_extract_spec_from_response()`: unchanged mechanism (regex + Pydantic validation), validates against new model shape

**`prompts/socratic.md`** — Full rewrite:
- Free-form conversation driven by the policy, not a checklist
- Adaptive depth: zero questions for well-specified inputs, multiple exchanges for rough concepts
- Soft taxonomy guide as background mental checklist
- Explicit instruction not to probe enforcement, implementation, funding, or review details
- Open questions framed as directions for the analysis, not gaps
- Two worked examples (well-specified voucher policy, rough GLP-1 concept)
- New `<policy_spec>` JSON output format

**`prompts/analysis_scan.md`** — Added instruction about missing taxonomy dimensions after `{{POLICY_SPECIFICATION}}` injection point.

### Frontend changes

**`lib/types.ts`** — New `PolicySummarySpec` interface, `TAXONOMY_LABELS` constant (labels only, no options), `EMPTY_SUMMARY_SPEC`. Removed `SpecSource`, `SpecValue`, `PolicySpecification`, `TAXONOMY`, `EMPTY_SPEC`.

**`lib/spec-helpers.ts`** — `buildSpecMarkdown()` rewritten for summary format. Removed `filledCount()`, `remainingCount()`.

**`lib/session-cache.ts`** — `CACHE_VERSION` incremented to 2 (old sessions discarded).

**`components/chat/ChatContainer.tsx`** — Major changes:
- Layout reordered: sidebar (left) → chat (centre) → artifacts panel (right)
- Chat always rendered, never hidden. `ChatInput` receives `disabled` + `disabledPlaceholder` props
- Stage-based width ratios for chat/artifacts split
- `specMeta` state uses new `EMPTY_SUMMARY_SPEC` shape
- `policySummary` prop passed to `AnalysisView` (derived from `specMeta.spec`)
- Removed `TaxonomyHints` and `active_characteristic` tracking

**`components/chat/ChatInput.tsx`** — Added `disabled` and `disabledPlaceholder` props. Visual dimming when disabled.

**`components/analysis/AnalysisView.tsx`** — Added `policySummary` prop. Renders policy summary as first section with "For the analysis to consider" heading for open questions. Falls back to policy summary when no active section selected.

**`components/specification/SpecificationSidebar.tsx`** — Major rewrite:
- Now left-positioned (`border-r` instead of `border-l`)
- Specifying stage: policy name, `TaxonomyPills` component (compact pills per dimension), "N questions for the analysis" indicator, `ready_for_analysis`-based button prominence
- `CompactSpecView`: truncated summary text instead of taxonomy pills
- Removed: `filledCount`, `TAXONOMY` iteration, progress counter, `mostFilled` logic, `SpecificationRow` import

### Files deleted

- `frontend/src/components/specification/SpecificationRow.tsx` — no longer needed without fixed fields
- `frontend/src/components/chat/TaxonomyHints.tsx` — no longer needed without `active_characteristic` and predefined options

### What has NOT been implemented yet

- No deliberation layer beyond what's in the provocations section
- No multi-turn analysis refinement
- No export of analysis outputs (PDF, Word)
- No persistence of analyses across sessions
- No authentication or user management
- No tests

---

## 2026-05-22 — Categorical Analysis Patterns + Synthesis Checkpoint

### What was done

Two related features that improve the quality and analyst control of the analysis flow:

1. **Categorical pattern detection** — the scan now detects when multiple modifiers within the same category share the same relevance rating for the same structural reason, and proposes category-level sub-groups instead of picking one specific modifier. The per-sub-group analysis prompt and backend formatting handle these categorical sub-groups differently, drawing examples from multiple modifiers rather than deep-diving into one.

2. **Checkpoint before synthesis** — the analysis chain now pauses after all per-sub-group analyses complete, re-enables chat, and shows a "Run synthesis" button. The analyst reviews the sub-group analyses before triggering the equity synthesis as a separate request. The synthesis step has distinct visual treatment in both the sidebar (indigo icon, separator, "EQUITY ASSESSMENT" label) and reading panel (indigo banner header).

### Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Categorical pattern scope | Applied at the scan prompt level, not the orchestrator | The decision about whether modifiers share a mechanism is a reasoning task — only the LLM has the context to judge this. The orchestrator just formats whatever the scan produces. |
| Feature source for affected modifiers | LLM includes features in JSON output (Option A) | Avoids duplicating the 36-modifier personas framework as a Python constant. The scan LLM already has the full framework in context. |
| `awaitingSynthesis` state | Derived via `useMemo` from `analysisProgress` | Avoidable state — computed from whether all sub-group steps are complete but synthesis is still pending. No new cache field needed. |
| Synthesis trigger | Per-request `body` on `append()` call | The `useChat` hook's `body` is evaluated at render time, so a ref-based approach wouldn't work. The Vercel AI SDK's `append(message, { body })` merges per-request body fields. |
| Synthesis input data | Frontend sends accumulated `analysisSections` content | Avoids server-side session state or fragile history reconstruction. The ~50-60KB payload is fine for a POST body. |
| Checkpoint message destination | `("text", ...)` yield, not `("analysis_content", ...)` | The chain's inner loop re-tags sub-group output for the reading panel, but the checkpoint summary must flow to the chat as a `0:` text line. |
| Additional sub-groups at checkpoint | Deferred | The analyst can currently only proceed to synthesis or start a new session. Adding sub-groups at the checkpoint is a future enhancement. |

### Categorical pattern — how it works

**Scan prompt** (`analysis_scan.md`): New "Categorical pattern detection" section between Part 1 (modifier scan) and Part 2 (sub-group composition). Instructs the LLM to:
- Check every category for modifiers sharing the same rating for the same structural reason
- Apply the decision rule: same mechanism → categorical sub-group, different mechanism → separate specific sub-groups
- Produce a `category_pattern` object in the JSON with `affected_modifiers` (each with `name` and `features`) and `shared_reasoning`

**Per-sub-group prompt** (`analysis_subgroup.md`): New "Categorical pattern guidance" section. When the sub-group description includes a categorical pattern, the LLM examines the shared mechanism, draws examples from multiple modifiers, notes degree differences, and frames findings at the category level.

**Backend** (`orchestrator.py`): `_format_subgroup_modifiers()` detects the `categorical` flag and `category_pattern` on the sub-group dict. For categorical sub-groups, outputs a structured block listing all affected modifiers with their features and the shared mechanism, with an instruction to analyse the shared pattern. Non-categorical modifiers in the same sub-group are listed separately below.

**Frontend** (`types.ts`): `SubGroup` interface extended with optional `categorical?: boolean` and `category_pattern?: CategoryPattern`. `CategoryPattern` contains `category`, `affected_modifiers: AffectedModifier[]` (each with `name` and `features`), and `shared_reasoning`.

**Frontend** (`SpecificationSidebar.tsx`): `SubGroupCard` shows an indigo "Category-level pattern" badge and lists affected modifier names when `categorical` is true.

### Synthesis checkpoint — how it works

**Backend** (`orchestrator.py`): `stream_analysis_chain()` no longer calls `_stream_synthesis()`. After all sub-group analyses:
- Emits `("data", {"type": "analysis_checkpoint", "subgroup_count": N})`
- Emits `("data", {"type": "stage_transition", "stage": "chatting"})` — re-enables chat
- Yields `("text", ...)` checkpoint summary to the chat (not the reading panel)

New `stream_synthesis_only()` function handles synthesis as a standalone call, receiving analysis texts from the frontend.

`stream_response()` routes `run_synthesis=True` requests to `stream_synthesis_only()` before checking other stage-based routing.

**Backend** (`models/chat.py`): `ChatRequest` extended with `run_synthesis: bool = False` and `analysis_texts: list[dict[str, str]] | None = None`.

**Frontend** (`ChatContainer.tsx`):
- `awaitingSynthesis` computed via `useMemo` from `analysisProgress` steps
- `handleRunSynthesis` collects all analysis section texts (excluding scan and policy summary), sends them via `append(message, { body: { run_synthesis: true, analysis_texts: texts } })`
- `analysis_checkpoint` event sets a ref flag so the subsequent `stage_transition` to chatting doesn't insert the "analysis complete" message (which is only for the final synthesis completion)
- `isComplete` in the progress reducer now requires the synthesis step to be complete, not just all sub-group steps

**Frontend** (`SpecificationSidebar.tsx`):
- Sub-group analysis steps and synthesis step rendered separately
- Horizontal separator (`border-t`) between the last sub-group step and the synthesis section
- "EQUITY ASSESSMENT" small-caps label above the synthesis step
- "Run synthesis" button (indigo) shown when `awaitingSynthesis` is true
- Synthesis step uses `FileText` icon in indigo circle instead of the standard green checkmark

**Frontend** (`AnalysisView.tsx`): Synthesis section gets a distinct header — indigo background with "Equity Assessment and Provocations" heading and a descriptive subtitle.

### Files modified

**Backend:**
- `src/food_policy_impact_tool/llm/prompts/analysis_scan.md` — categorical pattern detection section + enriched JSON schema with `categorical` and `category_pattern` fields
- `src/food_policy_impact_tool/llm/prompts/analysis_subgroup.md` — categorical pattern guidance section
- `src/food_policy_impact_tool/llm/orchestrator.py` — `_format_subgroup_modifiers()` categorical handling, `stream_analysis_chain()` checkpoint split, new `stream_synthesis_only()`, `stream_response()` synthesis routing
- `src/food_policy_impact_tool/models/chat.py` — `run_synthesis` and `analysis_texts` fields on `ChatRequest`
- `src/food_policy_impact_tool/api/routes/chat.py` — passes new fields through to `stream_response()`

**Frontend:**
- `frontend/src/lib/types.ts` — `AffectedModifier`, `CategoryPattern`, `AnalysisCheckpointEvent` interfaces; `SubGroup` extended with optional categorical fields
- `frontend/src/components/chat/ChatContainer.tsx` — `awaitingSynthesis` derived state, `handleRunSynthesis` callback, checkpoint event handling, `isComplete` logic updated
- `frontend/src/components/specification/SpecificationSidebar.tsx` — `SubGroupCard` categorical badge, synthesis visual distinction (separator, label, button, icon), new props
- `frontend/src/components/analysis/AnalysisView.tsx` — distinct indigo header for synthesis section

### What has NOT been implemented yet

- No additional sub-groups at the synthesis checkpoint (deferred)
- No deliberation layer beyond what's in the provocations section
- No multi-turn analysis refinement
- No export of analysis outputs (PDF, Word)
- No persistence of analyses across sessions
- No authentication or user management
- No tests

---

## 2026-05-22 — Trust and Visibility Improvements

### What was done

Three features to increase the analyst's ability to understand, inspect, and trust the tool's outputs:

1. **Interactive grounding badges with detail popovers** — every grounding tag (`[Evidence]`, `[Analogical]`, `[Reasoning]`, `[Gap]`) now carries a structured `<badge_detail>` block with supporting context. Badges with detail are clickable, revealing the context in a Radix popover.

2. **Evidence search transparency** — the sidebar now tracks individual evidence searches per sub-group step (query, result count, source names), viewable in an expandable list. Replaces the previous opaque "N evidence searches done" counter.

3. **Chatbot progress messages** — the chat area now receives brief progress updates during the analysis chain ("Starting analysis for **[name]**…", "Completed **[name]**.", etc.) so the analyst has a conversational signal of what's happening.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Badge detail format | `<badge_detail>` XML-like block immediately after each grounding tag | Parsed by the same regex pipeline as the tags themselves. Invisible in rendered output — stripped during badge processing and stored as data attributes. Compatible with streaming (incomplete blocks stripped during active streams). |
| Popover library | `@radix-ui/react-popover` | Accessible, handles positioning/collision automatically, small footprint. First external UI primitive in the project. |
| Popover interaction model | Click to open, click elsewhere to close | Hover would fire too easily on dense analysis text. Click is intentional and works on touch. |
| Per-step search tracking | `searches` array on `AnalysisStep` (replaces global `evidenceSearchCount`) | Enables per-sub-group search inspection. Source names are deduplicated server-side before emission. |
| Chat progress messages | `("text", ...)` yields within `stream_analysis_chain()` | No frontend changes needed — text parts already flow to the chat message. Messages are brief and use markdown bold for sub-group names. |
| Session cache | Version bumped to 3 | `evidenceSearchCount` removed from cache interface; search records now live within `analysisProgress.steps[].searches`. |

### Badge detail requirements per type

The prompt (`analysis_subgroup.md`) now specifies exactly what each `<badge_detail>` must contain:

- **Evidence**: the relevant excerpt or passage from the source that supports the claim
- **Analogical**: both the relevant excerpt AND why the evidence is analogical rather than direct (what's similar, what differs)
- **Reasoning**: the specific material constraints being reasoned from and the logical steps connecting them to the claim
- **Gap**: what search queries were attempted that failed to find relevant evidence, and what kind of evidence would fill the gap

### Frontend rendering pipeline change

```
LLM output with [Tag]<badge_detail>...</badge_detail>
  → stripStructuredBlocks (MessageBubble) / stripSubgroupBlocks (AnalysisSectionPanel)
  → renderGroundingBadges():
      Pass 1: BADGE_DETAIL_REGEX matches tag+detail pairs → <span data-badge-detail="..." data-badge-type="...">
      Pass 2: remaining unmatched tags (no detail) → plain <span class="badge-*">
  → react-markdown + rehype-raw
  → BadgePopoverManager: click listener on [data-badge-detail] spans → Radix Popover portal
```

### Files created

**Frontend (1 new component):**
- `frontend/src/components/analysis/BadgePopover.tsx` — `BadgePopoverManager` component using Radix popover, attaches click handlers to `[data-badge-detail]` spans via event delegation

**Dependencies:**
- `@radix-ui/react-popover` added to `frontend/package.json`

### Files modified

**Backend:**
- `src/food_policy_impact_tool/llm/orchestrator.py` — chat progress text yields in `stream_analysis_chain()` (sub-group start, complete, error); `evidence_search_complete` event enriched with deduplicated `source_names` list
- `src/food_policy_impact_tool/llm/prompts/analysis_subgroup.md` — evidence grounding section rewritten with `<badge_detail>` requirement, explicit per-type content specifications, and worked examples for all four badge types

**Frontend:**
- `frontend/src/lib/grounding-badges.ts` — two-pass rendering: first pass matches `[Tag]<badge_detail>...</badge_detail>` pairs into spans with `data-badge-detail` and `data-badge-type` attributes; second pass handles plain tags without detail (backwards-compatible)
- `frontend/src/lib/types.ts` — added `EvidenceSearchRecord` interface; extended `AnalysisStep` with optional `searches` array
- `frontend/src/lib/session-cache.ts` — removed `evidenceSearchCount` from `CachedSession`; bumped `CACHE_VERSION` to 3
- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — added `proseRef` for `BadgePopoverManager`, extended streaming stripping to handle incomplete `<badge_detail>` blocks
- `frontend/src/components/chat/ChatContainer.tsx` — replaced `evidenceSearchCount` state with per-step search record tracking via `analysisProgress`; `evidence_search_complete` handler now creates `EvidenceSearchRecord` and appends to active step
- `frontend/src/components/specification/SpecificationSidebar.tsx` — removed `evidenceSearchCount` prop; added `SearchList` component (expandable per-step search history with query, result count, source names); sub-group step entries show search records when active (below live search indicator) and when complete (expandable list + subtitle)
- `frontend/src/app/globals.css` — added `[data-badge-detail]` cursor/hover styles, popover entrance animation

### What has NOT been implemented yet

- No evidence base browser (deferred — planned as slide-over drawer)
- No badge-to-browser source linking (depends on evidence browser)
- No additional sub-groups at the synthesis checkpoint (deferred)
- No deliberation layer beyond what's in the provocations section
- No multi-turn analysis refinement
- No export of analysis outputs (PDF, Word)
- No persistence of analyses across sessions
- No authentication or user management
- No tests

---

## 2026-05-22 — Hallucination Protection for Badge Details

### What was done

Two layers of protection against hallucination in badge detail popovers, with zero additional LLM calls or retrieval queries:

**Layer 1: Reduce hallucination at the source**

1. **Prompt hardening** — added "Evidence integrity rules" section to `analysis_subgroup.md` requiring verbatim quoting for Evidence badges, specific chunk references for Analogical, constraint-only reasoning for Reasoning, and executed-queries-only for Gap badges. General knowledge claims must use `[Reasoning]`, never `[Evidence]` or `[Analogical]`.

2. **Quote anchoring in tool responses** — updated `_format_tool_evidence()` to use `[Chunk N]` headers with source name, year, and page number. No-results messages now echo the exact query string so the LLM can reference it accurately in `[Gap]` details.

**Layer 2: Make hallucination detectable**

3. **Raw evidence accumulation** — `_stream_subgroup_with_tools()` now stores raw chunk data (source name, year, text, page number) in a per-sub-group accumulator alongside its existing processing.

4. **Evidence data event** — after each sub-group analysis completes, a `subgroup_evidence` data event is emitted containing all raw search records for that sub-group.

5. **Frontend evidence storage** — new `RawEvidenceChunk`, `RawEvidenceSearch`, and `SubgroupEvidenceEvent` types. `ChatContainer` stores evidence keyed by section ID in a `Map<string, RawEvidenceSearch[]>`, persisted via session cache (version bumped to 4).

6. **Enhanced badge popovers** — for Evidence and Analogical badges, the popover now shows a second section below the LLM's explanation with the actual retrieved chunk text, source name/year, and page number. Source matching uses substring/keyword overlap between the badge label and stored chunk source names. When no match is found, a warning is displayed: "This source was not found in the evidence retrieved for this analysis". Reasoning and Gap badges show only the LLM explanation (no raw evidence section).

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Evidence accumulation | Mutable list passed to `_stream_subgroup_with_tools()` via `raw_searches` parameter | Avoids changing the generator's yield protocol — caller reads the list after iteration. Data is already in memory, just kept rather than discarded. |
| Evidence emission | Single `subgroup_evidence` data event per sub-group, after text streaming completes | Batches all searches into one event rather than emitting per-search. Reduces frontend event processing. |
| Source matching | Bidirectional substring + keyword overlap (2+ matching words of 3+ chars) | Simple and sufficient — badge labels like "Sandwell study" match against full source names like "Understanding interactions with the food environment". No need for fuzzy matching. |
| Popover chunk display | Max 2 chunks shown, text truncated at 400 chars | Keeps popovers scannable. Analyst can cross-reference with sidebar search records for full context. |
| Hallucination warning | Shown only for Evidence/Analogical badges when source not found in raw evidence | Most direct signal — the LLM cited something it didn't receive from the tool. |
| Cache version | Bumped to 4 | New `subgroupEvidence` field in `CachedSession`. |

### Files modified

**Backend:**
- `src/food_policy_impact_tool/llm/prompts/analysis_subgroup.md` — added "Evidence integrity rules" section after the badge detail requirements
- `src/food_policy_impact_tool/llm/orchestrator.py` — `_format_tool_evidence()` updated with `[Chunk N]` headers, page numbers, and query echo on no-results; `_stream_subgroup_with_tools()` accepts `raw_searches` accumulator; `stream_analysis_chain()` passes accumulator and emits `subgroup_evidence` data event

**Frontend:**
- `frontend/src/lib/types.ts` — added `RawEvidenceChunk`, `RawEvidenceSearch`, `SubgroupEvidenceEvent` interfaces; added `SubgroupEvidenceEvent` to `AnalysisDataEvent` union
- `frontend/src/lib/session-cache.ts` — added `subgroupEvidence` field to `CachedSession`; added `hydrateSubgroupEvidence()` helper; updated `saveSession`/`debouncedSave` types; bumped `CACHE_VERSION` to 4
- `frontend/src/components/chat/ChatContainer.tsx` — added `subgroupEvidence` state (Map); handles `subgroup_evidence` data event; includes in session save and new-session reset; passes to `AnalysisView`
- `frontend/src/components/analysis/AnalysisView.tsx` — accepts and passes `subgroupEvidence` to `AnalysisSectionPanel`
- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — accepts and passes `rawEvidence` to `BadgePopoverManager`
- `frontend/src/components/analysis/BadgePopover.tsx` — added `RawEvidenceSection` component; `findMatchingChunks()` source matcher; popover now shows raw evidence for Evidence/Analogical badges with hallucination warning when source not found

---

## 2026-05-22 — Analysis UI Stability and Popover Refinements

### What was done

Follow-up fixes after the trust/visibility and hallucination-protection work:

1. **Badge streaming freeze** — during sub-group analysis, text after the first `<badge_detail>` block stopped rendering until the section completed. Root cause: `stripIncompleteStructuredBlocks()` used a regex that stripped from the first `<badge_detail>` to end-of-string, removing closed blocks as well as incomplete ones. Fixed to only strip an *unclosed* trailing `<badge_detail>`.

2. **Empty "Structured output" heading in scan artefact** — the relevance scan prompt asks the LLM to emit Part 3 ("Structured output") before the `<proposed_sub_groups>` block. That section is parsed for the sidebar and should not appear in the artefact panel. Added `stripProposedSubGroupsContent()` in `grounding-badges.ts` to remove both the XML block and the Part 3 / structured-output tail; applied in `AnalysisSectionPanel.tsx` for scan content.

3. **Maximum update depth errors** — React infinite re-render loop after the population relevance assessment completed (and during dense sidebar population). Multiple contributing causes addressed:
   - Removed `setActiveSection` / `setStreamingSection` calls from inside the `setAnalysisSections` updater in `flushPendingDeltas` (side effects in updaters trigger re-render loops).
   - Added early return in the data-stream `useEffect` when `startIdx >= data.length` (no new events to process).
   - Restricted `parseSpecFromData` to the `specifying` stage only.
   - Added `setActiveSectionIfChanged` / `setStreamingSectionIfChanged` helpers that compare against refs before calling `setState`.
   - Guarded `setSpecMeta`, `setProposedSubGroups`, `setConfirmedSubGroups`, and `setAnalysisProgress` with `jsonEqual` so identical payloads do not trigger updates.
   - Memoised `chatBody` for `useChat` to avoid unnecessary hook churn.

4. **Badge popover UX refinements** — clearer section labels ("Model's explanation" / "Evidence from tool retrieval"); stricter source-name matching (50% of distinctive words, minimum 3); quote-based fallback when citation name does not match but excerpt text overlaps retrieved chunks; stable `virtualAnchorRef` for Radix positioning; popover content-change effect guarded to avoid update loops; popover manager not mounted during active streaming.

5. **Sub-group card heading deduplication** — removed redundant `subGroup.name` heading from `SubGroupCard` in the sidebar. Modifier badges and the "Category-level pattern" pill are the primary identifier; full name retained in `aria-label` and stepper labels.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Structured output stripping | Regex tail match on Part 3 heading variants + existing `<proposed_sub_groups>` regex | Handles both complete and in-progress scan streams without a separate parser. |
| State update guards | Ref-based equality checks + `jsonEqual` for object state | Prevents cascading re-renders when stream events re-emit identical payloads. |
| Delta batching side effects | Move section activation out of `setAnalysisSections` updater | React updaters must be pure; side-effect setters inside them caused the depth loop. |
| Source matching threshold | 50% word overlap, min 3 distinctive words | Previous 2-word threshold produced false positives (wrong study shown as "retrieved evidence"). |
| Sub-group card identity | Badges only, name in `aria-label` | Full generated name duplicated modifier pill text and cluttered the dense sidebar. |

### Files modified

**Frontend:**
- `frontend/src/lib/grounding-badges.ts` — `stripProposedSubGroupsContent()`, fixed `stripIncompleteStructuredBlocks()` for unclosed-only badge_detail stripping; `STRUCTURED_OUTPUT_TAIL_REGEX` removes Part 3 heading tail
- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — applies `stripProposedSubGroupsContent()` to scan artefact content; scroll debounced via `requestAnimationFrame`
- `frontend/src/components/chat/ChatContainer.tsx` — update-depth fixes (`jsonEqual`, guarded setters, memoised `chatBody`, pure delta flush, early data-effect return)
- `frontend/src/components/analysis/BadgePopover.tsx` — label renames, stricter `sourcesMatch()`, quote fallback matching, unmatched-source source list, stable anchor ref, streaming guard
- `frontend/src/components/specification/SpecificationSidebar.tsx` — removed duplicate `subGroup.name` heading from `SubGroupCard`

---

## 2026-05-22 — Sidebar Evidence Search Display Refinement

### What was done

Iterated on the evidence search transparency UI in the sidebar after user testing:

1. **Removed duplicate search count** — completed sub-group steps showed "N evidence searches" twice: once as a `StepEntry` subtitle and again on the expandable `SearchList` toggle. Subtitle removed; the collapsible header is the sole count indicator.

2. **Simplified search cards** — each card in the expanded list now shows only the search query (with search icon). Source title lists were removed — text was too small to be useful and duplicated information available in badge popovers.

3. **Removed result counts** — cards initially showed "N results" plus source names, then query + count only. Counts dropped entirely because sub-group retrieval uses a hard `top_k=8` cap (`orchestrator.py`), so successful searches almost always show 8 regardless of query quality. Displaying the count implied meaningful variation where there was none. "No results found" is still shown when `numResults === 0` — the only case where the count conveys useful information.

### Investigation: "UK" in search queries

Observed that the LLM frequently prefixes queries with "UK" (e.g. "UK urban low-income families…"). Reviewed retrieval pipeline:

- No geographic filter exists — hybrid search runs over the entire curated corpus.
- The evidence base is already UK-only by curation (~15–20 primarily UK qualitative studies).
- The sub-group prompt describes the tool as searching research "in the UK", which likely primes the model to add geographic scope tokens.
- Tool definition examples and search-strategy guidance already omit "UK".

**Conclusion:** "UK" is not technically necessary and may slightly dilute query specificity (redundant token in a UK-only index). Not implemented: explicit prompt guidance to omit "UK"/"United Kingdom" from queries. Deferred unless retrieval quality issues are observed.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search card content | Query only (+ "No results found" for zero hits) | Maximises scannability; avoids misleading result counts capped at 8. |
| Duplicate count | Remove `StepEntry` subtitle, keep `SearchList` toggle label | Single source of truth for search count per step. |
| Backend `numResults` | Retained in `EvidenceSearchRecord` and events | Still used internally for zero-result detection; not surfaced in sidebar UI. |
| UK query guidance | Not added to prompt (deferred) | Low-risk redundancy rather than proven quality degradation; can add if needed. |

### Files modified

**Frontend:**
- `frontend/src/components/specification/SpecificationSidebar.tsx` — `SearchList` simplified to query-only cards; removed completed-step subtitle duplicating search count

### What has NOT been implemented yet

- No prompt guidance to omit "UK" from evidence search queries (deferred)
- No configurable or surfaced `top_k` limit in the UI
- No evidence base browser (deferred — planned as slide-over drawer)
- No badge-to-browser source linking (depends on evidence browser)
- No additional sub-groups at the synthesis checkpoint (deferred)
- No deliberation layer beyond what's in the provocations section
- No multi-turn analysis refinement
- No export of analysis outputs (PDF, Word)
- No persistence of analyses across sessions
- No authentication or user management
- No tests

---

## 2026-05-22 — Synthesis split, synthesis badges, formatting polish, artifact subtitles

### Summary

Four connected improvements to analysis artifacts: (1) split the single synthesis output into three streamed sections (`equity_assessment`, `risks_provocations`, `design_improvements`) via `<!-- SECTION: ... -->` markers in one LLM call; (2) synthesis-specific grounding badges `[Sub-group]`, `[Cross-cutting]`, `[Reasoning]`, `[Gap]` with popover navigation to sub-group analyses; (3) shared formatting rules across scan, sub-group, and synthesis prompts plus structured sub-group headings; (4) fixed and dynamic subtitles on every artifact in the reading panel, with nested SYNTHESIS sub-steps in the sidebar.

Zero additional LLM calls — section routing happens in `stream_synthesis_only` during streaming.

### Backend

| Change | Detail |
|--------|--------|
| `analysis_synthesis.md` | Three marked sections, synthesis badge instructions (exact sub-group names required), per-section structure guidance, formatting rules |
| `analysis_subgroup.md` | New heading scaffold (`### How this policy interacts…`, `#### Financial impact`, etc.) + formatting rules |
| `analysis_scan.md` | Formatting rules section |
| `orchestrator.py` | `_SynthesisSectionParser` strips markers and emits `analysis_content` per section; defaults to `equity_assessment` if markers omitted |

### Frontend

| Change | Detail |
|--------|--------|
| `analysis-sections.ts` | Synthesis IDs, labels, subtitles, `deriveSynthesisSubstepStatus`, `resolveSubgroupSectionId` (exact + fuzzy keyword fallback) |
| `ChatContainer.tsx` | Pre-init three synthesis sections on run; stream routing; `handleRunSynthesis` sends only `sg_*` texts; `synthesisComplete` + substep status for sidebar |
| `SpecificationSidebar.tsx` | "SYNTHESIS" header with three nested clickable sub-steps |
| `AnalysisView.tsx` | Unified subtitles; indigo header for all synthesis sections; empty-section fallback note when risks/design not generated separately |
| `grounding-badges.ts` | `[Sub-group]` (teal) and `[Cross-cutting]` (purple) badge rendering |
| `BadgePopover.tsx` | `sectionType` prop — synthesis badges show detail + navigation links (no raw evidence chunks) |
| `globals.css` | `.badge-crosscutting`, `.synthesis-substep` |
| `session-cache.ts` | Drop legacy `synthesis` section key on hydrate |

### Edge cases

- **Missing section markers:** All content lands in `equity_assessment`; empty `risks_provocations` / `design_improvements` show a muted note linking to Equity Assessment after synthesis completes.
- **Badge name mismatch:** Prompt requires exact sub-group names; `resolveSubgroupSectionId` fuzzy-matches as fallback.

### Files modified

**Backend:** `analysis_scan.md`, `analysis_subgroup.md`, `analysis_synthesis.md`, `orchestrator.py`

**Frontend:** `analysis-sections.ts` (new), `ChatContainer.tsx`, `SpecificationSidebar.tsx`, `AnalysisView.tsx`, `AnalysisSectionPanel.tsx`, `BadgePopover.tsx`, `grounding-badges.ts`, `globals.css`, `session-cache.ts`

---

## 2026-05-22 — Roll back sub-group formatting depth constraints

### Problem

Rigid heading scaffold and paragraph-length limits in `analysis_subgroup.md` reduced analytical depth in per-sub-group outputs, weakening synthesis meta-analysis. Bold rules were also over-applied (entire bullets bolded).

### Changes

| Prompt | Reverted / removed | Kept / updated |
|--------|-------------------|----------------|
| `analysis_subgroup.md` | Fixed `####` impact-dimension template; 2–4 sentence and 5-sentence paragraph caps | Original sections (Who is impacted, How they are impacted, Benefits and harms, Impact dimensions, Uncertainties); toned-down bold lead-in only; soft bullet guidance; explicit “depth over brevity” principle |
| `analysis_synthesis.md` | Paragraph length caps; aggressive bold-everything rules | Three-section split, markers, synthesis badges, per-section structure; toned-down bold; “one sentence” mechanism bullets relaxed to full detail |
| `analysis_scan.md` | — | Unchanged |

### Files modified

- `src/food_policy_impact_tool/llm/prompts/analysis_subgroup.md`
- `src/food_policy_impact_tool/llm/prompts/analysis_synthesis.md`

---

## 2026-05-22 — SG short labels for synthesis badges and popovers

### Problem

Full sub-group names in synthesis inline badges and popovers produced repetitive, hard-to-scan walls of text.

### Solution

- **Prompt/orchestrator:** Synthesis uses `SG1`, `SG2`, … (1-indexed) in inline badges; `<badge_detail>` leads with the finding; cross-cutting/gap details list `SG1, SG3` only. Orchestrator prepends a reference label list and headings `### SG{n}: {name}`.
- **Badges:** `[SG5]` or `[SG5: brief hint]` render as compact teal pills; legacy `[Sub-group: …]` still supported.
- **Popovers:** SG badge shows compact context line + finding + “View SG5 analysis →”; cross-cutting/gap show finding first with inline `SG1 · SG3` links (`title` = full name).

### Files modified

- `analysis_synthesis.md`, `orchestrator.py`
- `analysis-sections.ts`, `grounding-badges.ts`, `BadgePopover.tsx`

### Fix: synthesis section split when HTML markers omitted (2026-05-22)

The model often outputs plain `Risks & Provocations` / `Design Improvements` lines (no `<!-- SECTION: -->`), so all content stayed in `equity_assessment`. `_SynthesisSectionParser` now splits on line boundaries using HTML markers **or** recognised section headings (with or without `##`). Logs a warning if fewer than three sections were seen. Prompt updated to require `##` headings when markers are omitted.

---

## 2026-05-22 — Chat progress narration, sidebar improvements, and summary cards

### What was done

Three layers of progressive detail disclosure added to the analysis workflow, plus sidebar UX improvements and bug fixes.

### 1. Detailed chat progress narration

**Per sub-group (4 messages each):**
- Start: "Analysing impacts for **[name]**..."
- Evidence gathered: "Found relevant evidence across N sources." (on first analysis token after tool calls)
- Writing: "Writing detailed impact analysis for this sub-group..."
- Complete: "✓ Completed analysis for **[name]**. Moving to **[next]**..." (or "All sub-group analyses complete." for the last)

**Synthesis (5 messages):**
- "Beginning equity synthesis across N sub-group analyses..."
- Section transitions: "Synthesising equity assessment...", "Identifying evidence gaps...", "Generating design improvement recommendations..."
- "✓ Synthesis complete. Three artifacts generated: Equity Assessment, Risks & Provocations, and Design Improvements."

**Implementation:** `_stream_subgroup_with_tools()` yields `("progress", ...)` tuples for evidence-gathered and writing-started phases; `stream_analysis_chain()` forwards these as `("text", ...)` while routing LLM tokens to the reading panel only. `_SynthesisSectionParser` tracks section transitions via `drain_section_transitions()` and `_SYNTHESIS_SECTION_PROGRESS` messages are yielded at each transition.

### 2. Sidebar progress improvements

**Active sub-group phase tracking:**
- `activeStepPhase` state (`"searching" | "writing" | null`) set by `evidence_search` and `analysis_content` events
- Subtitle shows "Searching evidence base... (N)" during searches, "Generating analysis from N sources..." during writing

**SG labels:** Each step prefixed with `SG1:`, `SG2:`, etc. via `buildSgLabels()` — consistent with synthesis badge labels.

**Step summaries:** Prompt instructs `<step_summary>` (≤20 words) at end of each sub-group analysis. Orchestrator extracts and emits `step_summary` data event. Displayed below evidence search count in the sidebar (full text, no truncation).

**Evidence search list auto-expand/collapse:** `SearchList` component accepts `activeQuery` prop. Expands when a search starts (shows in-flight query highlighted at top), collapses when search completes. Active query shown with accent-coloured border.

**Sub-group section auto-collapse:** `SubGroupSection` syncs with `defaultCollapsed` via `useEffect`, so confirmed sub-groups collapse when analysis begins.

**Active synthesis substeps:** Status lines on active synthesis steps ("Writing equity assessment...", etc.) driven by `streamingSection` state.

### 3. Summary cards (progressive detail disclosure layer 2)

Zero extra LLM calls — `<summary_card>` JSON block appended at end of each artifact's generation.

**Per sub-group:** `impact_direction`, `key_findings` (3+), `evidence_confidence` counts (evidence_backed, analogical, reasoning, gaps).
**Scan:** `summary`, `key_findings`, `high_count`/`moderate_count`/`low_count`.
**Equity assessment:** `summary`, `key_findings`, `inequality_direction`.
**Risks & provocations:** `summary`, `key_findings`, `gap_count`, `assumption_risks`, `equity_tensions`.
**Design improvements:** `summary`, `key_findings`, `recommendation_count`.

**Backend:** `_extract_summary_card()` / `_strip_summary_card()` with regex `<summary_card[^>]*>…</summary_card>` (handles model adding type attributes). Emitted as `summary_card` data event per artifact. Synthesis cards extracted via `_SynthesisSectionParser.finalize_section_card()` on section transitions and flush.

**Frontend:** `ArtifactSummaryCard.tsx` renders at top of each artifact — compact card with bold headline, key findings list, context-specific metadata (evidence confidence for sub-groups, modifier counts for scan, etc.). `summaryCards` Map persisted in session cache (v6).

### 4. Bug fixes

**Synthesis formatting broken:** `_strip_summary_card()` called per-line in `_SynthesisSectionParser._emit_line()` was stripping trailing `\n` via `.rstrip()`, causing all synthesis content to concatenate into one unformatted block. Fixed by removing per-line summary card stripping — extraction correctly handled by `finalize_section_card()` on accumulated section content.

**`###` sub-headings held by partial heading detector:** `_line_might_be_partial_heading()` treated any line starting with `##` as a potential section title, including `###` sub-headings. Fixed to only match H2-level fragments and specific section title prefixes.

**`<summary_card type="...">` not stripped:** Model emits `<summary_card type="equity_assessment">` but regex only matched plain `<summary_card>`. Updated to `<summary_card[^>]*>` on both backend and frontend.

**Section markers leaking to reading panel:** `<!-- SECTION: ... -->` comments sometimes appeared in rendered content. `stripArtifactTailBlocks()` now also removes section markers.

**Markdown headings after inline badges:** `### heading` following a `</span>` on the same line wasn't recognised by markdown. Added `normalizeMarkdownBlockBreaks()` to ensure headings get block-level line breaks.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat progress via `("progress", ...)` tuple | Separate yield type in `_stream_subgroup_with_tools()`, forwarded as `("text", ...)` by caller | Keeps LLM analysis tokens (`("text", ...)`) routed to reading panel only; progress messages flow to chat. |
| Step summaries via prompt (Option A) | `<step_summary>` tag in `analysis_subgroup.md` | More reliable than frontend text extraction; summary can be tailored for sidebar context. |
| Summary card extraction location | Per-artifact on completion (sub-groups, scan); per-section via `finalize_section_card()` (synthesis) | Multi-line JSON blocks can't be matched per-streaming-delta; must operate on accumulated content. |
| Evidence search list auto-behaviour | Expand on `activeQuery` set, collapse on clear | Driven by existing `evidence_search` / `evidence_search_complete` events — no new data protocol. |
| No per-line summary card stripping in synthesis parser | Removed from `_emit_line()` entirely | `.rstrip()` was destroying `\n` on every line; extraction handled correctly at section level. |
| Session cache version | Bumped to 6 | Added `stepSummaries` and `summaryCards` maps. |

### Files created

- `frontend/src/components/analysis/ArtifactSummaryCard.tsx` — renders summary card at top of each artifact

### Files modified

**Backend:**
- `src/food_policy_impact_tool/llm/orchestrator.py` — chat progress yields, step summary / summary card extraction and emission, synthesis section parser enhancements
- `src/food_policy_impact_tool/llm/prompts/analysis_subgroup.md` — `<step_summary>` and `<summary_card>` output instructions
- `src/food_policy_impact_tool/llm/prompts/analysis_scan.md` — `<summary_card>` output instructions
- `src/food_policy_impact_tool/llm/prompts/analysis_synthesis.md` — per-section `<summary_card>` output instructions

**Frontend:**
- `frontend/src/lib/types.ts` — `SummaryCard`, `StepSummaryEvent`, `SummaryCardEvent` interfaces
- `frontend/src/lib/analysis-sections.ts` — `stripArtifactTailBlocks()`, `normalizeMarkdownBlockBreaks()`, `buildSgLabels()`, `countUniqueEvidenceSources()`, `formatSubgroupSearchingStatus()`, `formatSubgroupWritingStatus()`, `SYNTHESIS_ACTIVE_STATUS`, `ActiveStepPhase`
- `frontend/src/lib/grounding-badges.ts` — streaming stripping for `<summary_card>` and `<step_summary>` partials
- `frontend/src/lib/session-cache.ts` — v6 with `stepSummaries` and `summaryCards`; hydration helpers
- `frontend/src/components/chat/ChatContainer.tsx` — `activeStepPhase`, `stepSummaries`, `summaryCards`, `sgLabels` state; event handlers; props passed to sidebar and analysis view
- `frontend/src/components/specification/SpecificationSidebar.tsx` — SG labels, phase subtitles, auto-expand/collapse SearchList, SubGroupSection sync, synthesis active status
- `frontend/src/components/analysis/AnalysisView.tsx` — passes `summaryCards` and `sectionId` to panel
- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — renders `ArtifactSummaryCard`, strips tail blocks and normalises block breaks

---

## 2026-05-22 — QoL: Evidence search dropdowns, streaming badge popovers, and UI refinements

### What was done

Six quality-of-life improvements across the analysis workflow:

1. **Evidence search dropdowns follow active subgroup** — `SearchList` in the sidebar now auto-expands when its subgroup step becomes active and auto-collapses when a different subgroup starts. Previously, the list only expanded while an evidence search was in-flight and collapsed as soon as the search completed (even while the same subgroup was still being analysed). Manual toggles are respected via a `userOverride` ref that resets when the active subgroup changes.

2. **Badge popovers clickable during streaming** — `BadgePopoverManager` is now mounted during streaming (previously gated behind `!isStreaming`). Completed badges with `data-badge-detail` attributes are interactive mid-stream. To handle the unstable DOM (react-markdown re-renders the tree on each chunk), the badge's bounding rect is snapshotted at click time into a frozen virtual anchor object. The content-change effect that normally closes popovers is skipped during streaming, so the popover stays open at its original position until the user clicks outside.

3. **"Structured output" header stripped from scan artefact** — Widened `STRUCTURED_OUTPUT_TAIL_REGEX` to catch standalone `## Structured Output` headings and colon-separated variants (`Part 3: Structured Output`), not just the narrow em-dash pattern and "requirement" suffix that the previous regex required.

4. **Removed jarring artefact auto-switch** — All four auto-switch sites (scan step, scan content flush, subgroup step, synthesis step, synthesis content streaming) now only auto-select the artefact view when `activeSectionRef.current === null` — i.e. no section has been viewed yet. Once the user navigates to any section, the view stays put regardless of which analysis step starts next.

5. **Fixed chat scroll during analysis streaming** — Replaced the `userScrolledUp` ref approach (which had a race condition between the scroll event handler and the streaming effect) with a direct `isNearBottom()` check within the effect. If the user is at the bottom, auto-scroll continues; if they've scrolled up, it stays put. Removed the forced scroll reset on new messages. Changed scroll behaviour from `"smooth"` to `"auto"` to avoid animation conflicts with rapid updates.

6. **Removed "Typically takes 1–2 minutes" time estimate** — Deleted the time estimate banner from the sidebar and removed the unused `Clock` import.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SearchList expand driver | `isStepActive` prop + `userOverride` ref | Decouples expand/collapse from the transient `activeQuery` signal. Auto-behaviour follows step lifecycle; manual toggles are preserved until the active step changes. |
| Badge anchor during streaming | Snapshot `getBoundingClientRect()` at click time | The DOM element gets replaced on the next react-markdown re-render. A frozen rect keeps the popover positioned correctly without needing to re-find the element. |
| Content-change close skip | `isStreamingRef.current` guard in the effect | Avoids stale closure issues (ref updated on every render). When streaming ends, the existing non-streaming behaviour resumes automatically. |
| Auto-switch guard | `activeSectionRef.current === null` only | The previous `current === lastStreamed` condition auto-followed between sections, which was disorienting. Null-only guard means auto-switch only fires for the very first artefact in a session. |
| Chat scroll approach | Direct `isNearBottom()` in effect, no event listener | Eliminates the race condition where the scroll event handler and the streaming effect competed. Synchronous DOM read within the effect is always accurate. |

### Files modified

**Frontend:**
- `frontend/src/lib/grounding-badges.ts` — widened `STRUCTURED_OUTPUT_TAIL_REGEX` to match standalone and colon-variant "Structured Output" headings
- `frontend/src/components/chat/ChatContainer.tsx` — replaced all auto-switch conditions with `activeSectionRef.current === null` guard (scan, subgroup, synthesis step activation and content routing)
- `frontend/src/components/chat/MessageList.tsx` — replaced `userScrolledUp` ref and scroll event listener with direct `isNearBottom()` check; changed scroll behaviour to `"auto"`
- `frontend/src/components/specification/SpecificationSidebar.tsx` — `SearchList` now accepts `isStepActive` prop with `userOverride` ref for manual toggle tracking; removed `Clock` import and time estimate banner
- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — removed `!isStreaming` guard on `BadgePopoverManager`; passes `isStreaming` prop through
- `frontend/src/components/analysis/BadgePopover.tsx` — accepts `isStreaming` prop; snapshots bounding rect for streaming anchors; skips content-change auto-close during streaming

---

## 2026-05-22 — Latency UX improvements: skeletons, per-task models, reasoning effort, and progress

### What was done

Six complementary changes to reduce perceived and actual latency across the analysis pipeline, plus chat narration improvements and a prompt fix.

### 1. Artefact skeleton scaffolds

When an artefact section starts streaming but no content has arrived yet (during the LLM's time-to-first-token), the panel now renders a **skeleton scaffold** with real section headings and shimmer placeholder content instead of a blank panel. Five skeleton variants match the prescribed output structures:

- **Scan**: 6 category headings with table header rows and shimmer cells (Geography, Household and Financial Context, etc.)
- **Sub-group**: 5 sections (Who is impacted, How they are impacted, Benefits and harms, Impact dimensions, Uncertainties) with shimmer bullet placeholders
- **Equity Assessment**: 5 sections (Who benefits most, Who benefits least, Inequality direction, Unintended distributional effects, Implementation burden)
- **Risks & Provocations**: 5 sections (Evidence gaps, Assumption risks, Equity tensions, Unintended consequences, Implementation risks)
- **Design Improvements**: 3 thematic recommendation groups with bullet placeholders

Skeleton type is determined from the section ID (`scan`, `sg_*`, or synthesis section IDs). The skeleton fades in with a CSS animation and is replaced by real content as soon as the first token arrives.

Sub-group sections are now pre-created with empty content when their `analysis_step active` event fires (matching the pattern already used for scan and synthesis sections), ensuring the skeleton renders instead of the generic "Preparing analysis…" spinner.

### 2. Per-task model selection

Not all LLM calls need the same model. Four new settings allow independent model selection per task, each falling back to `OPENAI_MODEL` if not set:

| Setting | Call site | Default rationale |
|---------|-----------|-------------------|
| `OPENAI_SCAN_MODEL` | Population relevance scan | Classification task — lighter model reduces TTFT |
| `OPENAI_ANALYSIS_MODEL` | Per-sub-group analysis + synthesis | Core analytical depth — keep on the strongest model |
| `OPENAI_SOCRATIC_MODEL` | Socratic policy specification | Conversational — lighter model acceptable |
| `OPENAI_CHAT_MODEL` | Follow-up evidence-grounded chat | Conversational Q&A |

Implemented via a `model_validator` on `Settings` that fills `None` values from `openai_model`. Each call site in the orchestrator uses its respective setting.

### 3. Per-task reasoning effort

GPT-5 supports a `reasoning_effort` parameter (`minimal`, `low`, `medium`, `high`) that trades reasoning depth for speed. Four new optional settings:

| Setting | Recommended | Rationale |
|---------|-------------|-----------|
| `OPENAI_SOCRATIC_REASONING_EFFORT` | `low` | Conversational questioning — `low` reduces TTFT substantially |
| `OPENAI_SCAN_REASONING_EFFORT` | `low` | Classification with heuristic mapping — doesn't need deep reasoning |
| `OPENAI_ANALYSIS_REASONING_EFFORT` | (omit) | Core analytical output — use model default |
| `OPENAI_CHAT_REASONING_EFFORT` | `low` | Follow-up Q&A |

When not set, the parameter is omitted entirely and the model uses its default. The parameter is conditionally added to kwargs only when a value is configured.

### 4. Singleton OpenAI client and prompt caching

The `AsyncOpenAI` client was previously instantiated fresh on every request (`stream_response`, `stream_analysis_chain`, `stream_synthesis_only`), meaning each request paid the cost of creating a new `httpx.AsyncClient` connection pool and TLS handshake. Now a singleton via `_get_client()` — the connection pool is created once and reused across all requests.

Prompt files (previously read from disk on every call via `_load_prompt()`) are now cached in a module-level dict after first read.

### 5. Per-category scan progress events

The scan streaming loop now detects category heading boundaries (`### Geography`, `### Household and Financial Context`, etc.) via a line buffer during streaming. When a new heading appears, a `scan_category_complete` data event is emitted with the count of completed categories.

The sidebar scan step subtitle updates progressively: "Assessing population characteristics…" → "1 of 6 categories assessed" → "3 of 6 categories assessed" → completion summary.

### 6. Step summaries in chat narration

Step summaries (the one-sentence `<step_summary>` extracted from each artefact) now flow into the chat alongside progress messages:

- **Sub-group completion**: "✓ Completed analysis for **{name}**. *{summary}* Moving to **{next}**..."
- **Scan completion**: The chat summary now includes the summary card's `summary` field in italics.
- **Synthesis section completion**: "✓ **Equity Assessment** complete. *{summary}*"

### 7. Scan prompt: Part 2 heading format fix

The scan prompt previously showed `sg_1`, `sg_2` as IDs in the JSON example without specifying a different format for the Part 2 prose. The LLM was copying these internal IDs into visible output. Fixed by adding explicit numbered heading format for Part 2 (`#### 1. Name`, `#### 2. Name`) and a formatting rule prohibiting internal IDs in readable output.

### Files created

- `frontend/src/components/analysis/ArtifactSkeleton.tsx` — generalised skeleton component for all 5 artefact types

### Files modified

**Backend:**
- `src/food_policy_impact_tool/core/config.py` — per-task model settings (`openai_scan_model`, `openai_analysis_model`, `openai_socratic_model`, `openai_chat_model`), per-task reasoning effort settings, `model_validator` for defaults
- `src/food_policy_impact_tool/llm/orchestrator.py` — singleton `_get_client()`, prompt caching in `_load_prompt()`, per-task model and reasoning effort at all four call sites, scan category heading detection with `scan_category_complete` events, step summary text in sub-group/scan/synthesis chat messages, `_SYNTHESIS_SECTION_NAMES` label map
- `src/food_policy_impact_tool/llm/prompts/analysis_scan.md` — Part 2 numbered heading format, formatting rule against internal IDs in prose
- `.env.example` — documented all per-task model and reasoning effort settings

**Frontend:**
- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — skeleton rendering for all section types via `ArtifactSkeleton`, section type detection from `sectionId`
- `frontend/src/components/chat/ChatContainer.tsx` — `scanCategoryProgress` state, `scan_category_complete` event handler, pre-creation of sub-group sections with empty content on step active
- `frontend/src/components/specification/SpecificationSidebar.tsx` — `scanCategoryProgress` prop, per-category progress subtitle on scan step
- `frontend/src/lib/types.ts` — `ScanCategoryCompleteEvent` interface, added to `AnalysisDataEvent` union
- `frontend/src/app/globals.css` — skeleton shimmer animation, fade-in animation

### Files deleted

- `frontend/src/components/analysis/ScanSkeleton.tsx` — replaced by generalised `ArtifactSkeleton.tsx`

---

## 2026-05-22 — Evidence popover: single best chunk with quote-centred display

### Problem

When a user clicked an evidence badge in a sub-population analysis artefact, the popover showed two chunk excerpts under "Evidence from tool retrieval". Each excerpt was truncated to the first 400 characters of the chunk, but chunks can be up to 3000 characters. The LLM's cited quote was often buried deeper in the chunk, so the displayed text didn't contain the passage the user was trying to verify. Showing two chunks was also confusing for non-technical users unfamiliar with the concept of text chunking.

### What was done

Changed the evidence badge popover to show a **single, best-matched chunk** with the display window **centred on the quoted passage**.

| Change | Detail |
|--------|--------|
| Single chunk display | `resolveEvidenceDisplay` now returns exactly one chunk (via `pickBestChunk`) instead of `.slice(0, 2)` |
| Quote-aware chunk selection | `scoreChunkByQuote` extracts quote probes from the badge detail, searches every candidate chunk for the quoted text, and returns the character index of the match. `pickBestChunk` iterates all candidates and selects the first chunk containing the quote. Falls back to the first source-matched chunk if no quote match is found. |
| Centred display window | `extractDisplayWindow` shows a ~400-character window centred on the match index, snapping to word boundaries. Ellipsis is prepended/appended when truncated on either side. When no match is found, falls back to showing from the start (identical to previous behaviour). |

### Files modified

- `frontend/src/components/analysis/BadgePopover.tsx` — added `scoreChunkByQuote`, `pickBestChunk`, `extractDisplayWindow`; modified `EvidenceDisplay` interface (added `matchIndex`), `resolveEvidenceDisplay` (single chunk via `pickBestChunk`), `ChunkDisplay` (accepts `matchIndex`, uses `extractDisplayWindow`), `RawEvidenceSection` (passes `matchIndex` through)
