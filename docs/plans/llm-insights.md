# LLM Insights — Product Requirement Document

## Context

Burnrate is a privacy-first, local-first credit card and bank statement analytics app. Users import PDF/CSV statements, and the app parses transactions, categorizes them, and provides analytics (spend summaries, category breakdowns, monthly trends, top merchants, milestone tracking).

This feature adds natural-language querying of spending data via LLMs. Users type questions like "How much did I spend on food last month?" and get accurate, data-backed answers. The LLM uses tool calling to query existing analytics services — it never fabricates numbers.

**Privacy compliance (Constitution §1.1, §8.1):** Ollama runs locally — data stays on machine. Cloud providers (future: Anthropic, OpenAI) are feature-scoped network access. The user opts in, and the app clearly communicates that transaction data will be sent externally.

**No MCP for V1.** Internal tool-calling layer wraps existing services. Same tools can be exposed as MCP later if demand arises.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript)                                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ InsightsFAB   │  │ InsightsPanel     │  │ InsightsSettings │  │
│  │ (floating btn)│→ │ (slide-over chat) │  │ (in Customize)   │  │
│  └──────────────┘  │ - Messages        │  └──────────────────┘  │
│                    │ - Streaming SSE   │                         │
│                    │ - Tool call badges│                         │
│                    └────────┬─────────┘                         │
│                             │ EventSource (SSE)                  │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│  Backend (FastAPI)          │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────┐                            │
│  │ POST /api/insights/chat (SSE)   │                            │
│  │ GET  /api/insights/status       │                            │
│  │ GET  /api/insights/sessions     │                            │
│  │ DEL  /api/insights/sessions/:id │                            │
│  │ GET  /api/insights/models       │                            │
│  │ POST /api/insights/test         │                            │
│  │ POST /api/insights/api-key      │                            │
│  └──────────┬──────────────────────┘                            │
│             │                                                    │
│  ┌──────────▼──────────────────────┐                            │
│  │ services/llm/                    │                            │
│  │  provider_base.py  (abstract)    │                            │
│  │  provider_ollama.py (V1)         │──→ Ollama localhost:11434  │
│  │  provider_anthropic.py (stub)    │                            │
│  │  provider_openai.py (stub)       │                            │
│  │  tools.py (8 tool definitions)   │                            │
│  │  tool_executor.py                │──→ Existing analytics/     │
│  │  system_prompt.py                │    transaction services    │
│  │  chat_engine.py                  │                            │
│  └──────────────────────────────────┘                            │
│             │                                                    │
│  ┌──────────▼──────────────────────┐                            │
│  │ SQLite DB                        │                            │
│  │  chat_sessions table             │                            │
│  │  chat_messages table             │                            │
│  │  settings.llm_provider/model     │                            │
│  │  oauth_credentials (API keys)    │                            │
│  └──────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

### 2.1 New Tables

**`chat_sessions`** — Conversation containers

| Column | Type | Notes |
|--------|------|-------|
| `id` | String UUID (PK) | Generated via `uuid4()` |
| `title` | String(200) | Auto-generated from first user message (first 100 chars) |
| `provider` | String(20) | "ollama", "anthropic", "openai" |
| `model` | String(100) | e.g. "llama3.1", "claude-sonnet-4-20250514" |
| `created_at` | DateTime | |
| `updated_at` | DateTime | Updated on each new message |

**`chat_messages`** — Individual messages within sessions

| Column | Type | Notes |
|--------|------|-------|
| `id` | String UUID (PK) | |
| `session_id` | String FK → chat_sessions (CASCADE) | |
| `role` | String(20) | "user", "assistant", "tool" |
| `content` | Text (nullable) | Text content of the message |
| `tool_calls` | Text (nullable) | JSON array of `{id, name, arguments}` for assistant tool-call messages |
| `tool_call_id` | String (nullable) | For role="tool" — which tool call this result belongs to |
| `tool_name` | String (nullable) | For role="tool" — the tool that was executed |
| `created_at` | DateTime | |
| `sequence` | Integer | Ordering within session (0-based) |

### 2.2 Settings Extensions

Add to `_run_migrations()` in `backend/models/database.py`:

```python
("settings", "llm_provider", "VARCHAR(20)"),
("settings", "llm_model", "VARCHAR(100)"),
```

### 2.3 API Key Storage

