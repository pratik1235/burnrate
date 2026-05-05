import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INSIGHTS_CHAT_URL,
  getInsightsSessions,
  getSessionMessages,
  deleteSessionApi,
  type ChatSessionSummary,
} from '@/lib/insightsApi';

export interface ToolCallInfo {
  name: string;
  arguments: Record<string, unknown>;
  summary?: string;
  loading?: boolean;
}

export interface InsightsMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
}

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSE(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = text.split('\n\n');
  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (eventType && data) {
      events.push({ event: eventType, data });
    }
  }
  return events;
}

export function useInsights() {
  const [messages, setMessages] = useState<InsightsMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const msgIdCounter = useRef(0);

  const nextId = () => `local-${++msgIdCounter.current}`;

  const refreshSessions = useCallback(async () => {
    try {
      const data = await getInsightsSessions();
      setSessions(data.sessions);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (isStreaming || !message.trim()) return;
      setError(null);
      setIsStreaming(true);

      const userMsg: InsightsMessage = {
        id: nextId(),
        role: 'user',
        content: message,
      };
      const assistantMsg: InsightsMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch(INSIGHTS_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, session_id: sessionId }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          setError(`HTTP ${resp.status}: ${resp.statusText}`);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false, content: 'Failed to connect.' } : m)),
          );
          setIsStreaming(false);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = parseSSE(buffer);
          // Keep unparsed tail
          const lastDoubleNewline = buffer.lastIndexOf('\n\n');
          if (lastDoubleNewline >= 0) {
            buffer = buffer.slice(lastDoubleNewline + 2);
          }

          for (const sse of events) {
            try {
              const payload = JSON.parse(sse.data);
              switch (sse.event) {
                case 'session':
                  setSessionId(payload.session_id);
                  setSessionTitle(payload.title);
                  break;
                case 'token':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: (m.content || '') + payload.content }
                        : m,
                    ),
                  );
                  break;
                case 'tool_call':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? {
                            ...m,
                            toolCalls: [
                              ...(m.toolCalls || []),
                              { name: payload.name, arguments: payload.arguments, loading: true },
                            ],
                          }
                        : m,
                    ),
                  );
                  break;
                case 'tool_result':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? {
                            ...m,
                            toolCalls: (m.toolCalls || []).map((tc) =>
                              tc.name === payload.name && tc.loading
                                ? { ...tc, summary: payload.summary, loading: false }
                                : tc,
                            ),
                          }
                        : m,
                    ),
                  );
                  break;
                case 'done':
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false } : m)),
                  );
                  break;
                case 'error':
                  setError(payload.message);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, isStreaming: false, content: m.content || payload.message }
                        : m,
                    ),
                  );
                  break;
              }
            } catch {
              // skip malformed events
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Unknown error');
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false } : m)),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        refreshSessions();
      }
    },
    [isStreaming, sessionId, refreshSessions],
  );

  const loadSession = useCallback(async (id: string) => {
    try {
      const data = await getSessionMessages(id);
      const loaded: InsightsMessage[] = data.messages
        .filter((m) => m.role !== 'tool')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          toolCalls: m.tool_calls?.map((tc) => ({
            name: tc.name,
            arguments: tc.arguments,
            loading: false,
          })),
        }));
      setMessages(loaded);
      setSessionId(id);
    } catch {
      setError('Failed to load session');
    }
  }, []);

  const newSession = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setSessionTitle(null);
    setError(null);
    setIsStreaming(false);
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await deleteSessionApi(id);
        if (sessionId === id) newSession();
        setSessions((prev) => prev.filter((s) => s.id !== id));
      } catch {
        setError('Failed to delete session');
      }
    },
    [sessionId, newSession],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
  }, []);

  return {
    messages,
    sessionId,
    sessionTitle,
    isStreaming,
    sessions,
    error,
    sendMessage,
    loadSession,
    newSession,
    deleteSession,
    refreshSessions,
    stopStreaming,
  };
}
