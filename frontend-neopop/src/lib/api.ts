/**
 * API layer — rewired from HTTP/axios to direct IndexedDB service calls.
 *
 * All function signatures and return types are preserved so that hooks/useApi.ts
 * and page components require zero changes.
 */

// @ts-ignore
import { db, generateUUID, seedCategories } from './db';
// @ts-ignore
import { processStatement } from '../services/statementProcessor';
// @ts-ignore
import {
  computeNetSpend,
  getSummary as analyticsGetSummary,
  getCategoryBreakdown,
  getMonthlyTrends,
  getTopMerchants,
} from '../services/analytics';
// @ts-ignore
import { categorize } from '../services/categorizer';
import type {
  Bank,
  Card,
  CategoryBreakdown,
  MerchantSpend,
  MonthlyTrend,
  Statement,
  Transaction,
} from './types';

// ── Types (preserved from original) ────────────────────────

export interface Settings {
  configured: boolean;
  name?: string;
  dobDay?: string;
  dobMonth?: string;
  dobYear?: string;
  watchFolder?: string;
  cards?: { bank: Bank; last4: string }[];
}

export interface SetupProfilePayload {
  name: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  cards: { bank: Bank; last4: string }[];
  watchFolder: string;
}

export interface GetTransactionsParams {
  card?: string;
  cards?: string;
  from?: string;
  to?: string;
  category?: string;
  search?: string;
  direction?: string;
  amount_min?: number;
  amount_max?: number;
  limit?: number;
  offset?: number;
  tags?: string;
}

export interface GetTransactionsResponse {
  transactions: Transaction[];
  total: number;
  totalAmount?: number;
}

export interface CardSpendItem {
  bank: string;
  last4: string;
  amount: number;
  count: number;
}

export interface GetSummaryResponse {
  totalSpend: number;
  deltaPercent: number;
  deltaLabel?: string;
  period: string;
  sparklineData: { value: number }[];
  cardBreakdown?: CardSpendItem[];
  creditLimit?: number;
  avgMonthlySpend?: number;
  monthsInRange?: number;
}

export interface GetCategoriesResponse {
  breakdown: CategoryBreakdown[];
}

export interface GetTrendsResponse {
  trends: MonthlyTrend[];
}

export interface GetMerchantsResponse {
  merchants: MerchantSpend[];
}

// ── Settings ─────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const settingsRecord = await (db as any).settings.toCollection().first();
  if (!settingsRecord) return { configured: false };

  const cards = await (db as any).cards.toArray();
  return {
    configured: true,
    name: settingsRecord.name,
    dobDay: settingsRecord.dob_day,
    dobMonth: settingsRecord.dob_month,
    dobYear: settingsRecord.dob_year,
    watchFolder: settingsRecord.watch_folder,
    cards: cards.map((c: any) => ({ bank: c.bank as Bank, last4: c.last4 })),
  };
}

export async function updateSettings(payload: {
  name?: string;
  dobDay?: string;
  dobMonth?: string;
  dobYear?: string;
  watchFolder?: string;
  cards?: { bank: string; last4: string; name?: string }[];
}): Promise<{ status: string }> {
  const existing = await (db as any).settings.toCollection().first();
  if (!existing) throw new Error('Setup not completed');

  const updates: Record<string, any> = {};
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.dobDay !== undefined) updates.dob_day = payload.dobDay;
  if (payload.dobMonth !== undefined) updates.dob_month = payload.dobMonth;
  if (payload.dobYear !== undefined) updates.dob_year = payload.dobYear;
  if (payload.watchFolder !== undefined) updates.watch_folder = payload.watchFolder;

  await (db as any).settings.update(existing.id, updates);

  if (payload.cards) {
    const existingCards = await (db as any).cards.toArray();
    const existingSet = new Set(existingCards.map((c: any) => `${c.bank.toLowerCase()}|${c.last4}`));
    for (const card of payload.cards) {
      const bank = card.bank.toLowerCase();
      const last4 = card.last4.length >= 4 ? card.last4.slice(-4) : card.last4;
      if (!existingSet.has(`${bank}|${last4}`)) {
        await (db as any).cards.add({
          id: generateUUID(),
          bank,
          last4,
          name: card.name || null,
        });
      }
    }
  }

  return { status: 'success' };
}

