import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from food_policy_impact_tool.api.dependencies import get_retriever
from food_policy_impact_tool.core.config import get_settings
from food_policy_impact_tool.llm.orchestrator import stream_response
from food_policy_impact_tool.models.chat import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter()


def _format_text_part(text: str) -> str:
    return f"0:{json.dumps(text)}\n"


def _format_data_part(data: list | dict) -> str:
    payload = data if isinstance(data, list) else [data]
    return f"2:{json.dumps(payload)}\n"


def _format_finish_step() -> str:
    return 'e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}\n'


def _format_finish_message() -> str:
    return 'd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'


@router.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """Accept a chat request and stream back an LLM response.

    Behaviour depends on the conversation stage:
    - 'specifying': Socratic prompt, no evidence retrieval, spec extraction.
    - 'analysing': Scan call (no confirmed_subgroups) or full analysis chain
      (with confirmed_subgroups and agentic evidence retrieval via tool calls).
    - 'chatting': General system prompt with evidence retrieval.
    """
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        async def empty_response():
            yield _format_text_part("Please provide a message.")
            yield _format_finish_step()
            yield _format_finish_message()

        return StreamingResponse(
            empty_response(),
            media_type="text/plain; charset=utf-8",
            headers={"x-vercel-ai-data-stream": "v1"},
        )

    evidence = []
    retriever = None

    if request.stage == "chatting":
        settings = get_settings()
        retriever = get_retriever()
        latest_query = user_messages[-1].content
        evidence = retriever.retrieve(latest_query, top_k=settings.retrieval_top_k)
    elif request.stage == "analysing" and request.confirmed_subgroups:
        retriever = get_retriever()

    logger.info(
        "Chat request: stage=%s, %d messages, %d evidence chunks, subgroups=%s",
        request.stage,
        len(request.messages),
        len(evidence),
        "confirmed" if request.confirmed_subgroups else "none",
    )

    async def generate():
        async for part_type, content in stream_response(
            stage=request.stage,
            messages=request.messages,
            evidence=evidence if evidence else None,
            spec_state=request.spec_state,
            confirmed_subgroups=request.confirmed_subgroups,
            retriever=retriever,
        ):
            if part_type == "text":
                yield _format_text_part(content)
            elif part_type == "analysis_content":
                yield _format_data_part({"type": "analysis_content", **content})
            elif part_type == "data":
                yield _format_data_part(content)

        yield _format_finish_step()
        yield _format_finish_message()

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={"x-vercel-ai-data-stream": "v1"},
    )