Reuse existing `OAuthCredential` table with `provider="anthropic_api"` or `provider="openai_api"`. The `encrypted_refresh_token` field stores the Fernet-encrypted API key. Same pattern as Gmail OAuth tokens (see `backend/services/oauth_tokens.py`).

---

## 3. Backend API

### 3.1 `POST /api/insights/chat` — SSE Streaming Chat

**Request:**
```json
{
  "message": "How much did I spend on food last month?",
  "session_id": null  // null = new session, string = continue existing
}
```

**Response:** Server-Sent Events (SSE) stream with `text/event-stream` content type.

Event types:
```
event: session
data: {"session_id": "uuid", "title": "How much did I spend on food..."}

event: tool_call
data: {"name": "get_category_breakdown", "arguments": {"from_date": "2026-03-01", "to_date": "2026-03-31"}}

event: tool_result
data: {"name": "get_category_breakdown", "summary": "12 categories returned"}

event: token
data: {"content": "You"}

event: token
data: {"content": " spent"}

event: token
data: {"content": " ₹12,450"}

event: done
data: {"usage": {"prompt_tokens": 450, "completion_tokens": 85}}

event: error
data: {"message": "Ollama is not reachable. Please ensure it's running."}
```

**Implementation flow:**
1. Validate message (max 2000 chars)
2. Load or create `ChatSession`
3. Build system prompt with user context (name, currency, today's date) from Settings
4. Load conversation history from `chat_messages`
5. Append user message to DB
6. Call LLM provider with streaming enabled
7. If LLM returns tool calls: execute each, persist tool call + result messages, re-call LLM (max 5 iterations)
8. Stream assistant tokens as SSE events
9. On completion, persist full assistant message to DB

Uses `StreamingResponse` from Starlette with `media_type="text/event-stream"`.

### 3.2 `GET /api/insights/status` — Provider Health Check

**Response:**
```json
{
  "enabled": true,
  "provider": "ollama",
  "model": "llama3.1",
  "connected": true,
  "available_models": ["llama3.1", "qwen2.5", "mistral"],
  "error": null
}
```

### 3.3 `GET /api/insights/sessions` — List Conversations

**Response:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "title": "Food spending last month",
      "provider": "ollama",
      "model": "llama3.1",
      "message_count": 6,
      "created_at": "2026-04-29T10:30:00",
      "updated_at": "2026-04-29T10:32:00"
    }
  ]
}
```

Returns most recent 50 sessions, ordered by `updated_at` descending.

### 3.4 `GET /api/insights/sessions/{session_id}/messages` — Get Session Messages

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "How much did I spend on food last month?",
      "tool_calls": null,
      "created_at": "2026-04-29T10:30:00"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "You spent ₹12,450 on food in March 2026...",
      "tool_calls": [{"name": "get_category_breakdown", "arguments": {...}}],
      "created_at": "2026-04-29T10:30:15"
    }
  ]
}
```

### 3.5 `DELETE /api/insights/sessions/{session_id}` — Delete Conversation

Cascade deletes all messages.

### 3.6 `GET /api/insights/models` — List Available Models

Calls provider's `list_models()`. For Ollama, hits `GET http://localhost:11434/api/tags`.

### 3.7 `POST /api/insights/test` — Connection Test

Sends a simple "Hello, respond with just OK" to the configured provider. Returns `{success: true/false, error?: string, latency_ms: number}`.

### 3.8 `POST /api/insights/api-key` — Store Cloud Provider Key

```json
{
  "provider": "anthropic",  // or "openai"
  "api_key": "sk-..."
}
```

Encrypts and stores via existing Fernet pattern. Returns `{success: true}`.

### 3.9 `DELETE /api/insights/api-key/{provider}` — Remove API Key

### 3.10 `GET /api/insights/api-key/{provider}/status` — Check If Key Configured

Returns `{configured: true/false}` (never returns the actual key).

---

## 4. LLM Provider Abstraction

### 4.1 Base Interface

File: `backend/services/llm/provider_base.py`

```python
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
```

`StreamEvent` types: `ToolCallEvent`, `TokenEvent`, `DoneEvent`, `ErrorEvent`.

### 4.2 Ollama Provider

File: `backend/services/llm/provider_ollama.py`

- Uses `httpx` (already in requirements.txt) to talk to Ollama's REST API
- Base URL: configurable, default `http://localhost:11434`
- `chat_stream()`: `POST /api/chat` with `stream: true`, parses NDJSON response line-by-line
- `health_check()`: `GET /` with 5s timeout
- `list_models()`: `GET /api/tags`
- Timeout: 120s for chat (Ollama can be slow on first inference)

