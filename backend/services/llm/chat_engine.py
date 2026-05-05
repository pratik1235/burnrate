"""Orchestrates LLM calls with tool loop and streaming."""

import json
import logging
from datetime import date
from typing import Any, Dict, Iterator, Optional

from sqlalchemy.orm import Session

from backend import config
from backend.models.models import ChatMessage, ChatSession, Settings
from backend.services.llm.provider_base import (
    ChatMessage as LLMChatMessage,
    DoneEvent,
    ErrorEvent,
    LLMProvider,
    TokenEvent,
    ToolCallEvent,
)
from backend.services.llm.provider_ollama import OllamaProvider
from backend.services.llm.system_prompt import build_system_prompt
from backend.services.llm.tool_executor import execute_tool
from backend.services.llm.tools import TOOL_DEFINITIONS

logger = logging.getLogger(__name__)


def _get_provider(settings: Settings) -> LLMProvider:
    provider_id = settings.llm_provider or config.LLM_PROVIDER
    if provider_id == "ollama":
        model = settings.llm_model or config.LLM_OLLAMA_MODEL
        return OllamaProvider(model=model)
    raise ValueError(f"Unsupported LLM provider: {provider_id}")


def _db_messages_to_llm(db_messages) -> list[LLMChatMessage]:
    out = []
    for m in db_messages:
        msg = LLMChatMessage(role=m.role, content=m.content)
        if m.tool_calls:
            try:
                msg.tool_calls = json.loads(m.tool_calls)
            except (json.JSONDecodeError, TypeError):
                pass
        if m.tool_call_id:
            msg.tool_call_id = m.tool_call_id
        if m.tool_name:
            msg.name = m.tool_name
        out.append(msg)
    return out


def _next_sequence(db: Session, session_id: str) -> int:
    last = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.sequence.desc())
        .first()
    )
    return (last.sequence + 1) if last else 0


def _check_multi_currency(db: Session) -> bool:
    """Check if user has transactions in multiple currencies."""
    from backend.models.models import Transaction

    distinct_currencies = (
        db.query(Transaction.currency)
        .distinct()
        .limit(2)
        .all()
    )

    return len(distinct_currencies) > 1


