"""LLM Insights API endpoints with SSE streaming."""

import json
import logging
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import config
from backend.models.database import get_db
from backend.models.models import ChatMessage, ChatSession, OAuthCredential, Settings
from backend.services import keychain, aws_credentials
from backend.services.llm.chat_engine import run_chat
from backend.services.llm.provider_base import ChatMessage as LLMChatMessage, TokenEvent, DoneEvent
from backend.services.llm.provider_ollama import OllamaProvider
from backend.services.llm.provider_anthropic import AnthropicProvider
from backend.services.llm.provider_openai import OpenAIProvider
from backend.services.llm.provider_bedrock import BedrockProvider
from backend.services.oauth_tokens import encrypt_secret
import boto3

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["insights"])


def _get_settings(db: Session) -> Settings:
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=400, detail="App not configured. Complete setup first.")
    return settings


def _get_provider(settings: Settings):
    """
    Get LLM provider based on settings.
    Credentials are auto-resolved from keychain/env by each provider constructor.
    """
    provider_id = settings.llm_provider or config.LLM_PROVIDER
    model = settings.llm_model

    if provider_id == "ollama":
        model = model or config.LLM_OLLAMA_MODEL
        return OllamaProvider(model=model)

    elif provider_id == "anthropic":
        model = model or config.LLM_ANTHROPIC_DEFAULT_MODEL
        # AnthropicProvider will get key from keychain/env automatically
        return AnthropicProvider(model=model)

    elif provider_id == "openai":
        model = model or config.LLM_OPENAI_DEFAULT_MODEL
        # OpenAIProvider will get key from keychain/env automatically
        return OpenAIProvider(model=model)

    elif provider_id == "bedrock":
        model = model or config.LLM_BEDROCK_DEFAULT_MODEL
        # get_aws_session() handles env/keychain/SSO precedence
        session = aws_credentials.get_aws_session()
        return BedrockProvider(model=model, aws_session=session)

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider_id}")


# ── Chat (SSE) ──────────────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


def _sse_generator(message: str, session_id: Optional[str], db: Session, settings: Settings):
    try:
        for event in run_chat(message, session_id, db, settings):
            event_type = event["event"]
            data = json.dumps(event["data"], default=str)
            yield f"event: {event_type}\ndata: {data}\n\n"
        db.commit()
    except Exception as e:
        logger.exception("Chat stream error")
        error_data = json.dumps({"message": str(e)})
        yield f"event: error\ndata: {error_data}\n\n"
        db.rollback()


@router.post("/chat")
def chat(body: ChatRequest, db: Session = Depends(get_db)):
    settings = _get_settings(db)
    return StreamingResponse(
        _sse_generator(body.message, body.session_id, db, settings),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Status ───────────────────────────────────────────────────────────────────


@router.get("/status")
def status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    settings = db.query(Settings).first()
    if not settings:
        return {"enabled": False, "provider": None, "model": None, "connected": False, "available_models": [], "error": "Setup not complete"}

    provider_id = settings.llm_provider or config.LLM_PROVIDER
    model = settings.llm_model or config.LLM_OLLAMA_MODEL

    try:
        provider = _get_provider(settings)
        health = provider.health_check()
        models = provider.list_models() if health.get("connected") else []
        return {
            "enabled": True,
            "provider": provider_id,
            "model": model,
            "connected": health.get("connected", False),
            "available_models": models,
            "error": health.get("error"),
        }
    except Exception as e:
        return {
            "enabled": True,
            "provider": provider_id,
            "model": model,
            "connected": False,
            "available_models": [],
            "error": str(e),
        }


# ── Sessions ─────────────────────────────────────────────────────────────────


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db)) -> Dict[str, Any]:
    sessions = (
        db.query(ChatSession)
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
        .all()
    )
    result = []
    for s in sessions:
        msg_count = db.query(func.count(ChatMessage.id)).filter(ChatMessage.session_id == s.id).scalar()
        result.append({
            "id": s.id,
            "title": s.title,
            "provider": s.provider,
            "model": s.model,
            "message_count": msg_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        })
    return {"sessions": result}


@router.get("/sessions/{session_id}/messages")
def get_session_messages(session_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.sequence)
        .all()
    )
    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_calls": json.loads(m.tool_calls) if m.tool_calls else None,
                "tool_call_id": m.tool_call_id,
                "tool_name": m.tool_name,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ]
    }


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"status": "success"}


# ── Models ───────────────────────────────────────────────────────────────────


@router.get("/models")
def list_models(db: Session = Depends(get_db)) -> Dict[str, Any]:
    settings = _get_settings(db)
    try:
        provider = _get_provider(settings)
        return {"models": provider.list_models()}
    except Exception as e:
        return {"models": [], "error": str(e)}


# ── Connection Test ──────────────────────────────────────────────────────────


class TestConnectionRequest(BaseModel):
    provider: str
    model: Optional[str] = None
    api_key: Optional[str] = None  # For temporary test without saving
    aws_access_key: Optional[str] = None  # For Bedrock
    aws_secret_key: Optional[str] = None