export async function setupProfile(payload: SetupProfilePayload): Promise<Settings> {
  await seedCategories();

  await (db as any).settings.add({
    id: generateUUID(),
    name: payload.name,
    dob_day: payload.dobDay,
    dob_month: payload.dobMonth,
    dob_year: payload.dobYear,
    watch_folder: payload.watchFolder || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  for (const card of payload.cards) {
    await (db as any).cards.add({
      id: generateUUID(),
      bank: card.bank.toLowerCase(),
      last4: card.last4.length >= 4 ? card.last4.slice(-4) : card.last4,
      name: null,
    });
  }

  return getSettings();
}

// ── Statements ───────────────────────────────────────────────

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
  password?: string
): Promise<UploadStatementResult> {
  const result = await processStatement(file, bank || undefined, password || undefined);
  return result as UploadStatementResult;
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
  password?: string
): Promise<BulkUploadResult> {
  const results: BulkUploadResult = {
    status: 'ok',
    total: files.length,
    success: 0,
    failed: 0,
    duplicate: 0,
    card_not_found: 0,
    parse_error: 0,
    skipped: 0,
  };

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      results.skipped++;
      continue;
    }
    try {
      const r = await processStatement(file, bank || undefined, password || undefined);
      const s = r.status;
      if (s === 'success') results.success++;
      else if (s === 'duplicate') results.duplicate++;
      else if (s === 'card_not_found') results.card_not_found++;
      else if (s === 'parse_error') results.parse_error++;
      else results.failed++;
    } catch {
      results.failed++;
    }
  }

  return results;
}

export async function getStatements(): Promise<Statement[]> {
  const stmts = await (db as any).statements
    .orderBy('imported_at')
    .reverse()
    .toArray();

  return stmts.map((s: any) => ({
    id: s.id,
    bank: s.bank as Bank,
    cardLast4: s.card_last4 || '',
    periodStart: s.period_start ?? '',
    periodEnd: s.period_end ?? '',
    transactionCount: s.transaction_count,
    totalSpend: s.total_spend,
    status: (s.status as 'success' | 'parse_error') ?? 'success',
    importedAt: s.imported_at ?? '',
  }));
}

export async function deleteStatement(
  statementId: string
): Promise<{ status: string; message: string }> {
  // Delete associated transactions and their tags
  const txns = await (db as any).transactions
    .where('statement_id')
    .equals(statementId)
    .toArray();
  const txnIds = txns.map((t: any) => t.id);

  if (txnIds.length) {
    await (db as any).transactionTags
      .where('transaction_id')
      .anyOf(txnIds)
      .delete();
    await (db as any).transactions
      .where('statement_id')
      .equals(statementId)
      .delete();
  }

  await (db as any).statements.delete(statementId);
  return { status: 'ok', message: 'Statement and transactions deleted' };
}

export async function reparseStatement(
  _statementId: string
): Promise<{ status: string; count?: number; bank?: string }> {
  // Cannot reparse without stored file in browser
  return {
    status: 'error',
    count: 0,
    bank: undefined,
  };
}

export async function reparseAllStatements(): Promise<{
  status: string;
  total: number;
  success: number;
  failed: number;
  skipped: number;
}> {
  // Cannot reparse without stored files in browser
  return { status: 'ok', total: 0, success: 0, failed: 0, skipped: 0 };
}

// ── Transactions ─────────────────────────────────────────────

