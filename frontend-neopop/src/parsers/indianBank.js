/**
 * Indian Bank (OneCard) credit card statement parser.
 * Direct port of backend/parsers/indian_bank.py (513 lines)
 *
 * Handles statements with short dates (DD Mon without year),
 * both text-based and table-based transaction extraction.
 */

import { parseNumericDate, parseTextDate, resolveShortDate } from './base.js';

// ─── Period patterns ─────────────────────────────────────────

const TITLE_PERIOD_RE =
  /Statement\s*\(\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*-\s*(\d{1,2}\s+\w{3}\s+\d{4})\s*\)/i;

const PERIOD_NUMERIC_RE =
  /Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})\s*[-\u2013to]+\s*(\d{2}[/-]\d{2}[/-]\d{4})/i;

// ─── Card number ─────────────────────────────────────────────

const CARD_DASHED_RE = /(\d{4})[- ]?\d{2}[Xx*]{2}[- ]?[Xx*]{4}[- ]?(\d{4})/;
const CARD_GENERIC_RE = /(\d{4})[Xx*]{4,8}(\d{4})/;

// ─── Summary fields ──────────────────────────────────────────

const TOTAL_DUE_RE = /Total\s+Amount\s+Due\s*[=\s]*([\d,]+\.\d{2})/gi;
const CREDIT_LIMIT_RE = /(?:Total\s+)?Credit\s+Limit\s*[:\s]*([\d,]+(?:\.\d{2})?)/i;

// ─── Transaction patterns ────────────────────────────────────

const TX_LINE_RE = /^(\d{2}\s+\w{3})\s+(.+?)\s+([\d,]+\.\d{2})\s*$/;
const TX_LINE_DATED_RE =
  /^(\d{2}[/-]\d{2}[/-]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Dr|Cr)?\s*$/i;

const CREDIT_KEYWORDS = new Set([
  'repayment', 'repayments', 'refund', 'refunds',
  'reversal', 'reversals', 'cashback', 'credit adjustment',
]);

const MODE_CODES = [
  'TOKEN_ECOM', 'ECOM', 'POS', 'CONTACTLESS',
  'IMPS', 'NEFT', 'UPI', 'ATM', 'NFC',
];

const CATEGORY_LABELS = [
  'Food & Dining', 'Shopping', 'Entertainment', 'Travel',
  'Utilities', 'Health', 'Education', 'Groceries', 'Fuel',
  'EMI', 'Others', 'Miscellaneous', 'Personal Care',
  'Insurance', 'Government', 'Bills & Recharges', 'Investments',
  'Rent', 'Transfers', 'Repayments', 'Refunds',
];

/**
 * @param {string[]} allLines
 * @param {string} fullText
 * @returns {import('./base.js').ParsedStatement}
 */
export function parseIndianBank(allLines, fullText) {
  const [periodStart, periodEnd] = extractPeriod(fullText);
  const cardLast4 = extractCardLast4(fullText);
  const totalAmountDue = extractTotalAmountDue(fullText);
  const creditLimit = extractCreditLimit(fullText);
  const transactions = extractTransactions(allLines, periodStart, periodEnd);

  return {
    bank: 'indian_bank',
    period_start: periodStart,
    period_end: periodEnd,
    transactions,
    card_last4: cardLast4,
    total_amount_due: totalAmountDue,
    credit_limit: creditLimit,
  };
}

// ─── Period ──────────────────────────────────────────────────

function extractPeriod(text) {
  let m = TITLE_PERIOD_RE.exec(text);
  if (m) {
    const start = parseTextDate(m[1]);
    const end = parseTextDate(m[2]);
    if (start && end) return [start, end];
  }

  m = PERIOD_NUMERIC_RE.exec(text);
  if (m) {
    const start = parseNumericDate(m[1]);
    const end = parseNumericDate(m[2]);
    if (start && end) return [start, end];
  }

  return [null, null];
}

// ─── Card last-4 ─────────────────────────────────────────────

function extractCardLast4(text) {
  let m = CARD_DASHED_RE.exec(text);
  if (m) return m[2].slice(-4);
  m = CARD_GENERIC_RE.exec(text);
  if (m) return m[2].slice(-4);
  return null;
}

// ─── Summary ─────────────────────────────────────────────────

function extractTotalAmountDue(text) {
  const values = [];
  const re = new RegExp(TOTAL_DUE_RE.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    try { values.push(parseFloat(m[1].replace(/,/g, ''))); } catch { /* ignore */ }
  }
  return values.length ? values[values.length - 1] : null;
}

