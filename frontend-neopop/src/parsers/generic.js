/**
 * Generic credit card statement parser.
 * Direct port of backend/parsers/generic.py (173 lines)
 *
 * Fallback parser for banks without a dedicated parser.
 */

import { parseNumericDate } from './base.js';

/**
 * @param {string} bank
 * @param {string[]} allLines
 * @param {string} fullText
 * @returns {import('./base.js').ParsedStatement}
 */
export function parseGeneric(bank, allLines, fullText) {
  const [periodStart, periodEnd] = extractPeriod(fullText);
  const cardLast4 = extractCardLast4(fullText);
  const totalAmountDue = extractTotalAmountDue(fullText);
  const creditLimit = extractCreditLimit(fullText);
  const transactions = extractTransactions(allLines);

  return {
    bank,
    period_start: periodStart,
    period_end: periodEnd,
    transactions,
    card_last4: cardLast4,
    total_amount_due: totalAmountDue,
    credit_limit: creditLimit,
  };
}

function extractPeriod(text) {
  const patterns = [
    /Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{2,4})/i,
    /Billing\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-–to]+\s*(\d{2}[/-]\d{2}[/-]\d{2,4})/i,
    /From\s+(\d{2}[/-]\d{2}[/-]\d{2,4})\s+[Tt]o\s+(\d{2}[/-]\d{2}[/-]\d{2,4})/i,
    /(\d{2}[/-]\d{2}[/-]\d{4})\s*[-–]\s*(\d{2}[/-]\d{2}[/-]\d{4})/,
  ];

  for (const pat of patterns) {
    const m = pat.exec(text);
    if (m) {
      const start = parseNumericDate(m[1]);
      const end = parseNumericDate(m[2]);
      if (start && end) return [start, end];
    }
  }

  return [null, null];
}

function extractCardLast4(text) {
  const m = /(\d{4,6})[Xx*]{4,}(\d{4})/.exec(text);
  return m ? m[2] : null;
}

function extractTotalAmountDue(text) {
  const patterns = [
    /Total\s+Amount\s+Due.*?([\d,]+\.\d{2})/is,
    /Total\s+Payment\s+Due.*?([\d,]+\.\d{2})/is,
    /Amount\s+Payable.*?([\d,]+\.\d{2})/is,
  ];
  for (const pat of patterns) {
    const m = pat.exec(text);
    if (m) {
      try { return parseFloat(m[1].replace(/,/g, '')); } catch { /* ignore */ }
    }
  }
  return null;
}

function extractCreditLimit(text) {
  const patterns = [
    /Credit\s+Limit.*?([\d,]+\.\d{2})/is,
    /Total\s+Credit\s+Limit.*?([\d,]+\.\d{2})/is,
  ];
  for (const pat of patterns) {
    const m = pat.exec(text);
    if (m) {
      try {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (val > 0) return val;
      } catch { /* ignore */ }
    }
  }
  return null;
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
  const m = /^(\d{2}[/-]\d{2}[/-]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Dr|Cr|CR|DR)?\s*$/i.exec(line);
  if (!m) return null;

  const parsedDate = parseNumericDate(m[1]);
  if (!parsedDate) return null;

  const rawDesc = m[2].trim();
  const amountStr = m[3].replace(/,/g, '');
  const direction = (m[4] || '').trim().toLowerCase();

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  const isCredit = direction === 'cr';

  return {
    date: parsedDate,
    merchant: rawDesc ? rawDesc.slice(0, 512) : 'Unknown',
    amount,
    type: isCredit ? 'credit' : 'debit',
    description: rawDesc,
  };
}