export async function getTransactions(
  params?: GetTransactionsParams
): Promise<GetTransactionsResponse> {
  let txns = await (db as any).transactions.toArray();

  // Apply filters
  if (params?.cards) {
    const cardIds = params.cards.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (cardIds.length) txns = txns.filter((t: any) => cardIds.includes(t.card_id));
  } else if (params?.card) {
    txns = txns.filter((t: any) => t.card_id === params.card);
  }
  if (params?.from) txns = txns.filter((t: any) => t.date >= params.from!);
  if (params?.to) txns = txns.filter((t: any) => t.date <= params.to!);
  if (params?.category) txns = txns.filter((t: any) => t.category === params.category);
  if (params?.direction === 'incoming') txns = txns.filter((t: any) => t.type === 'credit');
  else if (params?.direction === 'outgoing') txns = txns.filter((t: any) => t.type === 'debit');
  if (params?.amount_min != null) txns = txns.filter((t: any) => t.amount >= params.amount_min!);
  if (params?.amount_max != null) txns = txns.filter((t: any) => t.amount <= params.amount_max!);
  if (params?.search) {
    const lower = params.search.toLowerCase();
    txns = txns.filter(
      (t: any) =>
        (t.merchant || '').toLowerCase().includes(lower) ||
        (t.description || '').toLowerCase().includes(lower),
    );
  }
  if ((params as any)?.tags) {
    const tagNames = ((params as any).tags as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (tagNames.length) {
      const tagRecords = await (db as any).transactionTags.where('tag').anyOf(tagNames).toArray();
      const txnIds = new Set(tagRecords.map((t: any) => t.transaction_id));
      txns = txns.filter((t: any) => txnIds.has(t.id));
    }
  }

  // Net spend (excluding cc_payment)
  const metricsFiltered = txns.filter((t: any) => t.category !== 'cc_payment');
  const totalCount = metricsFiltered.length;
  let totalAmount = 0;
  for (const t of metricsFiltered) {
    totalAmount += t.type === 'debit' ? t.amount : -t.amount;
  }
  totalAmount = Math.round(totalAmount * 100) / 100;

  // Sort and paginate
  txns.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 100;
  const paged = txns.slice(offset, offset + limit);

  // Load tags for each transaction
  const pagedIds = paged.map((t: any) => t.id);
  const allTags = pagedIds.length
    ? await (db as any).transactionTags.where('transaction_id').anyOf(pagedIds).toArray()
    : [];
  const tagMap = new Map<string, string[]>();
  for (const tag of allTags) {
    if (!tagMap.has(tag.transaction_id)) tagMap.set(tag.transaction_id, []);
    tagMap.get(tag.transaction_id)!.push(tag.tag);
  }

  return {
    transactions: paged.map((r: any) => ({
      id: r.id,
      statementId: r.statement_id,
      date: r.date ?? '',
      merchant: r.merchant,
      amount: r.amount,
      type: r.type,
      category: r.category,
      description: r.description,
      bank: r.bank,
      cardLast4: r.card_last4,
      cardId: r.card_id,
      tags: tagMap.get(r.id) || [],
    })),
    total: totalCount,
    totalAmount,
  };
}

// ── Cards ────────────────────────────────────────────────────

export async function getCards(): Promise<Card[]> {
  const cards = await (db as any).cards.toArray();
  return cards.map((c: any) => ({
    id: c.id,
    bank: c.bank as Bank,
    last4: c.last4,
    name: c.name,
  }));
}

export async function deleteCard(
  cardId: string
): Promise<{ status: string; message: string }> {
  await (db as any).cards.delete(cardId);
  return { status: 'ok', message: 'Card deleted' };
}

// ── Analytics ────────────────────────────────────────────────

export interface AnalyticsParams {
  from?: string;
  to?: string;
  cards?: string;
  categories?: string;
  tags?: string;
  direction?: string;
  amount_min?: number;
  amount_max?: number;
}

function buildAnalyticsFilters(params?: AnalyticsParams) {
  if (!params) return {};
  return {
    fromDate: params.from,
    toDate: params.to,
    cardIds: params.cards?.split(',').map((s) => s.trim()).filter(Boolean),
    categories: params.categories?.split(',').map((s) => s.trim()).filter(Boolean),
    tags: params.tags?.split(',').map((s) => s.trim()).filter(Boolean),
    direction: params.direction,
    amountMin: params.amount_min,
    amountMax: params.amount_max,
  };
}

export async function getSummary(
  params?: AnalyticsParams
): Promise<GetSummaryResponse> {
  const filters = buildAnalyticsFilters(params);
  const summary = await analyticsGetSummary(filters);
  const totalSpend = summary.total_spend;

  // Delta computation
  const today = new Date();
  let deltaPercent = 0;
  let deltaLabel = 'vs last month';

  if (params?.from && params?.to) {
    const fromD = new Date(params.from);
    const toD = new Date(params.to);
    const spanDays = (toD.getTime() - fromD.getTime()) / (1000 * 60 * 60 * 24);
    const prevEnd = new Date(fromD.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - spanDays * 86400000);
    const prevSpend = await computeNetSpend({
      ...filters,
      fromDate: prevStart.toISOString().slice(0, 10),
      toDate: prevEnd.toISOString().slice(0, 10),
    });
    deltaPercent = prevSpend > 0 ? Math.round(((totalSpend - prevSpend) / prevSpend) * 100) : 0;
    deltaLabel = 'vs prior period';
  } else {
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      .toISOString()
      .slice(0, 10);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 10);

    const currentSpend = await computeNetSpend({ ...filters, fromDate: thisMonthStart, toDate: today.toISOString().slice(0, 10) });
    const prevSpend = await computeNetSpend({ ...filters, fromDate: lastMonthStart, toDate: lastMonthEnd });
    deltaPercent = prevSpend > 0 ? Math.round(((currentSpend - prevSpend) / prevSpend) * 100) : 0;
  }

  // Trends for sparkline
  const trendData: any[] = await getMonthlyTrends(6);
  const sparklineData = trendData.length
    ? trendData.map((t: any) => ({ value: t.spend }))
    : [{ value: 0 }];

  // Credit limit from latest statements
  const stmts = await (db as any).statements.toArray();
  const withLimit = stmts.filter((s: any) => s.credit_limit);
  const byCard = new Map<string, number>();
  for (const s of withLimit) {
    const key = `${s.bank}|${s.card_last4}`;
    byCard.set(key, s.credit_limit);
  }
  const creditLimit = [...byCard.values()].reduce((a, b) => a + b, 0);

  // Avg monthly spend
  const months = (params?.from && params?.to)
    ? Math.max(
        (new Date(params.to).getFullYear() - new Date(params.from).getFullYear()) * 12 +
          (new Date(params.to).getMonth() - new Date(params.from).getMonth()) + 1,
        1,
      )
    : 1;
  const avgMonthlySpend = months ? Math.round((totalSpend / months) * 100) / 100 : 0;

  return {
    totalSpend,
    deltaPercent,
    deltaLabel,
    period: 'This month',
    sparklineData,
    cardBreakdown: summary.card_breakdown.map((c: any) => ({
      bank: c.bank,
      last4: c.card_last4,
      amount: c.spend,
      count: c.count,
    })),
    creditLimit,
    avgMonthlySpend,
    monthsInRange: months,
  };
}

