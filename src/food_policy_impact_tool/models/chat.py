from typing import Literal

from pydantic import BaseModel


class ChatMessage(BaseModel):
    """A single message in a conversation."""

    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    """Incoming chat request from the frontend (matches Vercel AI SDK useChat format)."""

    messages: list[ChatMessage]
