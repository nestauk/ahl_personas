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

## 2026-05-21 — Phase 3 follow-up: Analysis artifact panels

### Problem

The original Phase 3 implementation streamed the entire multi-sub-group analysis as one long assistant message via `react-markdown`. This caused the browser tab to become unresponsive — each streamed text delta triggered a full re-render of the growing markdown content. With 5–6 sub-groups producing 2000+ words each plus synthesis, the accumulated message overwhelmed the browser.

### What was done

Moved analysis output from a single chat message into **per-section artifact panels**, rendered in a dedicated analysis view that replaces the chat area during analysis and sits alongside it afterwards.

### Architecture change: analysis_content data events

The orchestrator no longer yields `("text", delta)` for sub-group and synthesis calls. Instead, the chain orchestrator re-tags inner text yields as `("analysis_content", {"section": "sg_0", "delta": "..."})`. The inner functions (`_stream_subgroup_with_tools`, `_stream_synthesis`) remain unchanged — the re-tagging happens at the `stream_analysis_chain` level, keeping separation of concerns clean.

`chat.py` formats these as `2:` data messages with `{"type": "analysis_content", "section": "sg_0", "delta": "..."}`. Non-text yields (data events for progress, evidence search) pass through unchanged.

Section IDs follow a convention: `"sg_0"`, `"sg_1"`, etc. for sub-group analyses, `"synthesis"` for the final call. These IDs are stable and match between the `analysis_step` progress events and the content events.

### Frontend: analysis sections state

`ChatContainer` now manages three new pieces of state:

- **`analysisSections`** (`Map<string, AnalysisSection>`) — accumulates content per section. Each `analysis_content` data event appends its delta to the correct section's content buffer. Section names are derived from the confirmed sub-groups list (for `sg_N` sections) or hardcoded ("Equity synthesis and provocations" for `synthesis`).
- **`activeSection`** (`string | null`) — the currently displayed section. Set automatically when a new section starts streaming (via `analysis_step` active events), and changeable by the analyst via the sidebar stepper.
- **`streamingSection`** (`string | null`) — which section is currently receiving content. Used to show a streaming indicator and enable auto-scroll. Cleared when the section completes.

### Frontend: AnalysisView and AnalysisSectionPanel

**`AnalysisView`** — displays the active section. Shows a header bar with the section name and delegates rendering to `AnalysisSectionPanel`. When no section is selected, shows a placeholder message.

**`AnalysisSectionPanel`** — memoised component that renders one section's accumulated markdown with grounding badges (via the shared `renderGroundingBadges` utility). Uses `rehype-raw` for the grounding badge `<span>` elements. Auto-scrolls to the bottom while the section is streaming (throttled to 500ms intervals to avoid layout thrashing). Shows a pulsing dot indicator while streaming.

Performance is the key benefit: only the active section's markdown is rendered at any time, rather than the entire analysis. Each section's content grows independently, and re-renders are isolated to the visible panel.

### Frontend: layout modes

`ChatContainer` now renders three distinct layouts:

1. **Specifying / scanning** (no analysis running): Full-width chat — `MessageList` + `ChatInput` + `TaxonomyHints`. Same as before.

2. **Analysing** (analysis running, sections exist): Full-width `AnalysisView`. The chat is hidden — the analyst watches the analysis build section by section. No chat input needed during analysis.

3. **Chatting with analysis** (analysis complete, sections exist): **60/40 split view** — `AnalysisView` on the left (60% width, border-separated), chat column on the right (40% width) with `MessageList` + `ChatInput`. The analyst can navigate analysis sections while asking follow-up questions.

### Frontend: sidebar persistence

The `AnalysisProgressPanel` in the sidebar now persists across the `analysing` → `chatting` stage transition. Previously, the sidebar's conditional rendering only showed the progress panel when `stage === "analysing"`, causing the section navigation to vanish when the analysis completed. Now, the sidebar shows the progress panel whenever analysis steps exist, regardless of stage.

### Frontend: completion message

When the `stage_transition` to `chatting` arrives, a synthetic assistant message is inserted into the chat: "Analysis complete — N sections analysed. Ask follow-up questions below, or navigate sections in the analysis panel." This gives the chat column immediate context for the follow-up conversation.