export async function getCategories(
  params?: AnalyticsParams
): Promise<GetCategoriesResponse> {
  const filters = buildAnalyticsFilters(params);
  const result = await getCategoryBreakdown(filters);
  return {
    breakdown: result.categories.map((c: any) => ({
      category: c.category,
      amount: c.amount,
      percentage: c.percentage,
      count: c.count,
    })),
  };
}

export async function getTrends(
  params?: AnalyticsParams & { months?: number }
): Promise<GetTrendsResponse> {
  const months = (params as any)?.months ?? 12;
  const data = await getMonthlyTrends(months);
  return {
    trends: data.map((t: any) => ({ month: t.month, spend: t.spend })),
  };
}

export async function getMerchants(
  params?: AnalyticsParams & { limit?: number }
): Promise<GetMerchantsResponse> {
  const filters = buildAnalyticsFilters(params);
  const limit = (params as any)?.limit ?? 10;
  const data = await getTopMerchants(filters, limit);
  return {
    merchants: data.map((m: any) => ({
      merchant: m.merchant,
      amount: m.spend,
      count: m.count,
    })),
  };
}

export interface StatementPeriod {
  bank: string;
  cardLast4: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalAmountDue: number | null;
  totalSpend: number | null;
  creditLimit: number | null;
}

export async function getStatementPeriods(
  params?: { from?: string; to?: string }
): Promise<{ periods: StatementPeriod[] }> {
  let stmts = await (db as any).statements.toArray();
  stmts = stmts.filter(
    (s: Record<string, any>) => s.status === 'success' || !s.status,
  );

  if (params?.from) stmts = stmts.filter((s: any) => s.period_end >= params.from!);
  if (params?.to) stmts = stmts.filter((s: any) => s.period_start <= params.to!);

  stmts.sort((a: any, b: any) => (b.period_start || '').localeCompare(a.period_start || ''));

  const periods = [];
  for (const s of stmts) {
    let netSpend = s.total_spend;
    if (s.period_start && s.period_end) {
      netSpend = await computeNetSpend({
        fromDate: s.period_start,
        toDate: s.period_end,
        bank: s.bank,
        cardLast4: s.card_last4,
      });
    }
    periods.push({
      bank: s.bank,
      cardLast4: s.card_last4,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      totalAmountDue: s.total_amount_due,
      totalSpend: netSpend,
      creditLimit: s.credit_limit,
    });
  }

  return { periods };
}

