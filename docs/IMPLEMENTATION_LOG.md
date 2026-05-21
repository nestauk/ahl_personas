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
