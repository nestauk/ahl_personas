# AHL Personas Chatbot

An AI-powered tool that helps Nesta's health team analysts stress-test food environment policies against the likely experiences of underrepresented population sub-groups.

The tool is a **pre-consultation analytical aid** — it sharpens analysts' thinking and identifies blind spots before real engagement with affected communities, not as a substitute for that engagement.

## What it does

The system has three main stages:

1. **Socratic input chatbot** — helps analysts develop a loosely defined policy idea into a fully specified set of policy elements through structured questioning
2. **Analysis engine** — cross-references defined population sub-groups against policy elements, analysing how each group would experience the policy across lived-experience dimensions, grounded in a curated evidence base
3. **Deliberation layer** — synthesises across population-policy intersections to surface tensions, trade-offs, patterns, evidence gaps, and provocations back to the analyst

All analysis is grounded in a curated evidence base of qualitative and mixed-methods UK research on food insecurity, shopping behaviours, cooking practices, and related topics.

## Project structure

```
├── src/food_policy_impact_tool/   # Python backend
│   ├── api/                       # FastAPI routes and request/response handling
│   ├── core/                      # Configuration and shared utilities
│   ├── evidence/                  # PDF ingestion, chunking, storage, and retrieval
│   ├── llm/                       # LLM orchestration for all conversation stages
│   │   └── prompts/               # Prompt templates as editable markdown files
│   └── models/                    # Pydantic models shared across the system
├── frontend/                      # Next.js chat interface
├── data/                          # Evidence base
│   ├── *.csv                      # Metadata index of sources
│   └── sources/                   # PDF reports referenced by the index
├── scripts/replay.py              # Prompt replay harness (see "Iterating on prompts")
├── fixtures/                      # Saved policy specs and outputs for replays
├── tests/                         # Test suite
└── docs/                          # Project documentation
    ├── CONTEXT.md                 # Problem statement and design principles
    ├── PLAN.md                    # Phased delivery plan
    └── PHASE_1–5.md               # Detailed phase specifications
```

## Stack

| Layer    | Technology               | Why                                                        |
|----------|--------------------------|------------------------------------------------------------|
| Backend  | Python / FastAPI         | Best ecosystem for LLM orchestration, data, and retrieval  |
| Frontend | Next.js / React / Tailwind | Professional chat UI, streaming support, rapid iteration |
| LLM      | OpenAI API               | GPT-6 Sol as the default model (configurable per task)     |
| Deps     | uv (Python), npm (JS)    | Fast, modern dependency management                         |

## Getting started

### Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js 18+ and npm

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd ahl_personas

# Create .env from the template and add your OpenAI API key
cp .env.example .env

# Install Python dependencies
uv sync

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Running everything

```bash
make dev   # backend on :8010 and frontend on :3000, Ctrl-C stops both
```

Or run them separately:

### Running the backend

```bash
uv run uvicorn food_policy_impact_tool.api:app --reload --port 8010
```

### Running the frontend

```bash
cd frontend
npm run dev
```

## Iterating on prompts

Prompts live in `src/food_policy_impact_tool/llm/prompts/*.md`. To refine one, edit it and replay just the stage it drives against a saved fixture:

```bash
uv run python scripts/replay.py synthesis fixtures/price_cap.json
uv run python scripts/replay.py subgroup  fixtures/healthy_start.json --subgroup 2
uv run python scripts/replay.py chat      fixtures/price_cap.json --question "Which group loses most?"
uv run python scripts/replay.py scan      fixtures/healthy_start.json
uv run python scripts/replay.py socratic  fixtures/price_cap.json
uv run python scripts/replay.py chain     fixtures/<new>.json --save-fixture   # full run; stores sub-groups and texts
```

Each run prints pass/fail checks against the prompt's own budgets (headings, word counts, badge integrity, card fields, chips) and writes `replays/<fixture>-<stage>-<timestamp>.md` with what the analyst would see followed by the raw output. Diff two replay files to compare a prompt edit. Synthesis and chat replays reuse the saved sub-group texts, so they take under a minute. Timings and token counts for every replay are in Langfuse under the usual call names.

Fixtures are JSON files in `fixtures/` with the policy spec, proposed sub-groups and saved section texts. To add a policy, write a fixture with `name`, `policy_description` and `spec`, then run `chain --save-fixture` once.

## Documentation

Detailed project planning and phase specifications are in the [`docs/`](docs/) folder:

- [`CONTEXT.md`](docs/CONTEXT.md) — problem statement, design principles, ethical positioning
- [`PLAN.md`](docs/PLAN.md) — five-phase delivery plan and dependencies
- [`PHASE_1.md`](docs/PHASE_1.md) through [`PHASE_5.md`](docs/PHASE_5.md) — detailed specifications per phase

## Configuration

The tool requires an OpenAI API key. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. See [`src/food_policy_impact_tool/core/config.py`](src/food_policy_impact_tool/core/config.py) for all available settings.

For the frontend, copy `frontend/.env.example` to `frontend/.env.local` and adjust `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_KEY` if needed.

## Deployment (Railway)

The app deploys as **two Railpack-built services** in one Railway project: a FastAPI backend and a Next.js frontend. The backend uses a **Railway Volume** mounted at `/data` for the Qdrant index and evidence files.

### Service setup

**Backend service**

- Root directory: `/` (repo root)
- Builder: Railpack (uses [`railpack.json`](railpack.json))
- Attach a Volume mounted at `/data`
- Keep at **1 replica** (volume is single-writer)
- Health check path: `/health`

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your OpenAI key |
| `API_KEY` | Random secret (shared with frontend) |
| `CORS_ORIGINS` | `https://<frontend-domain>` |
| `QDRANT_PATH` | `/data/qdrant_store` |
| `EVIDENCE_CSV_PATH` | `/data/evidence_base.csv` |
| `SOURCES_DIR` | `/data/sources` |

**Frontend service**

- Root directory: `frontend/`
- Builder: Railpack (uses [`frontend/railpack.json`](frontend/railpack.json))
- Set build-time variables **before the first build**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://<backend-domain>` |
| `NEXT_PUBLIC_API_KEY` | Same secret as backend `API_KEY` |

### Manual evidence bootstrap

After the backend is deployed with the volume attached:

1. Copy `evidence_base.csv` and `sources/*.pdf` onto the volume under `/data` (e.g. via `railway ssh` into the backend container).
2. Trigger ingestion once:

   ```bash
   curl -X POST https://<backend-domain>/api/v1/ingest \
     -H "X-API-Key: <your-api-key>"
   ```

3. Verify sources are available:

   ```bash
   curl https://<backend-domain>/api/v1/evidence/sources \
     -H "X-API-Key: <your-api-key>"
   ```

The Qdrant index and evidence files persist on the volume across redeploys.

### Local vs Railway

The same codebase works locally and on Railway — only environment variables differ:

| | Local | Railway |
|---|-------|---------|
| Backend paths | `./data/...` (defaults) | `/data/...` |
| Auth | Disabled if `API_KEY` unset | `API_KEY` set on backend, `NEXT_PUBLIC_API_KEY` on frontend |
| API URL | `http://localhost:8010` | `https://<backend-domain>` |
| CORS | `http://localhost:3000` | `https://<frontend-domain>` |