// ── Processing Logs (no-op in browser, kept for interface compat) ──

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
  return [];
}

export async function acknowledgeProcessingLog(_logId: string): Promise<void> {
  // No-op
}

// ── Transaction Tags ─────────────────────────────────────────

export async function getTransactionTags(
  transactionId: string
): Promise<string[]> {
  const tags = await (db as any).transactionTags
    .where('transaction_id')
    .equals(transactionId)
    .toArray();
  return tags.map((t: any) => t.tag);
}

export async function updateTransactionTags(
  transactionId: string,
  tags: string[]
): Promise<string[]> {
  const validated = tags
    .map((t) => String(t).trim().slice(0, 10))
    .filter(Boolean)
    .slice(0, 3);

  await (db as any).transactionTags
    .where('transaction_id')
    .equals(transactionId)
    .delete();

  for (const tag of validated) {
    await (db as any).transactionTags.add({
      id: generateUUID(),
      transaction_id: transactionId,
      tag,
    });
  }

  return validated;
}

// ── Category Definitions ─────────────────────────────────────

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
  const cats = await (db as any).categoryDefinitions
    .orderBy('is_prebuilt')
    .reverse()
    .toArray();
  return cats.map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    keywords: c.keywords || '',
    color: c.color,
    icon: c.icon,
    is_prebuilt: !!c.is_prebuilt,
  }));
}

export async function createCategory(payload: {
  name: string;
  keywords: string;
  color: string;
}): Promise<CategoryResponse> {
  const customCount = await (db as any).categoryDefinitions
    .filter((c: any) => !c.is_prebuilt)
    .count();
  if (customCount >= 20) throw new Error('Maximum 20 custom categories allowed');

  const name = payload.name.trim();
  if (!name) throw new Error('Category name is required');
  const slug = name.toLowerCase().replace(/\s+/g, '_');

  const existing = await (db as any).categoryDefinitions
    .where('slug')
    .equals(slug)
    .first();
  if (existing) throw new Error('Category with this name already exists');

  const id = generateUUID();
  const cat = {
    id,
    name,
    slug,
    keywords: payload.keywords.trim(),
    color: payload.color.trim() || '#9CA3AF',
    icon: 'MoreHorizontal',
    is_prebuilt: 0,
    created_at: new Date().toISOString(),
  };
  await (db as any).categoryDefinitions.add(cat);

  // Recategorize
  await recategorizeAll();

  return { ...cat, is_prebuilt: false };
}

