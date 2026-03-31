import axios from 'axios';
import type {
  Bank,
  Card,
  Category,
  CategoryBreakdown,
  MerchantSpend,
  MonthlyTrend,
  Source,
  Statement,
  Transaction,
} from '@/lib/types';

export interface Settings {
  configured: boolean;
  name?: string;
  dobDay?: string;
  dobMonth?: string;
  dobYear?: string;
  watchFolder?: string;
  /** Optional UI preference: INR | USD */
  displayCurrency?: string;
  cards?: { bank: Bank; last4: string }[];
}

/** Raw API response from GET /settings */
export interface SettingsApiResponse {
  setup_complete?: boolean;
  configured?: boolean;
  settings?: {
    name?: string;
    dob_day?: string;
    dob_month?: string;
    dob_year?: string;
    watch_folder?: string;
    display_currency?: string | null;
  };
  cards?: { id: string; bank: Bank; last4: string; name?: string }[];
}

export interface SetupProfilePayload {
  name: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  cards: { bank: Bank; last4: string }[];
  watchFolder: string;
  displayCurrency?: string;
}

export interface GetTransactionsParams {
  card?: string;
  cards?: string;
  /** Comma-separated bank:last4 for BANK transactions */
  bank_accounts?: string;
  from?: string;
  to?: string;
  category?: Category;
  search?: string;
  tags?: string;
  direction?: string;
  source?: string;
  amount_min?: number;
  amount_max?: number;
  limit?: number;
  offset?: number;
}

export interface GetTransactionsResponse {
  transactions: Transaction[];
  total: number;
  totalAmount?: number | null;
  totalsByCurrency?: { currency: string; amount: number }[];
  mixedCurrency?: boolean;
}

export interface CardSpendItem {
  bank: string;
  last4: string;
  amount: number;
  count: number;
  currency?: string;
}

export interface CurrencyTotal {
  currency: string;
  amount: number;
}

export interface GetSummaryResponse {
  totalSpend: number | null;
  totalSpendByCurrency?: CurrencyTotal[];
  mixedCurrency?: boolean;
  deltaPercent: number | null;
  deltaLabel?: string;
  period: string;
  sparklineData: { value: number }[];
  sparklineByCurrency?: { currency: string; sparklineData: { value: number }[] }[];
  cardBreakdown?: CardSpendItem[];
  creditLimit?: number | null;
  creditLimitByCurrency?: CurrencyTotal[];
  avgMonthlySpend?: number | null;
  monthsInRange?: number;
}

export interface CategoryBlockByCurrency {
  currency: string;
  breakdown: CategoryBreakdown[];
}

export interface GetCategoriesResponse {
  mixedCurrency?: boolean;
  currency?: string;
  breakdown?: CategoryBreakdown[];
  byCurrency?: CategoryBlockByCurrency[];
}

export interface TrendsBlockByCurrency {
  currency: string;
  trends: MonthlyTrend[];
}

export interface GetTrendsResponse {
  mixedCurrency?: boolean;
  currency?: string;
  trends?: MonthlyTrend[];
  trendsByCurrency?: TrendsBlockByCurrency[];
}

export interface MerchantsBlockByCurrency {
  currency: string;
  merchants: MerchantSpend[];
}

export interface GetMerchantsResponse {
  mixedCurrency?: boolean;
  currency?: string;
  merchants?: MerchantSpend[];
  merchantsByCurrency?: MerchantsBlockByCurrency[];
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const api = axios.create({
  baseURL: isTauri ? 'http://127.0.0.1:8000/api' : '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export async function getSettings(): Promise<Settings> {
  const { data } = await api.get<SettingsApiResponse>('/settings');
  if (!data) return { configured: false };
  const setupComplete = !!data.setup_complete || !!data.configured;
  return {
    configured: setupComplete,
    name: data.settings?.name,
    dobDay: data.settings?.dob_day,
    dobMonth: data.settings?.dob_month,
    dobYear: data.settings?.dob_year,
    watchFolder: data.settings?.watch_folder,
    displayCurrency: data.settings?.display_currency ?? undefined,
    cards: data.cards?.map((c) => ({ bank: c.bank as Bank, last4: c.last4 })),
  };
}

export async function updateSettings(payload: {
  name?: string;
  dobDay?: string;
  dobMonth?: string;
  dobYear?: string;
  watchFolder?: string;
  displayCurrency?: string;
  cards?: { bank: string; last4: string }[];
}): Promise<{ status: string }> {
  const body: Record<string, unknown> = {
    name: payload.name,
    dob_day: payload.dobDay,
    dob_month: payload.dobMonth,
    dob_year: payload.dobYear,
    watch_folder: payload.watchFolder,
  };
  if (payload.displayCurrency !== undefined) {
    body.display_currency = payload.displayCurrency || null;
  }
  if (payload.cards) {
    body.cards = payload.cards.map((c) => ({ bank: c.bank, last4: c.last4 }));
  }
  const { data } = await api.put<{ status: string }>('/settings', body);
  return data;
}

export async function setupProfile(payload: SetupProfilePayload): Promise<Settings> {
  const body: Record<string, unknown> = {
    name: payload.name,
    dob_day: payload.dobDay,
    dob_month: payload.dobMonth,
    dob_year: payload.dobYear,
    watch_folder: payload.watchFolder,
    cards: payload.cards,
  };
  if (payload.displayCurrency !== undefined) {
    body.display_currency = payload.displayCurrency || null;
  }
  const { data } = await api.post<Settings>('/settings/setup', body);
  return data;
}

export interface UploadStatementResult {
  status: string;
  message?: string;
  count?: number;
  bank?: string;
  period?: { start: string | null; end: string | null };
}

export async function uploadStatement(
  file: File,
  bank?: Bank,
  password?: string,
  source?: Source
): Promise<UploadStatementResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (bank) formData.append('bank', bank);
  if (password) formData.append('password', password);
  if (source) formData.append('source', source);
  const { data } = await api.post<UploadStatementResult>(
    '/statements/upload',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }
  );
  return data;
}