@router.post("/test")
def test_connection(
    body: Optional[TestConnectionRequest] = None,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Test LLM provider connection.
    Can accept parameters for pre-save testing, or use saved settings.
    """
    settings = _get_settings(db)

    try:
        # If body provided, use those parameters (pre-save test)
        if body:
            provider_id = body.provider
            model = body.model

            # Validate provider is in allowed list
            ALLOWED_PROVIDERS = ["ollama", "anthropic", "openai", "bedrock"]
            if provider_id not in ALLOWED_PROVIDERS:
                return {"success": False, "error": f"Unknown provider: {provider_id}", "latency_ms": 0}

            # Validate cloud providers have credentials
            if provider_id == "anthropic":
                api_key = body.api_key or keychain.get_api_key("anthropic")
                if not api_key:
                    return {"success": False, "error": "Anthropic API key required", "latency_ms": 0}
                provider = AnthropicProvider(model=model, api_key=api_key)

            elif provider_id == "openai":
                api_key = body.api_key or keychain.get_api_key("openai")
                if not api_key:
                    return {"success": False, "error": "OpenAI API key required", "latency_ms": 0}
                provider = OpenAIProvider(model=model, api_key=api_key)

            elif provider_id == "bedrock":
                if body.aws_access_key and body.aws_secret_key:
                    # Temporary credentials
                    session = boto3.Session(
                        aws_access_key_id=body.aws_access_key,
                        aws_secret_access_key=body.aws_secret_key,
                        region_name=config.AWS_REGION
                    )
                else:
                    # Use stored or environment credentials
                    session = aws_credentials.get_aws_session()
                provider = BedrockProvider(model=model, aws_session=session)

            elif provider_id == "ollama":
                provider = OllamaProvider(model=model)

            else:
                return {"success": False, "error": f"Unknown provider: {provider_id}", "latency_ms": 0}

        else:
            # No parameters - use DB settings (existing behavior)
            provider = _get_provider(settings)

        # Test connection
        start = time.monotonic()
        response_text = ""
        for event in provider.chat_stream(
            [LLMChatMessage(role="user", content="Hello, respond with just OK")],
            tools=None,
            temperature=0.0,
        ):
            if isinstance(event, TokenEvent):
                response_text += event.content
            elif isinstance(event, DoneEvent):
                break
        latency = int((time.monotonic() - start) * 1000)
        return {"success": True, "latency_ms": latency}

    except ValueError as e:
        # Catch credential errors and return user-friendly message
        return {"success": False, "error": str(e), "latency_ms": 0}
    except Exception as e:
        logger.error("Test connection error: %s", e, exc_info=True)
        return {"success": False, "error": "Connection test failed", "latency_ms": 0}


# ── API Key Management ───────────────────────────────────────────────────────


# ── API Key Management (Keychain-based) ─────────────────────────────────────


class ApiKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.post("/api-key")
def save_api_key_endpoint(body: ApiKeyRequest) -> Dict[str, bool]:
    """
    Save LLM provider API key to OS keychain.
    Validates key format before storing.
    """
    if body.provider not in ["anthropic", "openai"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    # Validate API key format
    if body.provider == "anthropic" and not body.api_key.startswith("sk-ant-"):
        raise HTTPException(status_code=400, detail="Invalid Anthropic API key format")
    if body.provider == "openai" and not body.api_key.startswith("sk-"):
        raise HTTPException(status_code=400, detail="Invalid OpenAI API key format")

    keychain.save_api_key(body.provider, body.api_key)
    return {"success": True}


@router.delete("/api-key/{provider}")
def delete_api_key_endpoint(provider: str) -> Dict[str, str]:
    """Delete LLM provider API key from OS keychain."""
    if provider not in ["anthropic", "openai"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    keychain.delete_api_key(provider)
    return {"status": "success"}


@router.get("/api-key/{provider}/status")
def api_key_status(provider: str) -> Dict[str, bool]:
    """Check if LLM provider API key is configured in keychain."""
    if provider not in ["anthropic", "openai"]:
        raise HTTPException(status_code=400, detail="Invalid provider")

    api_key = keychain.get_api_key(provider)
    return {"configured": api_key is not None}


# ── AWS Credential Management (Keychain-based) ──────────────────────────────


class AWSCredentialRequest(BaseModel):
    access_key: str
    secret_key: str
    region: Optional[str] = "us-east-1"


@router.post("/aws-credentials")
def save_aws_credentials_endpoint(body: AWSCredentialRequest) -> Dict[str, bool]:
    """
    Save AWS credentials to OS keychain.
    Validates key formats before storing.
    """
    # Validate AWS key formats
    if not body.access_key.startswith("AKIA") or len(body.access_key) != 20:
        raise HTTPException(status_code=400, detail="Invalid AWS access key format")
    if len(body.secret_key) != 40:
        raise HTTPException(status_code=400, detail="Invalid AWS secret key format")

    keychain.save_aws_credentials(body.access_key, body.secret_key)
    return {"success": True}


@router.delete("/aws-credentials")
def delete_aws_credentials_endpoint() -> Dict[str, str]:
    """Delete AWS credentials from OS keychain."""
    keychain.delete_aws_credentials()
    return {"status": "success"}


@router.get("/aws-credentials/status")
def get_aws_credentials_status() -> Dict[str, Any]:
    """
    Check if AWS credentials are configured.
    Checks all sources: environment, keychain, SSO.
    """
    has_env = aws_credentials.get_aws_credentials_from_env() is not None
    has_keychain = aws_credentials.get_aws_credentials_from_keychain() is not None
    has_sso = aws_credentials.get_aws_credentials_from_sso() is not None

    source = None
    if has_env:
        source = "environment"
    elif has_keychain:
        source = "keychain"
    elif has_sso:
        source = "sso"

    return {
        "configured": has_env or has_keychain or has_sso,
        "source": source
    }