### 4.3 Future Providers (Stubs)

`provider_anthropic.py` and `provider_openai.py` created as stubs with `raise NotImplementedError`. When implemented, they'll use their respective Python SDKs and the same `StreamEvent` interface.

---

## 5. Tool Definitions (8 Tools)

File: `backend/services/llm/tools.py`

All tools wrap existing service functions. Parameters use JSON Schema format compatible with Ollama/OpenAI/Anthropic function calling.

| Tool | Wraps | Purpose |
|------|-------|---------|
| `query_transactions` | `routers/transactions.py` logic | Search/filter transactions (limit 50 for LLM queries) |
| `get_spend_summary` | `services/analytics.py:get_summary()` | Total net spend, delta %, card breakdown |
| `get_category_breakdown` | `services/analytics.py:get_category_breakdown()` | Category-wise amounts and percentages |
| `get_monthly_trends` | `services/analytics.py:get_monthly_trends()` | Monthly spend over time |
| `get_top_merchants` | `services/analytics.py:get_top_merchants()` | Ranked merchant list by spend |
| `list_cards` | `routers/cards.py:list_cards()` | All registered cards (for UUID resolution) |
| `get_categories` | `routers/categories.py:get_all_categories()` | Category definitions (for slug resolution) |
| `get_statement_periods` | `routers/analytics.py:statement_periods()` | Available data date ranges |

**Common filter parameters** (on query/analytics tools):
- `from_date`, `to_date` (YYYY-MM-DD)
- `cards` (comma-separated UUIDs)
- `categories` (comma-separated slugs)
- `direction` (incoming/outgoing)
- `tags`, `source` (CC/BANK)
- `amount_min`, `amount_max`
- `bank_accounts` (comma-separated bank:last4)

### Tool Executor

File: `backend/services/llm/tool_executor.py`

Routes tool calls to the appropriate service function with a real SQLAlchemy Session. Tool results are returned as compact JSON. Transaction queries capped at 50 results. Error handling wraps exceptions into `{"error": "message"}`.

---

## 6. System Prompt

File: `backend/services/llm/system_prompt.py`

Dynamically assembled with user context:

```
You are Burnrate Insights, a financial analytics assistant for {user_name}.
Today is {today}. The user's preferred display currency is {display_currency}.

## Rules
1. ALWAYS use tools to get data. Never guess or fabricate amounts.
2. If the user references a card (e.g., "HDFC card"), call list_cards first
   to find the card UUID, then use it in subsequent queries.
3. If the user references a category (e.g., "food spending"), call
   get_categories first to find the correct slug.
4. For date-relative questions ("last month", "this year"), calculate exact
   dates from today's date.
5. For period comparisons, make separate tool calls for each period.
6. Format currency: ₹ for INR, $ for USD. Use Indian numbering for INR.
7. Keep responses concise. Use bullet points for lists.
8. If no data found, say so clearly.
9. Do not ask clarifying questions unless truly ambiguous.
```

---

## 7. Frontend Design

### 7.1 UI Placement: Slide-Over Panel

The InsightsPanel is a **right-side slide-over** (420px wide, full height) accessible from **any page** via:
- A **floating action button** (FAB) fixed to bottom-right corner
- Keyboard shortcut **Cmd+I** / **Ctrl+I**

The panel overlays the current page content — users can ask questions while viewing their dashboard, transactions, or analytics.

### 7.2 Component Structure

```
App.tsx
  ├── <Routes> ... </Routes>
  ├── <InsightsFAB />          ← Floating button, bottom-right
  └── <InsightsPanel />        ← Slide-over, mounts at app level
        ├── PanelHeader        ← Title, model badge, session list, clear, close
        ├── MessageArea        ← Scrollable message list
        │   ├── UserMessage    ← Right-aligned, dark card
        │   ├── AssistantMessage ← Left-aligned, lighter card, streaming text
        │   └── ToolCallBadge  ← Small tag showing "Queried transactions"
        ├── SuggestedQueries   ← Shown when conversation is empty
        └── InputArea          ← Sticky bottom: InputField + Send button
```

### 7.3 Mockups