export async function updateCategory(
  categoryId: string,
  payload: { name?: string; keywords?: string; color?: string }
): Promise<CategoryResponse> {
  const cat = await (db as any).categoryDefinitions.get(categoryId);
  if (!cat) throw new Error('Category not found');

  if (cat.is_prebuilt) {
    if (payload.name && payload.name.trim() !== cat.name) {
      throw new Error('Cannot change name of prebuilt category');
    }
    if (payload.color) cat.color = payload.color.trim() || cat.color;
    if (payload.keywords !== undefined) cat.keywords = payload.keywords.trim();
  } else {
    if (payload.name !== undefined) {
      const name = payload.name.trim();
      if (!name) throw new Error('Category name cannot be empty');
      cat.name = name;
      cat.slug = name.toLowerCase().replace(/\s+/g, '_');
    }
    if (payload.keywords !== undefined) cat.keywords = payload.keywords.trim();
    if (payload.color !== undefined) cat.color = payload.color.trim() || cat.color;
  }

  await (db as any).categoryDefinitions.put(cat);

  if (payload.keywords !== undefined) {
    await recategorizeAll();
  }

  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    keywords: cat.keywords || '',
    color: cat.color,
    icon: cat.icon,
    is_prebuilt: !!cat.is_prebuilt,
  };
}

export async function deleteCategoryById(
  categoryId: string
): Promise<{ status: string }> {
  const cat = await (db as any).categoryDefinitions.get(categoryId);
  if (!cat) throw new Error('Category not found');
  if (cat.is_prebuilt) throw new Error('Cannot delete prebuilt categories');
  await (db as any).categoryDefinitions.delete(categoryId);
  return { status: 'ok' };
}

export async function triggerRecategorize(): Promise<{
  status: string;
  updated: number;
}> {
  const updated = await recategorizeAll();
  return { status: 'ok', updated };
}

async function recategorizeAll(): Promise<number> {
  const txns = await (db as any).transactions.toArray();
  let updated = 0;
  for (const txn of txns) {
    const newCat = await categorize(txn.merchant);
    if (newCat !== txn.category) {
      await (db as any).transactions.update(txn.id, { category: newCat });
      updated++;
    }
  }
  return updated;
}

// ── Tag Definitions ──────────────────────────────────────────

export interface TagDefinitionResponse {
  id: string;
  name: string;
}

export async function getTagDefinitions(): Promise<TagDefinitionResponse[]> {
  const tags = await (db as any).tagDefinitions.orderBy('name').toArray();
  return tags.map((t: any) => ({ id: t.id, name: t.name }));
}

export async function createTagDefinition(
  name: string
): Promise<TagDefinitionResponse> {
  const count = await (db as any).tagDefinitions.count();
  if (count >= 20) throw new Error('Maximum 20 tags allowed');
  const trimmed = name.trim().slice(0, 12);
  if (!trimmed) throw new Error('Tag name is required');

  const existing = await (db as any).tagDefinitions
    .where('name')
    .equals(trimmed)
    .first();
  if (existing) throw new Error('Tag with this name already exists');

  const id = generateUUID();
  await (db as any).tagDefinitions.add({ id, name: trimmed });
  return { id, name: trimmed };
}

export async function deleteTagDefinition(
  tagId: string
): Promise<{ status: string }> {
  const tag = await (db as any).tagDefinitions.get(tagId);
  if (!tag) throw new Error('Tag not found');
  await (db as any).tagDefinitions.delete(tagId);
  return { status: 'ok' };
}
