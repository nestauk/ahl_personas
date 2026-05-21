from typing import Any, Literal

from pydantic import BaseModel

ConversationStage = Literal["specifying", "analysing", "chatting"]


class SpecValue(BaseModel):
    """A single characteristic's value in the policy specification."""

    values: list[str] = []
    source: Literal["analyst", "assumed", "unspecified", "not_applicable", "empty"] = "empty"
    rationale: str | None = None


class PolicySpecification(BaseModel):
    """The full policy specification mapped to the characteristics taxonomy."""

    policy_lever: SpecValue = SpecValue()
    in_scope_businesses: SpecValue = SpecValue()
    business_size: SpecValue = SpecValue()
    delivery_channel: SpecValue = SpecValue()
    population: SpecValue = SpecValue()
    geography: SpecValue = SpecValue()


class SpecMetadata(BaseModel):
    """Specification state plus metadata extracted from LLM responses."""

    spec: PolicySpecification = PolicySpecification()
    active_characteristic: str | None = None
    policy_name: str | None = None
    policy_description: str | None = None


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