**Empty State (new conversation):**
```
┌─────────────────────────────────────┐
│  ✦ Insights            ≡  ✕        │
│  ollama/llama3.1                    │
│─────────────────────────────────────│
│                                     │
│                                     │
│         ┌─────────────────┐         │
│         │    ✦ Insights   │         │
│         │                 │         │
│         │  Ask anything   │         │
│         │  about your     │         │
│         │  spending       │         │
│         └─────────────────┘         │
│                                     │
│  Suggested:                         │
│  ┌─────────────────────────────┐    │
│  │ How much did I spend this   │    │
│  │ month?                      │    │
│  ├─────────────────────────────┤    │
│  │ What are my top merchants?  │    │
│  ├─────────────────────────────┤    │
│  │ Compare this month vs last  │    │
│  │ month                       │    │
│  ├─────────────────────────────┤    │
│  │ Which category has the      │    │
│  │ highest spend?              │    │
│  └─────────────────────────────┘    │
│                                     │
│─────────────────────────────────────│
│  Ask about your spending...    ▶    │
└─────────────────────────────────────┘
```

**Active Conversation:**
```
┌─────────────────────────────────────┐
│  ✦ Insights          ≡  🗑  ✕      │
│  ollama/llama3.1                    │
│─────────────────────────────────────│
│                                     │
│         ┌───────────────────────┐   │
│         │ How much did I spend  │   │
│         │ on food last month?   │   │
│         └───────────────────────┘   │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ ▸ Fetched categories          │  │
│  │ ▸ Queried spend summary       │  │
│  │                               │  │
│  │ You spent **₹12,450** on food │  │
│  │ in March 2026.                │  │
│  │                               │  │
│  │ Here's the breakdown:         │  │
│  │ • Swiggy — ₹4,200 (18 txns)  │  │
│  │ • Zomato — ₹3,100 (12 txns)  │  │
│  │ • Restaurants — ₹5,150        │  │
│  │                               │  │
│  │ This is 8% higher than Feb.   │  │
│  └───────────────────────────────┘  │
│                                     │
│         ┌───────────────────────┐   │
│         │ What about this month │   │
│         │ so far?               │   │
│         └───────────────────────┘   │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ ▸ Queried spend summary       │  │
│  │                               │  │
│  │ So far in April 2026, you've  │  │
│  │ spent **₹8,900** on food...█  │  │  ← streaming cursor
│  └───────────────────────────────┘  │
│                                     │
│─────────────────────────────────────│
│  Ask a follow-up...           ▶    │
└─────────────────────────────────────┘
```

**Session List (≡ button opens sidebar within panel):**
```
┌─────────────────────────────────────┐
│  ✦ Sessions              ✕          │
│─────────────────────────────────────│
│  + New conversation                 │
│                                     │
│  Today                              │
│  ┌─────────────────────────────┐    │
│  │ Food spending last month    │    │
│  │ 6 messages • 10:30 AM      │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ Top merchants this year     │    │
│  │ 4 messages • 9:15 AM       │    │
│  └─────────────────────────────┘    │
│                                     │
│  Yesterday                          │
│  ┌─────────────────────────────┐    │
│  │ HDFC vs ICICI comparison    │    │
│  │ 8 messages • Apr 28         │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

**LLM Settings Modal (in Customize page):**
```
┌─────────────────────────────────────────────┐
│  LLM Insights Settings                   ✕  │
│─────────────────────────────────────────────│
│                                             │
│  Provider                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ ● Ollama │ │ ○ Claude │ │ ○ OpenAI │    │
│  │  (Local) │ │  (Cloud) │ │  (Cloud) │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│  ── Ollama Configuration ──                 │
│                                             │
│  Base URL                                   │
│  ┌─────────────────────────────────────┐    │
│  │ http://localhost:11434              │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Model                                      │
│  ┌─────────────────────────────────────┐    │
│  │ llama3.1                        ▼   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Status: ● Connected                        │
│                                             │
│  [ Test Connection ]         [ Save ]       │
│                                             │
│                                             │
│  ── When Cloud Provider Selected ──         │
│  ┌─────────────────────────────────────┐    │
│  │ ⚠ Cloud providers send your         │    │
│  │ transaction data (merchant names,   │    │
│  │ amounts, dates) to external servers │    │
│  │ for processing.                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  API Key                                    │
│  ┌─────────────────────────────────────┐    │
│  │ ••••••••••••••••                    │    │
│  └─────────────────────────────────────┘    │
│  [ Save Key ]  [ Test Connection ]          │
└─────────────────────────────────────────────┘
```

**Loading State (while LLM processes):**
```
  ┌───────────────────────────────┐
  │ ▸ Fetching categories...       │
  │                               │
  │  ● ● ●                       │  ← animated dots
  └───────────────────────────────┘
