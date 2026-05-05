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
from backend.services.llm.chat_engine import run_chat
from backend.services.llm.provider_base import ChatMessage as LLMChatMessage, TokenEvent, DoneEvent
from backend.services.llm.provider_ollama import OllamaProvider
from backend.services.oauth_tokens import encrypt_secret

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["insights"])


def _get_settings(db: Session) -> Settings:
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=400, detail="App not configured. Complete setup first.")
    return settings


def _get_provider(settings: Settings):
    provider_id = settings.llm_provider or config.LLM_PROVIDER
    if provider_id == "ollama":
        model = settings.llm_model or config.LLM_OLLAMA_MODEL
        return OllamaProvider(model=model)
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


@router.post("/test")
def test_connection(db: Session = Depends(get_db)) -> Dict[str, Any]:
    settings = _get_settings(db)
    try:
        provider = _get_provider(settings)
        start = time.monotonic()
        from backend.services.llm.provider_base import ChatMessage as LLMMsg
        response_text = ""
        for event in provider.chat_stream(
            [LLMMsg(role="user", content="Hello, respond with just OK")],
            tools=None,
            temperature=0.0,
        ):
            if isinstance(event, TokenEvent):
                response_text += event.content
            elif isinstance(event, DoneEvent):
                break
        latency = int((time.monotonic() - start) * 1000)
        return {"success": True, "latency_ms": latency}
    except Exception as e:
        return {"success": False, "error": str(e), "latency_ms": 0}


# ── API Key Management ───────────────────────────────────────────────────────


class ApiKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.post("/api-key")
def save_api_key(body: ApiKeyRequest, db: Session = Depends(get_db)) -> Dict[str, bool]:
    provider_key = f"{body.provider}_api"
    encrypted = encrypt_secret(body.api_key)
    cred = db.query(OAuthCredential).filter(OAuthCredential.provider == provider_key).first()
    if cred:
        cred.encrypted_refresh_token = encrypted
    else:
        cred = OAuthCredential(provider=provider_key, encrypted_refresh_token=encrypted)
        db.add(cred)
    db.commit()
    return {"success": True}


@router.delete("/api-key/{provider}")
def delete_api_key(provider: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    provider_key = f"{provider}_api"
    cred = db.query(OAuthCredential).filter(OAuthCredential.provider == provider_key).first()
    if cred:
        db.delete(cred)
        db.commit()
    return {"status": "success"}


@router.get("/api-key/{provider}/status")
def api_key_status(provider: str, db: Session = Depends(get_db)) -> Dict[str, bool]:
    provider_key = f"{provider}_api"
    cred = db.query(OAuthCredential).filter(OAuthCredential.provider == provider_key).first()
    return {"configured": cred is not None}