function extractCreditLimit(text) {
  const m = CREDIT_LIMIT_RE.exec(text);
  if (m) {
    try { return parseFloat(m[1].replace(/,/g, '')); } catch { /* ignore */ }
  }
  return null;
}

// ─── Transaction extraction ──────────────────────────────────

function extractTransactions(lines, periodStart, periodEnd) {
  const endDate = periodEnd ? new Date(periodEnd) : null;
  const startDate = periodStart ? new Date(periodStart) : null;
  const refYear = endDate ? endDate.getFullYear()
    : startDate ? startDate.getFullYear()
    : new Date().getFullYear();

  const seen = new Set();
  const transactions = [];

  // Text-based extraction
  let inTxSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const upper = line.toUpperCase();
    if (upper.includes('TRANSACTION HISTORY')) { inTxSection = true; continue; }
    if (upper.includes('IMPORTANT INFORMATION')) { inTxSection = false; continue; }
    if (!inTxSection) continue;

    const tx = parseTextLine(line, refYear, periodStart, periodEnd);
    if (tx) addUnique(tx, seen, transactions);
  }

  return transactions;
}

function addUnique(tx, seen, out) {
  const key = `${tx.date}|${tx.merchant}|${tx.amount}|${tx.type}`;
  if (!seen.has(key)) {
    seen.add(key);
    out.push(tx);
  }
}

// ─── Text line parsing ───────────────────────────────────────

function parseTextLine(line, refYear, periodStart, periodEnd) {
  // "DD Mon ... Amount" (primary)
  let m = TX_LINE_RE.exec(line);
  if (m) {
    const parsedDate = resolveShortDate(m[1], refYear, periodStart, periodEnd);
    if (!parsedDate) return null;
    return buildTransaction(parsedDate, m[2].trim(), m[3]);
  }

  // "DD/MM/YYYY ... Amount [Dr/Cr]" (alternate)
  m = TX_LINE_DATED_RE.exec(line);
  if (m) {
    const parsedDate = parseNumericDate(m[1]);
    if (!parsedDate) return null;

    const rawDesc = m[2].trim();
    const amountStr = m[3].replace(/,/g, '');
    const direction = (m[4] || '').trim().toLowerCase();
    const isCredit = direction === 'cr';

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return null;

    const merchant = cleanMerchant(rawDesc);
    return {
      date: parsedDate,
      merchant,
      amount,
      type: isCredit ? 'credit' : 'debit',
      description: rawDesc,
    };
  }

  return null;
}

function buildTransaction(parsedDate, rawDesc, amountStr) {
  const amount = parseFloat(amountStr.replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const descLower = rawDesc.toLowerCase();
  const isCredit = [...CREDIT_KEYWORDS].some((kw) => descLower.includes(kw));

  let detectedCat = '';
  for (const cat of CATEGORY_LABELS) {
    if (descLower.includes(cat.toLowerCase())) {
      detectedCat = cat;
      break;
    }
  }

  const merchant = cleanMerchant(rawDesc, detectedCat);
  return {
    date: parsedDate,
    merchant,
    amount,
    type: isCredit ? 'credit' : 'debit',
    description: rawDesc,
  };
}

// ─── Merchant cleanup ────────────────────────────────────────

function cleanMerchant(raw, _category) {
  if (!raw) return 'Unknown';
  let merchant = raw;

  // Strip trailing amounts
  merchant = merchant.replace(/\s+[\d,]+\.\d{2}\s*$/, '');

  // Strip mode codes
  for (const mode of MODE_CODES) {
    merchant = merchant.replace(
      new RegExp('\\s+' + escapeRegExp(mode) + '(?:\\s|$)', 'i'), ' ',
    );
  }

  // Strip category labels
  for (const cat of CATEGORY_LABELS) {
    merchant = merchant.replace(
      new RegExp('\\s+' + escapeRegExp(cat) + '\\s*$', 'i'), '',
    );
  }

  // General cleanup
  merchant = merchant.replace(/\s+(IN|INDIA|IND)\s*$/i, '');
  merchant = merchant.replace(/^(PYU|PAY|RSP|ING|PPSL|BPPY)\*/, '');
  merchant = merchant.replace(/\(Ref#[^)]*\)/g, '');
  merchant = merchant.replace(/\s+/g, ' ').trim();

  return merchant ? merchant.slice(0, 512) : 'Unknown';
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