```

**Error State (provider unreachable):**
```
  ┌───────────────────────────────┐
  │ ⚠ Could not connect to       │
  │ Ollama. Make sure it's       │
  │ running at localhost:11434.   │
  │                               │
  │ [ Retry ] [ Open Settings ]   │
  └───────────────────────────────┘
```

### 7.4 Styling

Follows existing app patterns:
- Background: `colorPalette.black[90]` for panel, `#0D0D0D` behind
- User messages: right-aligned, `rgba(255,255,255,0.06)` background
- Assistant messages: left-aligned, `rgba(255,255,255,0.03)` background
- Tool call badges: small `Tag` components (NeoPOP) with muted color
- Accent: `colorPalette.rss[500]` (orange) for FAB and highlights
- Borders: `rgba(255,255,255,0.08)` consistent with app
- Typography: NeoPOP `Typography` component throughout
- Icons: lucide-react (`Lightbulb`, `Send`, `Trash2`, `List`, `X`, `RotateCcw`)
- Slide animation: CSS transform `translateX(100%)` → `translateX(0)`, 200ms ease

### 7.5 Streaming Implementation

Frontend uses `EventSource` (native browser SSE) or a `fetch` + `ReadableStream` reader to consume the SSE stream:

```typescript
const response = await fetch('/api/insights/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, session_id }),
});

const reader = response.body.getReader();
// Parse SSE events, update message state as tokens arrive
```

The `useInsights` hook manages streaming state, appending tokens to the current assistant message as they arrive.

---

## 8. Configuration

### 8.1 Backend Config (`backend/config.py`)

```python
LLM_PROVIDER = os.getenv("BURNRATE_LLM_PROVIDER", "ollama")
LLM_OLLAMA_BASE_URL = os.getenv("BURNRATE_LLM_OLLAMA_URL", "http://localhost:11434")
LLM_OLLAMA_MODEL = os.getenv("BURNRATE_LLM_OLLAMA_MODEL", "llama3.1")
LLM_MAX_TOOL_ITERATIONS = 5
LLM_CHAT_TIMEOUT = 120  # seconds
LLM_MAX_MESSAGE_LENGTH = 2000
LLM_MAX_TRANSACTION_RESULTS = 50
```