### Shared utility: grounding badges

Extracted `renderGroundingBadges` from `MessageBubble` into `frontend/src/lib/grounding-badges.ts`. Used by both `MessageBubble` (for chat messages) and `AnalysisSectionPanel` (for analysis content). Keeps the strict regex pattern in one place.

### Files created

- `frontend/src/components/analysis/AnalysisSectionPanel.tsx` — memoised single-section markdown renderer
- `frontend/src/components/analysis/AnalysisView.tsx` — section display with header bar
- `frontend/src/lib/grounding-badges.ts` — shared grounding badge regex utility

### Files modified

**Backend:**
- `src/food_policy_impact_tool/llm/orchestrator.py` — `stream_analysis_chain` re-tags text yields from sub-group and synthesis calls as `("analysis_content", {section, delta})`. Error banners also emitted as analysis_content.
- `src/food_policy_impact_tool/api/routes/chat.py` — handles new `"analysis_content"` part type, formats as `2:` data message with `{type: "analysis_content", section, delta}`.

**Frontend:**
- `frontend/src/lib/types.ts` — added `AnalysisSection` and `AnalysisContentEvent` interfaces, added to `AnalysisDataEvent` union.
- `frontend/src/components/chat/ChatContainer.tsx` — major rewrite: analysis sections state, `analysis_content` event handling, three layout modes (full chat / full analysis / split view), `handleSelectSection` callback, completion message insertion, reset of new state in `handleNewSession` and `handleRunAnalysis`.
- `frontend/src/components/analysis/AnalysisProgressPanel.tsx` — rewritten: accepts `onSelectSection` callback, clicking completed/active steps triggers section navigation. Removed DOM scroll approach.
- `frontend/src/components/specification/SpecificationSidebar.tsx` — passes `onSelectSection` through to `AnalysisProgressPanel`. Sidebar now shows progress panel in both `analysing` and `chatting` stages when analysis steps exist.
- `frontend/src/components/chat/MessageBubble.tsx` — `renderGroundingBadges` extracted to shared utility.
- `frontend/src/components/chat/MessageList.tsx` — removed unused `isStreaming` prop passed to `MessageBubble`.

### Bug fixes

- **Sidebar disappearing after analysis**: The `AnalysisProgressPanel` was only rendered when `stage === "analysing"`. After the stage transition to `chatting`, the progress panel vanished and the analyst lost section navigation. Fixed by also rendering the panel when `stage === "chatting"` and analysis steps exist.

### What has NOT been implemented yet

- No deliberation layer beyond what's in the provocations section (Phase 4)
- No multi-turn analysis refinement (re-running with different sub-groups is a new session)
- No export of analysis outputs (PDF, Word)
- No quantitative modelling beyond the qualitative evidence base
- No authentication or user management
- No tests

---

## 2026-05-21 — Local session caching

### Problem

All application state (chat messages, policy specification, analysis sections, progress) was held only in React state. Refreshing the page or closing and reopening the browser tab wiped everything — including completed analyses that may have taken several minutes to generate.

### What was done

Added localStorage-based session caching so that all meaningful state survives page refresh or close/reopen. The implementation covers three scenarios: normal state persistence, clean session reset, and graceful recovery from interrupted analyses.

### Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage backend | `localStorage` with a single `ahl-session` key | Simplest option, no dependencies, 5–10 MB quota is more than sufficient for the ~50–100 KB of text a typical analysis produces |
| Serialisation of `Map` | `Array.from(map.entries())` on save, `new Map(entries)` on restore | `Map` is not JSON-serialisable; entry arrays round-trip cleanly |
| Save timing | Debounced (500ms) via a single `useEffect` watching all cached fields | Prevents thrashing during rapid streaming deltas while keeping state reasonably current |
| Cache versioning | Integer `version` field in the cached blob | Allows discarding stale caches after schema-breaking code changes without crashes |
| Interrupted analysis recovery | Transition `analysing` → `chatting`, mark pending/active steps as `error` | Cannot resume an HTTP stream after page reload; showing completed sections with clear error markers is the best available UX |
| State initialisation | Lazy `useState` initialisers sourcing from cached values | Avoids a flash of empty state followed by a re-render; the first render already has the restored data |
| Message restoration | Mount `useEffect` calling `setMessages()` | `useChat` manages its own message state and doesn't accept initial messages; `setMessages` is the only way to inject cached history |

