"""Ollama LLM provider using the REST API with streaming."""

import json
import logging
from typing import Any, Dict, Iterator, List, Optional
from uuid import uuid4

import httpx

from backend import config
from backend.services.llm.provider_base import (
    ChatMessage,
    DoneEvent,
    ErrorEvent,
    LLMProvider,
    StreamEvent,
    TokenEvent,
    ToolCallEvent,
    ToolDefinition,
)

logger = logging.getLogger(__name__)


def _to_ollama_messages(messages: List[ChatMessage]) -> List[Dict[str, Any]]:
    out = []
    for m in messages:
        msg: Dict[str, Any] = {"role": m.role, "content": m.content or ""}
        if m.tool_calls:
            msg["tool_calls"] = [
                {
                    "function": {
                        "name": tc["name"],
                        "arguments": tc["arguments"],
                    }
                }
                for tc in m.tool_calls
            ]
        if m.role == "tool":
            msg["content"] = m.content or ""
        out.append(msg)
    return out


def _to_ollama_tools(tools: List[ToolDefinition]) -> List[Dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            },
        }
        for t in tools
    ]


class OllamaProvider(LLMProvider):
    def __init__(self, model: Optional[str] = None, base_url: Optional[str] = None):
        self._model = model or config.LLM_OLLAMA_MODEL
        self._base_url = (base_url or config.LLM_OLLAMA_BASE_URL).rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=httpx.Timeout(config.LLM_CHAT_TIMEOUT, connect=10.0),
        )

    def provider_id(self) -> str:
        return "ollama"

    def chat_stream(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.1,
    ) -> Iterator[StreamEvent]:
        payload: Dict[str, Any] = {
            "model": self._model,
            "messages": _to_ollama_messages(messages),
            "stream": True,
            "options": {"temperature": temperature},
        }
        if tools:
            payload["tools"] = _to_ollama_tools(tools)

        try:
            with self._client.stream("POST", "/api/chat", json=payload) as resp:
                resp.raise_for_status()
                accumulated_content = ""
                for line in resp.iter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    msg = chunk.get("message", {})

                    # Tool calls come in the final chunk
                    if msg.get("tool_calls"):
                        for tc in msg["tool_calls"]:
                            fn = tc.get("function", {})
                            args = fn.get("arguments", {})
                            if isinstance(args, str):
                                try:
                                    args = json.loads(args)
                                except json.JSONDecodeError:
                                    args = {}
                            yield ToolCallEvent(
                                id=str(uuid4()),
                                name=fn.get("name", ""),
                                arguments=args,
                            )
                        # After tool calls, Ollama marks done=true in same chunk
                        if chunk.get("done"):
                            yield DoneEvent(
                                prompt_tokens=chunk.get("prompt_eval_count", 0),
                                completion_tokens=chunk.get("eval_count", 0),
                            )
                        continue

                    content = msg.get("content", "")
                    if content:
                        accumulated_content += content
                        yield TokenEvent(content=content)

                    if chunk.get("done"):
                        yield DoneEvent(
                            prompt_tokens=chunk.get("prompt_eval_count", 0),
                            completion_tokens=chunk.get("eval_count", 0),
                        )

        except httpx.ConnectError:
            yield ErrorEvent(
                message=f"Could not connect to Ollama at {self._base_url}. "
                "Please ensure Ollama is running."
            )
        except httpx.HTTPStatusError as e:
            yield ErrorEvent(message=f"Ollama returned HTTP {e.response.status_code}: {e.response.text[:200]}")
        except httpx.TimeoutException:
            yield ErrorEvent(message="Ollama request timed out. The model may be loading or the request was too complex.")
        except Exception as e:
            logger.exception("Unexpected error in Ollama provider")
            yield ErrorEvent(message=f"Unexpected error: {str(e)}")

    def health_check(self) -> Dict[str, Any]:
        try:
            resp = self._client.get("/", timeout=5.0)
            return {"connected": resp.status_code == 200, "error": None}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    def list_models(self) -> List[str]:
        try:
            resp = self._client.get("/api/tags", timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            logger.warning("Failed to list Ollama models: %s", e)
            return []