### 8.2 Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BURNRATE_LLM_PROVIDER` | `ollama` | Active provider |
| `BURNRATE_LLM_OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `BURNRATE_LLM_OLLAMA_MODEL` | `llama3.1` | Default Ollama model |

---

## 9. Privacy & Security

1. **Ollama**: All data stays local. No privacy concerns beyond normal local operation.
2. **Cloud providers (future)**: Orange-bordered warning in settings UI when selected. Transaction data (merchant, amount, date) is sent in tool call results. System prompt + conversation context are transmitted.
3. **API key encryption**: Fernet symmetric encryption via existing `backend/services/oauth_tokens.py` pattern. Keys stored in `oauth_credentials` table.
4. **Input validation**: Messages capped at 2000 chars. Tool results truncated at 50 transactions. Max 5 tool call iterations per request.
5. **No telemetry**: No usage data sent anywhere. Token counts displayed locally only.

---

## 10. New Files

### Backend
| File | Purpose |
|------|---------|
| `backend/services/llm/__init__.py` | Package init |
| `backend/services/llm/provider_base.py` | Abstract LLM provider interface + data classes |
| `backend/services/llm/provider_ollama.py` | Ollama REST API client with streaming |
| `backend/services/llm/provider_anthropic.py` | Stub for future Anthropic support |
| `backend/services/llm/provider_openai.py` | Stub for future OpenAI support |
| `backend/services/llm/tools.py` | 8 tool definitions as JSON Schema |
| `backend/services/llm/tool_executor.py` | Routes tool calls to existing services |
| `backend/services/llm/system_prompt.py` | System prompt builder |
| `backend/services/llm/chat_engine.py` | Orchestrates LLM calls with tool loop + streaming |
| `backend/routers/insights.py` | FastAPI router with SSE streaming endpoint |

### Frontend
| File | Purpose |
|------|---------|
| `frontend-neopop/src/components/InsightsPanel.tsx` | Slide-over chat panel |
| `frontend-neopop/src/components/InsightsMessage.tsx` | Message bubble (user + assistant) |
| `frontend-neopop/src/components/InsightsToolCallBadge.tsx` | Tool call transparency badge |
| `frontend-neopop/src/components/InsightsSettingsModal.tsx` | LLM config modal (Customize page) |
| `frontend-neopop/src/components/InsightsFAB.tsx` | Floating action button |
| `frontend-neopop/src/components/InsightsSessionList.tsx` | Conversation history sidebar |
| `frontend-neopop/src/hooks/useInsights.ts` | Chat state management + SSE streaming |
| `frontend-neopop/src/lib/insightsApi.ts` | API client functions for /insights/* |

### Modified Files
| File | Change |
|------|--------|
| `backend/models/models.py` | Add `ChatSession`, `ChatMessage` models |
| `backend/models/database.py` | Add migrations for `llm_provider`, `llm_model` on settings |
| `backend/config.py` | Add LLM configuration constants |
| `backend/main.py` | Register insights router |
| `frontend-neopop/src/App.tsx` | Mount `InsightsFAB` + `InsightsPanel` at app level |
| `frontend-neopop/src/pages/Customize.tsx` | Add LLM Insights FeatureCard + modal |
| `frontend-neopop/src/lib/api.ts` | Add insights API functions |

---

## 11. Implementation Phases

### Phase 1: Backend Core
1. Add `ChatSession` and `ChatMessage` models to `backend/models/models.py`
2. Add `llm_provider` and `llm_model` migrations in `database.py`
3. Create `backend/services/llm/` package: `provider_base.py`, `provider_ollama.py`, stubs
4. Create `tools.py` with all 8 tool definitions
5. Create `tool_executor.py` to route tool calls to existing services
6. Create `system_prompt.py`
7. Create `chat_engine.py` — orchestrates the LLM call loop with streaming
8. Create `backend/routers/insights.py` with all endpoints (SSE streaming)
9. Register router in `main.py`
10. Add LLM config to `config.py`

### Phase 2: Frontend Chat UI
1. Create `insightsApi.ts` with API client functions
2. Create `useInsights.ts` hook with SSE streaming consumer
3. Build `InsightsPanel.tsx` (slide-over with animation)
4. Build `InsightsMessage.tsx` (message rendering with basic markdown)
5. Build `InsightsToolCallBadge.tsx`
6. Build `InsightsFAB.tsx` (floating button)
7. Build `InsightsSessionList.tsx` (conversation history)
8. Integrate into `App.tsx`
9. Add Cmd+I keyboard shortcut

### Phase 3: Settings UI
1. Build `InsightsSettingsModal.tsx` with provider selection, model dropdown, connection test
2. Add FeatureCard to `Customize.tsx`
3. Wire up API key save/delete for future cloud providers
4. Add privacy warning callout for cloud providers

### Phase 4: Polish & Testing
1. Error states: Ollama down, model not found, timeout, empty DB
2. Loading animations (typing dots, streaming cursor)
3. Suggested queries in empty state
4. Edge cases: mixed currencies, no data, very large responses
5. Backend tests for tool executor and chat engine
6. Playwright tests for the panel UI

---

## 12. Verification Plan

### Manual Testing
1. **Ollama setup**: Install Ollama, pull `llama3.1`, verify `GET http://localhost:11434/` returns OK
2. **Status check**: `GET /api/insights/status` shows connected + available models
3. **Basic query**: Send "How much did I spend this month?" — verify tool calls are made and response includes real data
4. **Multi-turn**: Follow up with "What about last month?" — verify context is maintained
5. **Tool call transparency**: Verify tool call badges appear in the UI showing what was queried
6. **Streaming**: Verify tokens appear word-by-word (not all at once)
7. **Session persistence**: Refresh the page → previous conversations are listed
8. **Session management**: Delete a session → messages are gone, create new → works
9. **Settings**: Change model in settings → next query uses new model
10. **Error handling**: Stop Ollama → verify error message is shown, start it → retry works
11. **Edge cases**: Query with empty DB, query for non-existent card, query spanning multiple currencies

### Automated Tests
- `pytest` tests for tool executor (mock DB session, verify correct service calls)
- `pytest` tests for system prompt builder
- `pytest` tests for chat session CRUD
- Playwright test for opening/closing the panel
- Playwright test for sending a message and receiving a response
