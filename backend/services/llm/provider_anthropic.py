"""Stub for future Anthropic provider."""

from typing import Any, Dict, Iterator, List, Optional

from backend.services.llm.provider_base import (
    ChatMessage, LLMProvider, StreamEvent, ToolDefinition,
)


class AnthropicProvider(LLMProvider):
    def provider_id(self) -> str:
        return "anthropic"

    def chat_stream(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.1,
    ) -> Iterator[StreamEvent]:
        raise NotImplementedError("Anthropic provider not yet implemented")

    def health_check(self) -> Dict[str, Any]:
        raise NotImplementedError("Anthropic provider not yet implemented")

    def list_models(self) -> List[str]:
        raise NotImplementedError("Anthropic provider not yet implemented")