export interface BulkUploadResult {
  status: string;
  total: number;
  success: number;
  failed: number;
  duplicate: number;
  card_not_found: number;
  parse_error: number;
  skipped: number;
}

export async function uploadStatementsBulk(
  files: File[],
  bank?: Bank,
  password?: string,
  source?: Source
): Promise<BulkUploadResult> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  if (bank) formData.append('bank', bank);
  if (password) formData.append('password', password);
  if (source) formData.append('source', source);
  const { data } = await api.post<BulkUploadResult>(
    '/statements/upload-bulk',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    }
  );
  return data;
}

interface StatementRaw {
  id: string;
  bank: string;
  card_last4: string;
  period_start: string | null;
  period_end: string | null;
  transaction_count: number;
  total_spend: number;
  currency?: string | null;
  source: string | null;
  status: string | null;
  imported_at: string | null;
}

export interface GetStatementsParams {
  source?: Source;
  /** Comma-separated bank slugs */
  banks?: string;
  from?: string;
  to?: string;
}

export async function getStatements(params?: Source | GetStatementsParams): Promise<Statement[]> {
  const q: Record<string, string> = {};
  if (typeof params === 'string' || params === undefined) {
    if (params) q.source = params;
  } else {
    if (params.source) q.source = params.source;
    if (params.banks) q.banks = params.banks;
    if (params.from) q.from = params.from;
    if (params.to) q.to = params.to;
  }
  const { data } = await api.get<StatementRaw[]>('/statements', { params: q });
  return data.map((s) => ({
    id: s.id,
    bank: s.bank as Bank,
    cardLast4: s.card_last4,
    periodStart: s.period_start ?? '',
    periodEnd: s.period_end ?? '',
    transactionCount: s.transaction_count,
    totalSpend: s.total_spend,
    currency: (s.currency || 'INR').toUpperCase().slice(0, 3),
    source: (s.source as Source) ?? 'CC',
    status: (s.status as 'success' | 'parse_error' | 'password_needed') ?? 'success',
    importedAt: s.imported_at ?? '',
  }));
}

export async function retryWithPassword(
  statementId: string,
  password: string,
): Promise<UploadStatementResult> {
  const { data } = await api.post<UploadStatementResult>(
    `/statements/${statementId}/reparse-with-password`,
    { password },
    { timeout: 60000 },
  );
  return data;
}

export async function getBankAccountKeys(): Promise<{ id: string; bank: string; last4: string }[]> {
  const { data } = await api.get<{ accounts: { id: string; bank: string; last4: string }[] }>(
    '/transactions/bank-accounts'
  );
  return Array.isArray(data?.accounts) ? data.accounts : [];
}

export async function getTransactions(
  params?: GetTransactionsParams
): Promise<GetTransactionsResponse> {
  const { data } = await api.get<GetTransactionsResponse>('/transactions', {
    params,
  });
  return data;
}

export async function getCards(): Promise<Card[]> {
  const { data } = await api.get<Card[]>('/cards');
  return data;
}

export async function deleteCard(cardId: string): Promise<{ status: string; message: string }> {
  const { data } = await api.delete<{ status: string; message: string }>(`/cards/${cardId}`);
  return data;
}

export interface StatementPeriod {
  bank: string;
  cardLast4: string;
  currency?: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalAmountDue: number | null;
  totalSpend: number | null;
  creditLimit: number | null;
}

export async function getStatementPeriods(params?: { from?: string; to?: string }): Promise<{ periods: StatementPeriod[] }> {
  const { data } = await api.get<{ periods: StatementPeriod[] }>('/analytics/statement-periods', { params });
  return data;
}

export interface AnalyticsParams {
  from?: string;
  to?: string;
  cards?: string;
  categories?: string;
  tags?: string;
  direction?: string;
  amount_min?: number;
  amount_max?: number;
  source?: string;
  bank_accounts?: string;
}

export async function getSummary(params?: AnalyticsParams): Promise<GetSummaryResponse> {
  const { data } = await api.get<GetSummaryResponse>('/analytics/summary', {
    params,
  });
  return data;
}

