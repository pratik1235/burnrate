"""AWS Bedrock LLM provider with streaming support."""

import logging
import json
from typing import Any, Dict, Iterator, List, Optional

import boto3
from botocore.exceptions import NoCredentialsError, ClientError
from botocore.config import Config

from backend import config
from backend.services import aws_credentials
from backend.services.llm.provider_base import (
    ChatMessage, LLMProvider, StreamEvent, ToolDefinition,
    TokenEvent, ToolCallEvent, DoneEvent, ErrorEvent,
)

logger = logging.getLogger(__name__)


class BedrockProvider(LLMProvider):
    """AWS Bedrock provider using boto3 SDK."""

    def __init__(self, model: Optional[str] = None, aws_session: Optional[boto3.Session] = None):
        """
        Initialize Bedrock provider.

        Args:
            model: Model ID (defaults to config.LLM_BEDROCK_DEFAULT_MODEL)
            aws_session: Optional pre-configured boto3 Session

        Raises:
            ValueError: If no AWS credentials found
        """
        self._model = model or config.LLM_BEDROCK_DEFAULT_MODEL

        if not aws_session:
            aws_session = aws_credentials.get_aws_session()

        self._client = aws_session.client(
            'bedrock-runtime',
            region_name=config.AWS_REGION,
            config=Config(read_timeout=config.LLM_BEDROCK_TIMEOUT)
        )

    def provider_id(self) -> str:
        return "bedrock"

    def _to_bedrock_messages(
        self, messages: List[ChatMessage]
    ) -> tuple[Optional[str], List[Dict[str, Any]]]:
        """
        Convert ChatMessage list to Bedrock converse API format.

        Returns:
            Tuple of (system_prompt, messages_list)
        """
        system = None
        bedrock_messages = []

        for msg in messages:
            if msg.role == "system":
                system = msg.content
            elif msg.role in ("user", "assistant"):
                bedrock_messages.append({
                    "role": msg.role,
                    "content": [{"text": msg.content or ""}]
                })
            elif msg.role == "tool":
                # Tool results in Bedrock format
                bedrock_messages.append({
                    "role": "user",
                    "content": [{
                        "toolResult": {
                            "toolUseId": msg.tool_call_id,
                            "content": [{"text": msg.content or ""}]
                        }
                    }]
                })

        return system, bedrock_messages

    def _to_bedrock_tools(
        self, tools: List[ToolDefinition]
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Convert ToolDefinition list to Bedrock toolConfig format."""
        return {
            "tools": [{
                "toolSpec": {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": {
                        "json": tool.parameters
                    }
                }
            } for tool in tools]
        }

    def chat_stream(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        temperature: float = 0.1,
    ) -> Iterator[StreamEvent]:
        """
        Stream chat completion from Bedrock API with tool support.

        Yields:
            StreamEvent: TokenEvent, ToolCallEvent, DoneEvent, or ErrorEvent
        """
        try:
            system, bedrock_messages = self._to_bedrock_messages(messages)

            # Build request parameters
            request_params: Dict[str, Any] = {
                "modelId": self._model,
                "messages": bedrock_messages,
                "inferenceConfig": {
                    "temperature": temperature,
                    "maxTokens": 4096
                }
            }

            if system:
                request_params["system"] = [{"text": system}]

            if tools:
                request_params["toolConfig"] = self._to_bedrock_tools(tools)

            # Stream the response
            response = self._client.converse_stream(**request_params)

            tool_calls = []
            current_tool_call = None
            usage = {}

            for event in response.get("stream", []):
                # Content block start
                if "contentBlockStart" in event:
                    start = event["contentBlockStart"]
                    if "toolUse" in start.get("start", {}):
                        current_tool_call = {
                            "id": start["start"]["toolUse"]["toolUseId"],
                            "name": start["start"]["toolUse"]["name"],
                            "arguments": ""
                        }

                # Content block delta
                elif "contentBlockDelta" in event:
                    delta = event["contentBlockDelta"]["delta"]

                    if "text" in delta:
                        # Text content chunk
                        yield TokenEvent(content=delta["text"])

                    elif "toolUse" in delta:
                        # Tool call argument chunk
                        if current_tool_call:
                            current_tool_call["arguments"] += delta["toolUse"]["input"]

                # Content block stop
                elif "contentBlockStop" in event:
                    if current_tool_call:
                        tool_calls.append(current_tool_call)
                        yield ToolCallEvent(
                            id=current_tool_call["id"],
                            name=current_tool_call["name"],
                            arguments=current_tool_call["arguments"]
                        )
                        current_tool_call = None

                # Metadata with usage
                elif "metadata" in event:
                    metadata = event["metadata"]
                    if "usage" in metadata:
                        usage = {
                            "prompt_tokens": metadata["usage"].get("inputTokens", 0),
                            "completion_tokens": metadata["usage"].get("outputTokens", 0)
                        }

                # Message stop
                elif "messageStop" in event:
                    yield DoneEvent(usage=usage)

        except NoCredentialsError as e:
            logger.error("AWS credentials not found: %s", e)
            yield ErrorEvent(error="AWS credentials not found")
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "AccessDeniedException":
                logger.error("AWS access denied: %s", e)
                yield ErrorEvent(error="AWS access denied. Check IAM permissions.")
            elif error_code == "ValidationException":
                logger.error("AWS Bedrock validation error: %s", e)
                yield ErrorEvent(error="Invalid Bedrock model ID or region")
            else:
                logger.error("AWS Bedrock error: %s", e, exc_info=True)
                yield ErrorEvent(error="AWS Bedrock error. Please try again.")
        except Exception as e:
            logger.error("Unexpected error in Bedrock provider: %s", e, exc_info=True)
            yield ErrorEvent(error="An unexpected error occurred")

    def health_check(self) -> Dict[str, Any]:
        """
        Test connection to AWS Bedrock API.

        Returns:
            Dict with 'connected' and 'error' keys
        """
        try:
            # Send a minimal test message
            response = self._client.converse(
                modelId=self._model,
                messages=[{
                    "role": "user",
                    "content": [{"text": "Hi"}]
                }],
                inferenceConfig={"maxTokens": 10}
            )
            return {"connected": True, "error": None}
        except NoCredentialsError:
            return {"connected": False, "error": "AWS credentials not found"}
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "AccessDeniedException":
                return {"connected": False, "error": "AWS access denied"}
            return {"connected": False, "error": str(e)}
        except Exception as e:
            logger.error("Bedrock health check failed: %s", e)
            return {"connected": False, "error": str(e)}

    def list_models(self) -> List[str]:
        """
        Return available Bedrock Claude models.

        Returns:
            List of model IDs
        """
        try:
            # Try to fetch models from Bedrock API
            session = aws_credentials.get_aws_session()
            bedrock_client = session.client('bedrock', region_name=config.AWS_REGION)
            response = bedrock_client.list_foundation_models(
                byProvider="Anthropic"
            )
            model_ids = [
                model["modelId"]
                for model in response.get("modelSummaries", [])
                if "claude" in model["modelId"].lower()
            ]
            return sorted(model_ids) if model_ids else self._fallback_models()
        except Exception as e:
            logger.warning("Failed to fetch Bedrock models: %s", e)
            return self._fallback_models()

    def _fallback_models(self) -> List[str]:
        """Return hardcoded list of common Bedrock Claude models."""
        return [
            "anthropic.claude-3-5-sonnet-20241022-v2:0",
            "anthropic.claude-3-opus-20240229-v1:0",
            "anthropic.claude-3-haiku-20240307-v1:0",
        ]
