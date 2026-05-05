"""Abstract LLM provider interface and stream event data classes."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Union


@dataclass
class ChatMessage:
    role: str
    content: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: Dict[str, Any]


@dataclass
class ToolCallEvent:
    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass
class TokenEvent:
    content: str


@dataclass
class DoneEvent:
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass
class ErrorEvent:
    message: str


StreamEvent = Union[ToolCallEvent, TokenEvent, DoneEvent, ErrorEvent]


class LLMProvider(ABC):
    @abstractmethod
    def provider_id(self) -> str: ...

    @abstractmethod
    def chat_stream(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.1,
    ) -> Iterator[StreamEvent]: ...

    @abstractmethod
    def health_check(self) -> Dict[str, Any]: ...

    @abstractmethod
    def list_models(self) -> List[str]: ...
