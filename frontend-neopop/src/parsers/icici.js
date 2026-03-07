/**
 * ICICI Bank credit card statement parser.
 * Direct port of backend/parsers/icici.py (241 lines)
 *
 * Handles Amazon Pay / Coral / Rubyx style statements where pdf.js
 * renders ₹ as backtick (`). Transaction lines follow the format:
 *   DD/MM/YYYY  SERIAL_NO  DESCRIPTION  REWARD_PTS  [INTL_AMT]  AMOUNT [CR]
 */

import { parseNumericDate, parseTextDate } from './base.js';

const TX_LINE_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+\d{8,}\s+(.+)\s+([\d,]+\.\d{2})\s*(CR)?\s*$/i;

const CARD_NUM_RE = /(\d{4})[Xx*]+(\d{3,4})/;

const STATEMENT_PERIOD_RE =
  /Statement\s+period\s*:\s*(\w+\s+\d{1,2},?\s+\d{4})\s+to\s+(\w+\s+\d{1,2},?\s+\d{4})/i;

const STATEMENT_DATE_RE =
  /STATEMENT\s+DATE\s*\n?\s*(\w+\s+\d{1,2},?\s+\d{4})/i;

const TOTAL_DUE_RE =
  /Total\s+Amount\s+due\s*\n?\s*`([\d,]+(?:\.\d{2})?)/i;

const CREDIT_LIMIT_ANCHOR =
  /Credit\s+Limit\s*\(Including\s+cash\)/i;

const AMOUNT_RE = /`([\d,]+(?:\.\d{2})?)/g;

/**
 * @param {string[]} allLines
 * @param {string} fullText
 * @returns {import('./base.js').ParsedStatement}
 */
export function parseICICI(allLines, fullText) {
  const [periodStart, periodEnd] = extractPeriod(fullText);
  const cardLast4 = extractCardLast4(fullText);
  const totalAmountDue = extractTotalAmountDue(fullText);
  const creditLimit = extractCreditLimit(fullText);
  const transactions = extractTransactions(allLines);

  return {
    bank: 'icici',
    period_start: periodStart,
    period_end: periodEnd,
    transactions,
    card_last4: cardLast4,
    total_amount_due: totalAmountDue,
    credit_limit: creditLimit,
  };
}

function extractPeriod(text) {
  let m = STATEMENT_PERIOD_RE.exec(text);
  if (m) {
    const start = parseTextDate(m[1]);
    const end = parseTextDate(m[2]);
    if (start && end) return [start, end];
  }

  m = STATEMENT_DATE_RE.exec(text);
  if (m) {
    const end = parseTextDate(m[1]);
    if (end) {
      const endDate = new Date(end);
      const startApprox = endDate.getDate() > 1
        ? new Date(endDate.getFullYear(), endDate.getMonth(), 1).toISOString().slice(0, 10)
        : end;
      return [startApprox, end];
    }
  }

  return [null, null];
}

function extractCardLast4(text) {
  const matches = [...text.matchAll(new RegExp(CARD_NUM_RE, 'g'))];
  for (const m of matches) {
    const lastDigits = m[2];
    if (lastDigits.length >= 4) return lastDigits.slice(-4);
    return (m[1] + lastDigits).slice(-4);
  }
  return null;
}

function extractTotalAmountDue(text) {
  const m = TOTAL_DUE_RE.exec(text);
  if (m) {
    try { return parseFloat(m[1].replace(/,/g, '')); } catch { /* ignore */ }
  }
  return null;
}

function extractCreditLimit(text) {
  const anchor = CREDIT_LIMIT_ANCHOR.exec(text);
  if (!anchor) return null;

  const window = text.slice(anchor.index + anchor[0].length, anchor.index + anchor[0].length + 500);
  const amounts = [];
  let am;
  const re = new RegExp(AMOUNT_RE.source, 'g');
  while ((am = re.exec(window)) !== null) {
    try {
      const val = parseFloat(am[1].replace(/,/g, ''));
      if (val > 0) amounts.push(val);
    } catch { /* ignore */ }
  }

  return amounts.length ? Math.max(...amounts) : null;
}

function extractTransactions(lines) {
  const transactions = [];
  const seen = new Set();

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/\(cid:\d+\)/g, ' ');
    line = line.replace(/\s+/g, ' ').trim();

    const tx = parseTransactionLine(line);
    if (tx) {
      const key = `${tx.date}|${tx.merchant}|${tx.amount}|${tx.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        transactions.push(tx);
      }
    }
  }

  return transactions;
}

function parseTransactionLine(line) {
  const m = TX_LINE_RE.exec(line);
  if (!m) return null;

  const parsedDate = parseNumericDate(m[1]);
  if (!parsedDate) return null;

  const rawDesc = m[2].trim();
  const amountStr = m[3].replace(/,/g, '');
  const isCredit = m[4] != null;

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  let merchant = rawDesc.replace(/\s+\d+\s*$/, '').trim();
  merchant = cleanMerchant(merchant);

  return {
    date: parsedDate,
    merchant,
    amount,
    type: isCredit ? 'credit' : 'debit',
    description: rawDesc,
  };
}

function cleanMerchant(raw) {
  if (!raw) return 'Unknown';
  let merchant = raw;
  merchant = merchant.replace(/\s+(IN|INDIA)\s*$/i, '');
  merchant = merchant.trim();
  return merchant ? merchant.slice(0, 512) : raw.slice(0, 512);
}
