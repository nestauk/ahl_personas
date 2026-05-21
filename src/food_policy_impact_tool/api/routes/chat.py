import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from food_policy_impact_tool.api.dependencies import get_retriever
from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.llm.orchestrator import stream_chat_response
from food_policy_impact_tool.models.chat import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """Accept a chat request and stream back an evidence-grounded LLM response.

    Retrieves relevant evidence for the latest user message, then streams
    the LLM response as plain text (compatible with Vercel AI SDK's
    streamProtocol: 'text').
    """
    settings = get_settings()
    retriever = get_retriever()

    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        return StreamingResponse(iter(["Please provide a message."]), media_type="text/plain")

    latest_query = user_messages[-1].content
    evidence = retriever.retrieve(latest_query, top_k=settings.retrieval_top_k)

    logger.info(
        "Chat request: %d messages, retrieved %d evidence chunks",
        len(request.messages),
        len(evidence),
    )

    async def generate():
        async for token in stream_chat_response(request.messages, evidence):
            yield token

    return StreamingResponse(generate(), media_type="text/plain")
