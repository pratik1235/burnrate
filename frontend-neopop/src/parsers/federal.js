/**
 * Federal Bank credit card statement parser.
 * Direct port of backend/parsers/federal.py (276 lines)
 *
 * Handles Celesta / Imperio / Signet / Scapia style statements.
 */

import { parseNumericDate, parseTextDate } from './base.js';

const TX_LINE_RE =
  /^(\d{2}[/-]\d{2}[/-]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Cr|CR|Dr|DR)?\s*$/i;

const TX_LINE_TEXT_DATE_RE =
  /^(\d{2}[\s-]\w{3}[\s-]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Cr|CR|Dr|DR)?\s*$/i;

const PERIOD_RE =
  /Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{4})/i;

const PERIOD_TEXT_RE =
  /Statement\s+Period[:\s]+(\d{1,2}\s+\w{3,9},?\s+\d{4})\s*[-–to]+\s*(\d{1,2}\s+\w{3,9},?\s+\d{4})/i;

const BILLING_PERIOD_RE =
  /Billing\s+(?:Cycle|Period)[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{4})/i;

const CARD_NUM_RE =
  /(?:Card\s+(?:No|Number)|Credit\s+Card)[.:\s]*(\d{4,6})[Xx*]+(\d{3,4})/i;

const CARD_NUM_GENERIC_RE = /(\d{4})[Xx*]{4,}(\d{4})/;

const TOTAL_DUE_RE =
  /Total\s+(?:Payment|Amount)\s+Due.*?([\d,]+\.\d{2})/is;

const KNOWN_MERCHANT_CATS =
  /\s+(?:MISC|DEPT STORE|GROCERY|ELECTRONICS|AIRLINE|HOTEL|RESTAURANT|FUEL|TELECOM|INSURANCE|UTILITY|GOVERNMENT|EDUCATION|ENTERTAINMENT|HEALTH|AUTO|TRAVEL|E-COMMERCE|SHOPPING|OTHERS?)\s*$/i;

/**
 * @param {string[]} allLines
 * @param {string} fullText
 * @returns {import('./base.js').ParsedStatement}
 */
export function parseFederal(allLines, fullText) {
  const [periodStart, periodEnd] = extractPeriod(fullText);
  const cardLast4 = extractCardLast4(fullText);
  const totalAmountDue = extractTotalAmountDue(fullText);
  const creditLimit = extractCreditLimit(fullText);
  const transactions = extractTransactions(allLines);

  return {
    bank: 'federal',
    period_start: periodStart,
    period_end: periodEnd,
    transactions,
    card_last4: cardLast4,
    total_amount_due: totalAmountDue,
    credit_limit: creditLimit,
  };
}

function extractPeriod(text) {
  for (const pat of [PERIOD_RE, BILLING_PERIOD_RE]) {
    const m = pat.exec(text);
    if (m) {
      const start = parseNumericDate(m[1]);
      const end = parseNumericDate(m[2]);
      if (start && end) return [start, end];
    }
  }

  const m = PERIOD_TEXT_RE.exec(text);
  if (m) {
    const start = parseTextDate(m[1]);
    const end = parseTextDate(m[2]);
    if (start && end) return [start, end];
  }

  return [null, null];
}

function extractCardLast4(text) {
  let m = CARD_NUM_RE.exec(text);
  if (m) return m[2].slice(-4);
  m = CARD_NUM_GENERIC_RE.exec(text);
  if (m) return m[2].slice(-4);
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
  const amounts = [];
  const re = /Credit\s+Limit/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const pre = text.slice(Math.max(0, match.index - 20), match.index);
    if (pre.toLowerCase().includes('available') || pre.toLowerCase().includes('cash')) continue;

    const window = text.slice(match.index + match[0].length, match.index + match[0].length + 200);
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
  let m = TX_LINE_RE.exec(line);
  if (m) {
    const parsedDate = parseNumericDate(m[1]);
    if (parsedDate) return buildTransaction(parsedDate, m[2], m[3], m[4]);
  }

  m = TX_LINE_TEXT_DATE_RE.exec(line);
  if (m) {
    const dateStr = m[1].replace(/-/g, ' ').replace(/\s+/g, ' ');
    const parsedDate = parseTextDate(dateStr);
    if (parsedDate) return buildTransaction(parsedDate, m[2], m[3], m[4]);
  }

  return null;
}

function buildTransaction(parsedDate, rawDesc, amountStr, direction) {
  const amount = parseFloat(amountStr.replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const isCredit = (direction || '').trim().toLowerCase() === 'cr';
  const merchant = cleanMerchant(rawDesc.trim());

  return {
    date: parsedDate,
    merchant,
    amount,
    type: isCredit ? 'credit' : 'debit',
    description: rawDesc.trim(),
  };
}

function cleanMerchant(raw) {
  if (!raw) return 'Unknown';
  let merchant = raw.replace(KNOWN_MERCHANT_CATS, '').trim();
  merchant = merchant.replace(/\s+(IN|INDIA|IND)\s*$/i, '');
  return merchant ? merchant.slice(0, 512) : raw.slice(0, 512);
}
