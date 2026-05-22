from typing import Any, Literal

from pydantic import BaseModel

ConversationStage = Literal["specifying", "analysing", "chatting"]


class PolicySummarySpec(BaseModel):
    """Free-form policy specification produced by the Socratic conversation."""

    policy_name: str | None = None
    policy_summary: str | None = None
    taxonomy_mapping: dict[str, list[str]] = {}
    open_questions: list[str] = []
    ready_for_analysis: bool = False


class SpecMetadata(BaseModel):
    """Wrapper emitted as a data-stream event so the frontend can update state."""

    spec: PolicySummarySpec = PolicySummarySpec()


class ChatMessage(BaseModel):
    """A single message in a conversation."""

    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    """Incoming chat request from the frontend (matches Vercel AI SDK useChat format)."""

    messages: list[ChatMessage]
    stage: ConversationStage = "specifying"
    spec_state: dict[str, Any] | None = None
    confirmed_subgroups: list[dict[str, Any]] | None = None
    run_synthesis: bool = False
    analysis_texts: list[dict[str, str]] | None = None
