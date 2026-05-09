"""Anthropic/Claude LLM provider with streaming support."""

import logging
import uuid
from typing import Any, Dict, Iterator, List, Optional, Tuple

import anthropic
from anthropic import AuthenticationError, RateLimitError, APIError

from backend import config
from backend.services import keychain
from backend.services.llm.provider_base import (
    ChatMessage, LLMProvider, StreamEvent, ToolDefinition,
    TokenEvent, ToolCallEvent, DoneEvent, ErrorEvent,
)

logger = logging.getLogger(__name__)


class AnthropicProvider(LLMProvider):
    """Anthropic/Claude provider using official Anthropic SDK."""

    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize Anthropic provider.

        Args:
            model: Model ID (defaults to config.LLM_ANTHROPIC_DEFAULT_MODEL)
            api_key: Optional API key (if not provided, checks keychain then env)

        Raises:
            ValueError: If no API key found in any source
        """
        self._model = model or config.LLM_ANTHROPIC_DEFAULT_MODEL

        # Credential precedence: explicit parameter > keychain > environment variable
        self._api_key = (
            api_key
            or keychain.get_api_key("anthropic")
            or config.LLM_ANTHROPIC_API_KEY
        )

        if not self._api_key:
            raise ValueError("Anthropic API key not configured")

        self._client = anthropic.Anthropic(
            api_key=self._api_key,
            timeout=config.LLM_ANTHROPIC_TIMEOUT
        )

    def provider_id(self) -> str:
        return "anthropic"

    def _to_anthropic_messages(
        self, messages: List[ChatMessage]
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Convert ChatMessage list to Anthropic format.
        Extracts system message separately (Anthropic requires it as a parameter).

        Returns:
            Tuple of (system_prompt, messages_list)
        """
        system = ""
        anthropic_messages = []

        for msg in messages:
            if msg.role == "system":
                system = msg.content or ""
            elif msg.role == "user" or msg.role == "assistant":
                anthropic_messages.append({
                    "role": msg.role,
                    "content": msg.content or ""
                })
            elif msg.role == "tool":
                # Tool results need to be formatted as tool_result content blocks
                if msg.tool_call_id:
                    anthropic_messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": msg.tool_call_id,
                            "content": msg.content or ""
                        }]
                    })

        return system, anthropic_messages

    def _to_anthropic_tools(
        self, tools: List[ToolDefinition]
    ) -> List[Dict[str, Any]]:
        """Convert ToolDefinition list to Anthropic tool schema."""
        return [{
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.parameters
        } for tool in tools]

    def chat_stream(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.1,
    ) -> Iterator[StreamEvent]:
        """
        Stream chat completion from Anthropic API with tool support.

        Yields:
            StreamEvent: TokenEvent, ToolCallEvent, DoneEvent, or ErrorEvent
        """
        try:
            system, anthropic_messages = self._to_anthropic_messages(messages)

            # Build request parameters
            request_params: Dict[str, Any] = {
                "model": self._model,
                "max_tokens": 4096,
                "temperature": temperature,
                "messages": anthropic_messages,
            }

            if system:
                request_params["system"] = system

            if tools:
                request_params["tools"] = self._to_anthropic_tools(tools)

            # Stream the response
            with self._client.messages.stream(**request_params) as stream:
                tool_calls = []
                current_tool_call = None

                for event in stream:
                    # Content block start - detect tool use
                    if event.type == "content_block_start":
                        if hasattr(event, "content_block") and event.content_block.type == "tool_use":
                            current_tool_call = {
                                "id": event.content_block.id,
                                "name": event.content_block.name,
                                "arguments": ""
                            }

                    # Content block delta - accumulate tool arguments or text
                    elif event.type == "content_block_delta":
                        if hasattr(event.delta, "type"):
                            if event.delta.type == "input_json_delta":
                                # Tool call argument chunk
                                if current_tool_call:
                                    current_tool_call["arguments"] += event.delta.partial_json
                            elif event.delta.type == "text_delta":
                                # Text content chunk
                                yield TokenEvent(content=event.delta.text)

                    # Content block stop - finalize tool call
                    elif event.type == "content_block_stop":
                        if current_tool_call:
                            tool_calls.append(current_tool_call)
                            yield ToolCallEvent(
                                id=current_tool_call["id"],
                                name=current_tool_call["name"],
                                arguments=current_tool_call["arguments"]
                            )
                            current_tool_call = None

                    # Message stop - extract token usage
                    elif event.type == "message_stop":
                        usage = {}
                        if hasattr(stream, "get_final_message"):
                            final_message = stream.get_final_message()
                            if hasattr(final_message, "usage"):
                                usage = {
                                    "prompt_tokens": final_message.usage.input_tokens,
                                    "completion_tokens": final_message.usage.output_tokens
                                }
                        yield DoneEvent(usage=usage)

        except AuthenticationError as e:
            logger.error("Anthropic authentication error: %s", e)
            yield ErrorEvent(error="Invalid Anthropic API key")
        except RateLimitError as e:
            logger.error("Anthropic rate limit error: %s", e)
            yield ErrorEvent(error="Rate limit exceeded. Please try again later.")
        except APIError as e:
            logger.error("Anthropic API error: %s", e, exc_info=True)
            yield ErrorEvent(error="Anthropic API error. Please try again.")
        except Exception as e:
            logger.error("Unexpected error in Anthropic provider: %s", e, exc_info=True)
            yield ErrorEvent(error="An unexpected error occurred")

    def health_check(self) -> Dict[str, Any]:
        """
        Test connection to Anthropic API.

        Returns:
            Dict with 'connected' and 'error' keys
        """
        try:
            # Send a minimal test message
            response = self._client.messages.create(
                model=self._model,
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}]
            )
            return {"connected": True, "error": None}
        except AuthenticationError:
            return {"connected": False, "error": "Invalid API key"}
        except Exception as e:
            logger.error("Anthropic health check failed: %s", e)
            return {"connected": False, "error": str(e)}

    def list_models(self) -> List[str]:
        """
        Return available Anthropic models.

        Returns:
            List of model IDs
        """
        # Anthropic doesn't have a list models API endpoint
        # Return hardcoded list of current models
        return [
            "claude-opus-4-20250514",
            "claude-sonnet-4-20250514",
            "claude-haiku-3-5-20241022",
        ]
