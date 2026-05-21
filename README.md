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
| LLM      | OpenAI API               | GPT-4o as the default model                                |
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

### Running the backend

```bash
uv run uvicorn food_policy_impact_tool.api:app --reload
```

### Running the frontend

```bash
cd frontend
npm run dev
```

## Documentation

Detailed project planning and phase specifications are in the [`docs/`](docs/) folder:

- [`CONTEXT.md`](docs/CONTEXT.md) — problem statement, design principles, ethical positioning
- [`PLAN.md`](docs/PLAN.md) — five-phase delivery plan and dependencies
- [`PHASE_1.md`](docs/PHASE_1.md) through [`PHASE_5.md`](docs/PHASE_5.md) — detailed specifications per phase

## Configuration

The tool requires an OpenAI API key. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`. See [`src/food_policy_impact_tool/core/config.py`](src/food_policy_impact_tool/core/config.py) for all available settings.
