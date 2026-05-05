import { api } from './api';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const INSIGHTS_CHAT_URL = isTauri
  ? 'http://127.0.0.1:8000/api/insights/chat'
  : '/api/insights/chat';

export interface InsightsStatus {
  enabled: boolean;
  provider: string;
  model: string;
  connected: boolean;
  available_models: string[];
  error: string | null;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  provider: string;
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: string;
  role: string;
  content: string | null;
  tool_calls: { id: string; name: string; arguments: Record<string, unknown> }[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  created_at: string;
}

export const getInsightsStatus = () =>
  api.get<InsightsStatus>('/insights/status').then((r) => r.data);

export const getInsightsSessions = () =>
  api.get<{ sessions: ChatSessionSummary[] }>('/insights/sessions').then((r) => r.data);

export const getSessionMessages = (id: string) =>
  api.get<{ messages: ChatMessageResponse[] }>(`/insights/sessions/${id}/messages`).then((r) => r.data);

export const deleteSessionApi = (id: string) => api.delete(`/insights/sessions/${id}`);

export const getInsightsModels = () =>
  api.get<{ models: string[]; error?: string }>('/insights/models').then((r) => r.data);

export const testInsightsConnection = () =>
  api.post<{ success: boolean; error?: string; latency_ms: number }>('/insights/test').then((r) => r.data);

export const saveApiKey = (provider: string, apiKey: string) =>
  api.post('/insights/api-key', { provider, api_key: apiKey });

export const deleteApiKey = (provider: string) => api.delete(`/insights/api-key/${provider}`);

export const getApiKeyStatus = (provider: string) =>
  api.get<{ configured: boolean }>(`/insights/api-key/${provider}/status`).then((r) => r.data);
