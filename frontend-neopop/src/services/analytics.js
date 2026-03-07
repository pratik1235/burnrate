/**
 * Analytics queries for spend data.
 * Port of backend/services/analytics.py (257 lines)
 *
 * Net spend formula: sum(debits) − sum(credits) WHERE category != 'cc_payment'
 */

import { db } from '../lib/db.js';

/**
 * @param {Object} [filters]
 * @param {string} [filters.fromDate]
 * @param {string} [filters.toDate]
 * @param {string[]} [filters.cardIds]
 * @param {string[]} [filters.categories]
 * @param {string} [filters.direction] 'incoming'|'outgoing'
 * @param {number} [filters.amountMin]
 * @param {number} [filters.amountMax]
 * @param {string[]} [filters.tags]
 * @param {string} [filters.bank]
 * @param {string} [filters.cardLast4]
 */

function applyFilters(txns, filters = {}) {
  let result = txns.filter((t) => t.category !== 'cc_payment');

  if (filters.fromDate) result = result.filter((t) => t.date >= filters.fromDate);
  if (filters.toDate) result = result.filter((t) => t.date <= filters.toDate);
  if (filters.cardIds?.length) result = result.filter((t) => filters.cardIds.includes(t.card_id));
  if (filters.categories?.length) result = result.filter((t) => filters.categories.includes(t.category));
  if (filters.direction === 'incoming') result = result.filter((t) => t.type === 'credit');
  if (filters.direction === 'outgoing') result = result.filter((t) => t.type === 'debit');
  if (filters.amountMin != null) result = result.filter((t) => t.amount >= filters.amountMin);
  if (filters.amountMax != null) result = result.filter((t) => t.amount <= filters.amountMax);
  if (filters.bank) result = result.filter((t) => t.bank === filters.bank);
  if (filters.cardLast4) result = result.filter((t) => t.card_last4 === filters.cardLast4);

  return result;
}

async function applyTagFilter(txns, tags) {
  if (!tags?.length) return txns;
  const tagRecords = await db.transactionTags
    .where('tag')
    .anyOf(tags)
    .toArray();
  const txnIds = new Set(tagRecords.map((t) => t.transaction_id));
  return txns.filter((t) => txnIds.has(t.id));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute net spend: sum(debits) − sum(credits), excluding cc_payment.
 */
export async function computeNetSpend(filters = {}) {
  let txns = await db.transactions.toArray();
  txns = applyFilters(txns, filters);
  txns = await applyTagFilter(txns, filters.tags);

  let net = 0;
  for (const t of txns) {
    net += t.type === 'debit' ? t.amount : -t.amount;
  }
  return round2(net);
}

/**
 * Total spend and card-wise breakdown.
 */
export async function getSummary(filters = {}) {
  const totalSpend = await computeNetSpend(filters);

  let txns = await db.transactions.toArray();
  txns = applyFilters(txns, filters);
  txns = await applyTagFilter(txns, filters.tags);

  // Per-card breakdown
  const cardMap = new Map();
  for (const t of txns) {
    const key = `${t.bank}|${t.card_last4}`;
    if (!cardMap.has(key)) cardMap.set(key, { bank: t.bank, card_last4: t.card_last4, net: 0, count: 0 });
    const entry = cardMap.get(key);
    entry.net += t.type === 'debit' ? t.amount : -t.amount;
    entry.count++;
  }

  return {
    total_spend: totalSpend,
    card_breakdown: [...cardMap.values()].map((c) => ({
      bank: c.bank,
      card_last4: c.card_last4,
      spend: round2(c.net),
      count: c.count,
    })),
  };
}

/**
 * Category breakdown with amounts and percentages.
 */
export async function getCategoryBreakdown(filters = {}) {
  let txns = await db.transactions.toArray();
  txns = applyFilters(txns, filters);
  txns = await applyTagFilter(txns, filters.tags);

  // Default to debits unless direction is 'incoming'
  if (filters.direction === 'incoming') {
    txns = txns.filter((t) => t.type === 'credit');
  } else {
    txns = txns.filter((t) => t.type === 'debit');
  }

  const catMap = new Map();
  for (const t of txns) {
    if (!catMap.has(t.category)) catMap.set(t.category, { amount: 0, count: 0 });
    const entry = catMap.get(t.category);
    entry.amount += t.amount;
    entry.count++;
  }

  const total = [...catMap.values()].reduce((s, c) => s + c.amount, 0);
  const categories = [...catMap.entries()].map(([cat, data]) => ({
    category: cat,
    amount: round2(data.amount),
    percentage: total > 0 ? round2((data.amount / total) * 100) : 0,
    count: data.count,
  }));

  return { total: round2(total), categories };
}

/**
 * Monthly net spend aggregation.
 */
export async function getMonthlyTrends(months = 12) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - months * 31);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  let txns = await db.transactions.toArray();
  txns = txns.filter(
    (t) => t.category !== 'cc_payment' && t.date >= startStr && t.date <= endStr,
  );

  const monthMap = new Map();
  for (const t of txns) {
    const month = t.date.slice(0, 7); // YYYY-MM
    if (!monthMap.has(month)) monthMap.set(month, 0);
    monthMap.set(month, monthMap.get(month) + (t.type === 'debit' ? t.amount : -t.amount));
  }

  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, spend]) => ({ month, spend: round2(spend) }));
}

/**
 * Top merchants by spend.
 */
export async function getTopMerchants(filters = {}, limit = 10) {
  let txns = await db.transactions.toArray();
  txns = applyFilters(txns, filters);
  txns = await applyTagFilter(txns, filters.tags);

  // Default to debits
  if (filters.direction === 'incoming') {
    txns = txns.filter((t) => t.type === 'credit');
  } else {
    txns = txns.filter((t) => t.type === 'debit');
  }

  const merchantMap = new Map();
  for (const t of txns) {
    if (!merchantMap.has(t.merchant)) merchantMap.set(t.merchant, { spend: 0, count: 0 });
    const entry = merchantMap.get(t.merchant);
    entry.spend += t.amount;
    entry.count++;
  }

  return [...merchantMap.entries()]
    .map(([merchant, data]) => ({ merchant, spend: round2(data.spend), count: data.count }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}
