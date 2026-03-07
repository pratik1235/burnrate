/**
 * Axis Bank credit card statement parser.
 * Direct port of backend/parsers/axis.py (227 lines)
 *
 * Transaction table columns:
 *   DATE | TRANSACTION DETAILS | MERCHANT CATEGORY | AMOUNT (Rs.) Dr/Cr | CASHBACK EARNED Cr/Dr
 */

import { parseNumericDate } from './base.js';

const TX_LINE_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+(Dr|Cr)(?:\s+[\d,]+\.\d{2}\s+(?:Cr|Dr))?\s*$/i;

const PERIOD_RE = /(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/;

const CARD_NUM_RE = /(\d{4,6})\*{2,}(\d{4})/;

const KNOWN_MERCHANT_CATS =
  /\s+(?:MISC STORE|DEPT STORES?|GROCERY|ELECTRONICS|AIRLINE|HOTEL|RESTAURANT|FUEL|TELECOM|INSURANCE|UTILITY|GOVERNMENT|EDUCATION|ENTERTAINMENT|HEALTH|AUTO|TRAVEL|OTHERS?)\s*$/i;

/**
 * @param {string[]} allLines
 * @param {string} fullText
 * @returns {import('./base.js').ParsedStatement}
 */
export function parseAxis(allLines, fullText) {
  const [periodStart, periodEnd] = extractPeriod(fullText);
  const cardLast4 = extractCardLast4(fullText);
  const totalAmountDue = extractTotalAmountDue(fullText);
  const creditLimit = extractCreditLimit(fullText);
  const transactions = extractTransactions(allLines);

  return {
    bank: 'axis',
    period_start: periodStart,
    period_end: periodEnd,
    transactions,
    card_last4: cardLast4,
    total_amount_due: totalAmountDue,
    credit_limit: creditLimit,
  };
}

function extractPeriod(text) {
  const anchor = /Statement\s+Period/i.exec(text);
  if (anchor) {
    const window = text.slice(anchor.index, anchor.index + 200);
    const m = PERIOD_RE.exec(window);
    if (m) {
      const start = parseNumericDate(m[1]);
      const end = parseNumericDate(m[2]);
      if (start && end) return [start, end];
    }
  }

  const m = PERIOD_RE.exec(text);
  if (m) {
    return [parseNumericDate(m[1]), parseNumericDate(m[2])];
  }

  return [null, null];
}

function extractCardLast4(text) {
  const matches = [...text.matchAll(new RegExp(CARD_NUM_RE, 'g'))];
  for (const m of matches) return m[2];
  return null;
}

function extractTotalAmountDue(text) {
  const m = /Total\s+Payment\s+Due.*?([\d,]+\.\d{2})/is.exec(text);
  if (m) {
    try { return parseFloat(m[1].replace(/,/g, '')); } catch { /* ignore */ }
  }
  return null;
}

function extractCreditLimit(text) {
  const amounts = [];
  const re = /Credit\s+Limit/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const pre = text.slice(Math.max(0, match.index - 15), match.index);
    if (pre.toLowerCase().includes('available')) continue;

    const window = text.slice(match.index + match[0].length, match.index + match[0].length + 300);
    const amRe = /([\d,]+\.\d{2})/g;
    let am;
    while ((am = amRe.exec(window)) !== null) {
      try {
        const val = parseFloat(am[1].replace(/,/g, ''));
        if (val > 0) amounts.push(val);
      } catch { /* ignore */ }
    }
    break;
  }
  return amounts.length ? Math.max(...amounts) : null;
}

function extractTransactions(lines) {
  const transactions = [];

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/\s+/g, ' ').trim();

    const tx = parseTransactionLine(line);
    if (tx) transactions.push(tx);
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
  const direction = m[4].trim().toLowerCase();

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  const isCredit = direction === 'cr';
  const merchant = cleanMerchant(rawDesc);

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
  let merchant = raw.replace(KNOWN_MERCHANT_CATS, '').trim();
  return merchant ? merchant.slice(0, 512) : raw.slice(0, 512);
}