export async function getCategories(params?: AnalyticsParams): Promise<GetCategoriesResponse> {
  const { data } = await api.get<GetCategoriesResponse>(
    '/analytics/categories',
    { params }
  );
  return data;
}

export async function getTrends(params?: AnalyticsParams): Promise<GetTrendsResponse> {
  const { data } = await api.get<GetTrendsResponse>('/analytics/trends', {
    params,
  });
  return data;
}

export async function getMerchants(params?: AnalyticsParams): Promise<GetMerchantsResponse> {
  const { data } = await api.get<GetMerchantsResponse>(
    '/analytics/merchants',
    { params }
  );
  return data;
}

export interface ProcessingLog {
  id: string;
  fileName: string;
  status: string;
  message: string | null;
  bank: string | null;
  transactionCount: number;
  createdAt: string | null;
}

export async function getProcessingLogs(): Promise<ProcessingLog[]> {
  const { data } = await api.get<ProcessingLog[]>('/statements/processing-logs', {
    params: { unread_only: true },
  });
  return data;
}

export async function acknowledgeProcessingLog(logId: string): Promise<void> {
  await api.post(`/statements/processing-logs/${logId}/ack`);
}

export async function getTransactionTags(transactionId: string): Promise<string[]> {
  const { data } = await api.get<{ tags: string[] }>(`/transactions/${transactionId}/tags`);
  return data.tags;
}

export async function updateTransactionTags(transactionId: string, tags: string[]): Promise<string[]> {
  const { data } = await api.put<{ tags: string[] }>(`/transactions/${transactionId}/tags`, { tags });
  return data.tags;
}

export async function deleteStatement(statementId: string): Promise<{ status: string; message: string }> {
  const { data } = await api.delete<{ status: string; message: string }>(`/statements/${statementId}`);
  return data;
}

export async function reparseStatement(statementId: string): Promise<{ status: string; count?: number; bank?: string }> {
  const { data } = await api.post<{ status: string; count?: number; bank?: string }>(`/statements/${statementId}/reparse`);
  return data;
}

// Categories - unified
export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  keywords: string;
  color: string;
  icon: string;
  is_prebuilt: boolean;
}

export async function getAllCategories(): Promise<CategoryResponse[]> {
  const { data } = await api.get<CategoryResponse[]>('/categories/all');
  return data;
}

export async function createCategory(payload: { name: string; keywords: string; color: string }): Promise<CategoryResponse> {
  const { data } = await api.post<CategoryResponse>('/categories/custom', payload);
  return data;
}

export async function updateCategory(categoryId: string, payload: { name?: string; keywords?: string; color?: string }): Promise<CategoryResponse> {
  const { data } = await api.put<CategoryResponse>(`/categories/${categoryId}`, payload);
  return data;
}

export async function deleteCategoryById(categoryId: string): Promise<{ status: string }> {
  const { data } = await api.delete<{ status: string }>(`/categories/custom/${categoryId}`);
  return data;
}

export async function triggerRecategorize(): Promise<{ status: string; updated: number }> {
  const { data } = await api.post<{ status: string; updated: number }>('/categories/recategorize');
  return data;
}

// Tag definitions
export interface TagDefinitionResponse {
  id: string;
  name: string;
}

export async function getTagDefinitions(): Promise<TagDefinitionResponse[]> {
  const { data } = await api.get<TagDefinitionResponse[]>('/tags');
  return data;
}

export async function createTagDefinition(name: string): Promise<TagDefinitionResponse> {
  const { data } = await api.post<TagDefinitionResponse>('/tags', { name });
  return data;
}

export async function deleteTagDefinition(tagId: string): Promise<{ status: string }> {
  const { data } = await api.delete<{ status: string }>(`/tags/${tagId}`);
  return data;
}

export async function reparseAllStatements(): Promise<{ status: string; total: number; success: number; failed: number; skipped: number }> {
  const { data } = await api.post<{ status: string; total: number; success: number; failed: number; skipped: number }>('/statements/reparse-all', {}, { timeout: 300000 });
  return data;
}

export interface GmailStatusResponse {
  configured: boolean;
  connected: boolean;
  last_sync: string | null;
}

export async function getGmailStatus(): Promise<GmailStatusResponse> {
  const { data } = await api.get<GmailStatusResponse>('/gmail/status');
  return data;
}

export async function startGmailAuth(): Promise<{ auth_url: string }> {
  const { data } = await api.post<{ auth_url: string }>('/gmail/auth/start');
  return data;
}

export async function disconnectGmail(): Promise<{ status: string }> {
  const { data } = await api.post<{ status: string }>('/gmail/disconnect');
  return data;
}

export async function triggerGmailSync(): Promise<{
  status: string;
  messages_scanned?: number;
  attachments_queued?: number;
  reason?: string;
  seconds_remaining?: number;
}> {
  const { data } = await api.post('/gmail/sync', {}, { timeout: 120000 });
  return data;
}
