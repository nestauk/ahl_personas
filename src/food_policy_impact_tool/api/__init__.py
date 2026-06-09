import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from food_policy_impact_tool.api.auth import require_api_key
from food_policy_impact_tool.api.dependencies import init_retriever, shutdown_retriever
from food_policy_impact_tool.api.routes import chat, evidence, ingest
from food_policy_impact_tool.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s — %(message)s",
)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_retriever()
    yield
    shutdown_retriever()


app = FastAPI(
    title="Food Policy Impact Tool",
    version="0.1.0",
    lifespan=_lifespan,
)

_settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint for Railway and other deployment platforms."""
    return {"status": "ok"}


app.include_router(chat.router, prefix="/api/v1", dependencies=[Depends(require_api_key)])
app.include_router(evidence.router, prefix="/api/v1", dependencies=[Depends(require_api_key)])
app.include_router(ingest.router, prefix="/api/v1", dependencies=[Depends(require_api_key)])
