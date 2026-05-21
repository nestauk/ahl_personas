from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from food_policy_impact_tool.api.dependencies import init_retriever, shutdown_retriever
from food_policy_impact_tool.api.routes import chat, ingest


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api/v1")
app.include_router(ingest.router, prefix="/api/v1")
