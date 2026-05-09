"""OpenAI LLM provider with streaming support."""

import logging
import json
from typing import Any, Dict, Iterator, List, Optional

import openai
from openai import AuthenticationError, RateLimitError, APIError

from backend import config
from backend.services import keychain
from backend.services.llm.provider_base import (
    ChatMessage, LLMProvider, StreamEvent, ToolDefinition,
    TokenEvent, ToolCallEvent, DoneEvent, ErrorEvent,
)

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """OpenAI provider using official OpenAI SDK."""

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize OpenAI provider.

        Args:
            model: Model ID (defaults to config.LLM_OPENAI_DEFAULT_MODEL)
            api_key: Optional API key (if not provided, checks keychain then env)

        Raises:
            ValueError: If no API key found in any source
        """
        self._model = model or config.LLM_OPENAI_DEFAULT_MODEL

        # Credential precedence: explicit parameter > keychain > environment variable
        self._api_key = (
            api_key
            or keychain.get_api_key("openai")
            or config.LLM_OPENAI_API_KEY
        )

        if not self._api_key:
            raise ValueError("OpenAI API key not configured")

        self._client = openai.OpenAI(
            api_key=self._api_key,
            timeout=config.LLM_OPENAI_TIMEOUT
        )

    def provider_id(self) -> str:
        return "openai"

    def _to_openai_messages(
        self, messages: List[ChatMessage]
    ) -> List[Dict[str, Any]]:
        """Convert ChatMessage list to OpenAI format."""
        openai_messages = []

        for msg in messages:
            if msg.role in ("system", "user", "assistant"):
                openai_messages.append({
                    "role": msg.role,
                    "content": msg.content or ""
                })
            elif msg.role == "tool":
                # Tool results in OpenAI format
                openai_messages.append({
                    "role": "tool",
                    "tool_call_id": msg.tool_call_id,
                    "content": msg.content or ""
                })

        return openai_messages

    def _to_openai_tools(
        self, tools: List[ToolDefinition]
    ) -> List[Dict[str, Any]]:
        """Convert ToolDefinition list to OpenAI function calling schema."""
        return [{
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters
            }
        } for tool in tools]

    def chat_stream(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.1,
    ) -> Iterator[StreamEvent]:
        """
        Stream chat completion from OpenAI API with tool support.

        Yields:
            StreamEvent: TokenEvent, ToolCallEvent, DoneEvent, or ErrorEvent
        """
        try:
            openai_messages = self._to_openai_messages(messages)

            # Build request parameters
            request_params: Dict[str, Any] = {
                "model": self._model,
                "messages": openai_messages,
                "temperature": temperature,
                "stream": True,
            }

            if tools:
                request_params["tools"] = self._to_openai_tools(tools)

            # Stream the response
            stream = self._client.chat.completions.create(**request_params)

            tool_calls_accumulator = {}  # Track tool calls across chunks
            usage = {}

            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None

                if not delta:
                    continue

                # Text content
                if delta.content:
                    yield TokenEvent(content=delta.content)

                # Tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        tool_call_id = tc.id
                        if tool_call_id:
                            # New tool call
                            if tool_call_id not in tool_calls_accumulator:
                                tool_calls_accumulator[tool_call_id] = {
                                    "id": tool_call_id,
                                    "name": tc.function.name if tc.function else "",
                                    "arguments": ""
                                }
                        else:
                            # Continuation of existing tool call (use index)
                            tool_call_id = f"tc_{tc.index}"
                            if tool_call_id not in tool_calls_accumulator:
                                tool_calls_accumulator[tool_call_id] = {
                                    "id": tool_call_id,
                                    "name": tc.function.name if tc.function and tc.function.name else "",
                                    "arguments": ""
                                }

                        # Accumulate arguments
                        if tc.function and tc.function.arguments:
                            tool_calls_accumulator[tool_call_id]["arguments"] += tc.function.arguments

                # Check for finish
                if chunk.choices and chunk.choices[0].finish_reason:
                    # Extract usage info if available
                    if hasattr(chunk, "usage") and chunk.usage:
                        usage = {
                            "prompt_tokens": chunk.usage.prompt_tokens,
                            "completion_tokens": chunk.usage.completion_tokens
                        }

            # Emit accumulated tool calls
            for tc in tool_calls_accumulator.values():
                yield ToolCallEvent(
                    id=tc["id"],
                    name=tc["name"],
                    arguments=tc["arguments"]
                )

            # Done event
            yield DoneEvent(usage=usage)

        except AuthenticationError as e:
            logger.error("OpenAI authentication error: %s", e)
            yield ErrorEvent(error="Invalid OpenAI API key")
        except RateLimitError as e:
            logger.error("OpenAI rate limit error: %s", e)
            yield ErrorEvent(error="Rate limit exceeded. Please try again later.")
        except APIError as e:
            logger.error("OpenAI API error: %s", e, exc_info=True)
            yield ErrorEvent(error="OpenAI API error. Please try again.")
        except Exception as e:
            logger.error("Unexpected error in OpenAI provider: %s", e, exc_info=True)
            yield ErrorEvent(error="An unexpected error occurred")

    def health_check(self) -> Dict[str, Any]:
        """
        Test connection to OpenAI API.

        Returns:
            Dict with 'connected' and 'error' keys
        """
        try:
            # Send a minimal test message
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5
            )
            return {"connected": True, "error": None}
        except AuthenticationError:
            return {"connected": False, "error": "Invalid API key"}
        except Exception as e:
            logger.error("OpenAI health check failed: %s", e)
            return {"connected": False, "error": str(e)}

    def list_models(self) -> List[str]:
        """
        Return available OpenAI models.

        Returns:
            List of model IDs
        """
        try:
            # Try to fetch models from API
            models_response = self._client.models.list()
            gpt_models = [
                m.id for m in models_response.data
                if m.id.startswith("gpt-")
            ]
            return sorted(gpt_models) if gpt_models else self._fallback_models()
        except Exception as e:
            logger.warning("Failed to fetch OpenAI models: %s", e)
            return self._fallback_models()

    def _fallback_models(self) -> List[str]:
        """Return hardcoded list of common OpenAI models."""
        return [
            "gpt-4-turbo-preview",
            "gpt-4",
            "gpt-3.5-turbo",
        ]