def run_chat(
    message: str,
    session_id: Optional[str],
    db: Session,
    settings: Settings,
    provider: Optional[LLMProvider] = None,
) -> Iterator[Dict[str, Any]]:
    if len(message) > config.LLM_MAX_MESSAGE_LENGTH:
        yield {"event": "error", "data": {"message": f"Message too long (max {config.LLM_MAX_MESSAGE_LENGTH} chars)"}}
        return

    if provider is None:
        provider = _get_provider(settings)

    if session_id:
        session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not session:
            yield {"event": "error", "data": {"message": "Session not found"}}
            return
    else:
        session = ChatSession(
            title=message[:100],
            provider=provider.provider_id(),
            model=settings.llm_model or config.LLM_OLLAMA_MODEL,
        )
        db.add(session)
        db.flush()

    yield {"event": "session", "data": {"session_id": session.id, "title": session.title}}

    # Load conversation history
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.sequence)
        .all()
    )

    # Add user message
    seq = _next_sequence(db, session.id)
    user_msg = ChatMessage(
        session_id=session.id, role="user", content=message, sequence=seq,
    )
    db.add(user_msg)
    db.flush()

    # Build system prompt
    has_multi_currency = _check_multi_currency(db)

    system_prompt = build_system_prompt(
        user_name=settings.name,
        display_currency=settings.display_currency or "INR",
        today=date.today().isoformat(),
        has_multi_currency=has_multi_currency,
    )

    # Convert history to LLM format
    llm_messages = [LLMChatMessage(role="system", content=system_prompt)]
    llm_messages.extend(_db_messages_to_llm(history))
    llm_messages.append(LLMChatMessage(role="user", content=message))

    # Tool loop
    for iteration in range(config.LLM_MAX_TOOL_ITERATIONS):
        accumulated_content = ""
        tool_calls_in_round = []
        done = False

        for event in provider.chat_stream(llm_messages, tools=TOOL_DEFINITIONS):
            if isinstance(event, TokenEvent):
                accumulated_content += event.content
                yield {"event": "token", "data": {"content": event.content}}

            elif isinstance(event, ToolCallEvent):
                tool_calls_in_round.append(event)
                yield {
                    "event": "tool_call",
                    "data": {"name": event.name, "arguments": event.arguments},
                }

            elif isinstance(event, DoneEvent):
                done = True
                if not tool_calls_in_round:
                    # Final text response — persist and finish
                    seq = _next_sequence(db, session.id)
                    assistant_msg = ChatMessage(
                        session_id=session.id,
                        role="assistant",
                        content=accumulated_content or None,
                        sequence=seq,
                    )
                    db.add(assistant_msg)
                    db.flush()
                    yield {
                        "event": "done",
                        "data": {
                            "usage": {
                                "prompt_tokens": event.prompt_tokens,
                                "completion_tokens": event.completion_tokens,
                            }
                        },
                    }

            elif isinstance(event, ErrorEvent):
                yield {"event": "error", "data": {"message": event.message}}
                return

        if not tool_calls_in_round:
            # No tool calls, response complete
            return

        # Persist assistant message with tool calls
        seq = _next_sequence(db, session.id)
        tc_json = json.dumps([
            {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
            for tc in tool_calls_in_round
        ])
        assistant_tc_msg = ChatMessage(
            session_id=session.id,
            role="assistant",
            content=accumulated_content or None,
            tool_calls=tc_json,
            sequence=seq,
        )
        db.add(assistant_tc_msg)
        db.flush()

        # Add assistant tool call message to LLM context
        llm_messages.append(LLMChatMessage(
            role="assistant",
            content=accumulated_content or None,
            tool_calls=[
                {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                for tc in tool_calls_in_round
            ],
        ))

        # Execute each tool and persist results
        for tc in tool_calls_in_round:
            result = execute_tool(tc.name, tc.arguments, db)
            result_json = json.dumps(result, default=str)

            seq = _next_sequence(db, session.id)
            tool_msg = ChatMessage(
                session_id=session.id,
                role="tool",
                content=result_json,
                tool_call_id=tc.id,
                tool_name=tc.name,
                sequence=seq,
            )
            db.add(tool_msg)
            db.flush()

            summary = _summarize_tool_result(tc.name, result)
            yield {"event": "tool_result", "data": {"name": tc.name, "summary": summary}}

            llm_messages.append(LLMChatMessage(
                role="tool",
                content=result_json,
                tool_call_id=tc.id,
                name=tc.name,
            ))

    # Exceeded max iterations
    yield {"event": "error", "data": {"message": "Reached maximum tool call iterations"}}


def _summarize_tool_result(tool_name: str, result: Any) -> str:
    """Generate rich summary of tool execution result for LLM context."""
    if isinstance(result, dict) and "error" in result:
        return f"Error: {result['error']}"

    if isinstance(result, list):
        # Check if subscription detection result
        if tool_name == "detect_subscriptions" and result:
            summary = f"Found {len(result)} subscriptions"
            top_subs = result[:3]
            sub_details = ", ".join([
                f"{s['merchant']} ({s['frequency']}: {s['avg_amount']})"
                for s in top_subs
            ])
            summary += f" (top: {sub_details})"
            return summary
        return f"{len(result)} results"

    if isinstance(result, dict):
        # Spend summary with card breakdown
        if "total_spend" in result:
            summary = f"Total: {result['total_spend']}"
            if "card_breakdown" in result and result["card_breakdown"]:
                cards = result["card_breakdown"][:3]  # Top 3 cards
                card_details = ", ".join([
                    f"{c['bank']} {c['card_last4']}: {c['spend']}"
                    for c in cards
                ])
                summary += f" ({card_details})"
            return summary

        # Category breakdown
        if "categories" in result:
            cats = result.get("categories", [])
            summary = f"{len(cats)} categories"
            if cats:
                top_cats = cats[:3]  # Top 3 categories
                cat_details = ", ".join([
                    f"{c['category']}: {c['amount']}"
                    for c in top_cats
                ])
                summary += f" (top: {cat_details})"
            return summary

        # Merchant breakdown
        if "merchants" in result:
            merchants = result.get("merchants", [])
            summary = f"{len(merchants)} merchants"
            if merchants:
                top_merchants = merchants[:3]  # Top 3 merchants
                merchant_details = ", ".join([
                    f"{m['merchant']}: {m['amount']}"
                    for m in top_merchants
                ])
                summary += f" (top: {merchant_details})"
            return summary

        # Monthly trends
        if "trends" in result:
            return f"{len(result['trends'])} months"

    return "Done"