### Session cache module: `frontend/src/lib/session-cache.ts`

New utility module with six exports:

- **`CachedSession`** interface — typed shape of the localStorage blob. Includes `version`, all nine durable state fields, and `analysisSections` as `[string, AnalysisSection][]` (the serialised form of the Map).
- **`saveSession(state)`** — serialises state to JSON with Map-to-array conversion. Wrapped in try/catch to silently degrade on storage quota errors.
- **`loadSession()`** — reads and parses from localStorage. Returns `null` on any failure: missing key, JSON parse error, version mismatch, or missing required fields.
- **`hydrateAnalysisSections(entries)`** — reconstructs the `Map<string, AnalysisSection>` from the cached array.
- **`fixInterruptedAnalysis(cached)`** — detects if the cached stage was `analysing` with progress steps or sections present. If so, returns adjusted values: stage set to `chatting`, any `active`/`pending` steps re-marked as `error`, `isComplete` set to `true`, and a `wasInterrupted` flag for the caller. If the cached stage was `analysing` but had no progress (e.g. the scan hadn't started), leaves the state unchanged since there's nothing to recover.
- **`clearSession()` / `debouncedSave()`** — removes the localStorage key / wraps `saveSession` with a 500ms debounce timer.

### ChatContainer changes

**State initialisation from cache**: A lazy `useState` at the top of the component calls `loadSession()` once and runs `fixInterruptedAnalysis()` on the result. All subsequent `useState` hooks source their initial values from this cached result (falling back to defaults when no cache exists). For `analysisSections` (a Map), a lazy initialiser calls `hydrateAnalysisSections()`.

**Message restoration**: A mount-only `useEffect` calls `setMessages()` with the cached messages. If the analysis was interrupted, it appends a synthetic assistant message: "The previous analysis was interrupted (N of M sections completed). The completed sections are available in the analysis panel."

**Debounced save**: A single `useEffect` watches all nine cached state values and calls `debouncedSave()` on any change. A `skipSaveRef` prevents the initial hydration from immediately re-writing the same data back to localStorage.

**Session clearing**: `handleNewSession` now calls `clearSession()` as its first action, ensuring the localStorage key is removed before state is reset.

### What is cached

| Field | Type | Notes |
|-------|------|-------|
| `stage` | `ConversationStage` | `specifying`, `analysing`, or `chatting` |
| `messages` | `Message[]` | Full chat history from Vercel AI SDK |
| `specMeta` | `SpecMetadata` | Policy specification sidebar state |
| `proposedSubGroups` | `ProposedSubGroups \| null` | Sub-groups proposed by the scan call |
| `confirmedSubGroups` | `SubGroup[] \| null` | Analyst-confirmed sub-groups |
| `analysisProgress` | `AnalysisProgress` | Stepper state (step statuses) |
| `analysisSections` | `Map → [key, value][]` | Serialised as entry array for JSON compatibility |
| `activeSection` | `string \| null` | Currently viewed analysis section |
| `evidenceSearchCount` | `number` | Total evidence searches performed |

**Not cached** (transient streaming state): `activeEvidenceSearch`, `streamingSection`, `isLoading`, `input`, `data`, `lastProcessedDataIdx`.

### Files created

- `frontend/src/lib/session-cache.ts` — session cache utility module

### Files modified

- `frontend/src/components/chat/ChatContainer.tsx` — cache restoration on mount, debounced save effect, `clearSession()` in `handleNewSession`

### What has NOT been implemented yet

- No deliberation layer beyond what's in the provocations section (Phase 4)
- No multi-turn analysis refinement (re-running with different sub-groups is a new session)
- No export of analysis outputs (PDF, Word)
- No quantitative modelling beyond the qualitative evidence base
- No authentication or user management
- No tests
