/**
 * HDFC Bank credit card statement parser.
 * Direct port of backend/parsers/hdfc.py (351 lines)
 *
 * Handles Regalia/Infinia/Diners style statements where pdf.js
 * extracts transaction lines with format:
 *   DD/MM/YYYY| HH:MM DESCRIPTION [+|- REWARDS] [+] C AMOUNT [l]
 */

import { parseNumericDate, parseTextDate } from './base.js';

const TX_DATE_RE = /(\d{2}\/\d{2}\/\d{4})\|\s*\d{2}:\d{2}\s+/;
const TX_AMOUNT_RE = /(\+\s+)?C\s*([\d,]+\.\d{2})\s*l?\s*$/;

const BILLING_PERIOD_RE =
  /Billing\s+Period\s+(\d{1,2}\s+\w{3,9},?\s+\d{4})\s*[-\u2013]\s*(\d{1,2}\s+\w{3,9},?\s+\d{4})/i;

const CARD_NUM_RE =
  /(?:Credit\s+Card\s+No\.?\s*)(\d{4,6}[X*x]+\d{2,4})/i;

const TOTAL_DUE_RE =
  /TOTAL\s+AMOUNT\s+DUE.*?C\s*([\d,]+(?:\.\d{2})?)/is;

const CREDIT_LIMIT_RE_ANCHOR =
  /TOTAL\s+CREDIT\s+LIMIT/i;

/**
 * Parse an HDFC statement.
 * @param {string[]} allLines - all extracted text lines
 * @param {string} headerText - first page text
 * @param {string} fullText - all pages concatenated
 * @returns {import('./base.js').ParsedStatement}
 */
export function parseHDFC(allLines, headerText, fullText) {
  const [periodStart, periodEnd] = extractPeriod(headerText);
  const cardLast4 = extractCardLast4(headerText);
  const transactions = extractTransactions(allLines);
  const totalAmountDue = extractTotalAmountDue(fullText);
  const creditLimit = extractCreditLimit(fullText);

  return {
    bank: 'hdfc',
    period_start: periodStart,
    period_end: periodEnd,
    transactions,
    card_last4: cardLast4,
    total_amount_due: totalAmountDue,
    credit_limit: creditLimit,
  };
}

// ─── Period ───────────────────────────────────────────────────

function extractPeriod(text) {
  let m = BILLING_PERIOD_RE.exec(text);
  if (m) {
    const start = parseTextDate(m[1]);
    const end = parseTextDate(m[2]);
    if (start || end) return [start, end];
  }

  const fallbackPatterns = [
    /Billing\s+Period\s+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-\u2013]\s*(\d{2}[/-]\d{2}[/-]\d{2,4})/i,
    /Statement\s+Period[:\s]+(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[-\u2013to]+\s*(\d{2}[/-]\d{2}[/-]\d{2,4})/i,
  ];
  for (const pat of fallbackPatterns) {
    m = pat.exec(text);
    if (m) {
      const start = parseNumericDate(m[1]);
      const end = parseNumericDate(m[2]);
      if (start || end) return [start, end];
    }
  }

  return [null, null];
}

// ─── Card last-4 ─────────────────────────────────────────────

function extractCardLast4(text) {
  const m = CARD_NUM_RE.exec(text);
  if (m) {
    const digits = m[1].replace(/[^0-9]/g, '');
    if (digits.length >= 4) return digits.slice(-4);
  }
  return null;
}

// ─── Total Amount Due ────────────────────────────────────────

function extractTotalAmountDue(text) {
  const m = TOTAL_DUE_RE.exec(text);
  if (m) {
    try { return parseFloat(m[1].replace(/,/g, '')); } catch { /* ignore */ }
  }
  return null;
}

// ─── Credit Limit ────────────────────────────────────────────

function extractCreditLimit(text) {
  const anchor = CREDIT_LIMIT_RE_ANCHOR.exec(text);
  if (!anchor) return null;

  let window = text.slice(anchor.index + anchor[0].length, anchor.index + anchor[0].length + 250);
  const cutoff = /Past\s+Due|OVER\s+LIMIT/i.exec(window);
  if (cutoff) window = window.slice(0, cutoff.index);

  const amounts = [];
  const amRe = /C\s*([\d,]+(?:\.\d{2})?)/g;
  let am;
  while ((am = amRe.exec(window)) !== null) {
    try {
      const val = parseFloat(am[1].replace(/,/g, ''));
      if (val > 0) amounts.push(val);
    } catch { /* ignore */ }
  }

  return amounts.length ? Math.max(...amounts) : null;
}

// ─── Transaction extraction ──────────────────────────────────

function extractTransactions(lines) {
  const transactions = [];
  const seen = new Set();

  // Normalize lines
  const cleaned = lines.map((raw) => {
    let line = raw.trim();
    if (!line) return '';
    line = line.replace(/\(cid:\d+\)/g, ' ');
    line = line.replace(/\s+/g, ' ').trim();
    return line;
  });

  // Pass 1: standard single-line transactions
  for (const line of cleaned) {
    if (!line) continue;
    const tx = parseTransactionLine(line);
    if (tx) {
      const key = `${tx.date}|${tx.merchant}|${tx.amount}|${tx.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        transactions.push(tx);
      }
    }
  }

  // Pass 2: multi-line transaction fixup
  fixupMultilineTransactions(cleaned, transactions);

  return transactions;
}

function fixupMultilineTransactions(cleaned, transactions) {
  const unknowns = transactions.filter((tx) => tx.merchant === 'Unknown');
  if (!unknowns.length) return;

  for (const tx of unknowns) {
    // Find the date string from the ISO date
    const [y, m, d] = tx.date.split('-');
    const dateStr = `${d}/${m}/${y}`;

    for (let idx = 0; idx < cleaned.length; idx++) {
      const line = cleaned[idx];
      if (!line.startsWith(dateStr)) continue;
      if (!TX_AMOUNT_RE.test(line.slice(11))) continue;

      // Collect description from preceding lines
      const descParts = [];
      for (let back = idx - 1; back >= Math.max(idx - 5, 0); back--) {
        const prev = cleaned[back];
        if (!prev) break;
        if (TX_DATE_RE.test(prev)) break;
        if (['DATE & TIME', 'TRANSACTION DESCRIPTION', 'DOMESTIC TRANSACTION',
             'INTERNATIONAL TRANSACTION', 'PAGE ', 'REWARDS'].some(
               (kw) => prev.toUpperCase().includes(kw))) break;
        if (/^[A-Z0-9]{10,}\)?\s*$/.test(prev)) continue;
        descParts.unshift(prev);
      }

      if (descParts.length) {
        let rawDesc = descParts.join(' ');
        if (descParts.length > 1) rawDesc = descParts.slice(1).join(' ');
        tx.merchant = cleanMerchant(rawDesc);
        tx.description = rawDesc;
      }
      break;
    }
  }
}

function parseTransactionLine(line) {
  const dateMatch = TX_DATE_RE.exec(line);
  if (!dateMatch) return null;

  const parsedDate = parseNumericDate(dateMatch[1]);
  if (!parsedDate) return null;

  const rest = line.slice(dateMatch.index + dateMatch[0].length);
  const amountMatch = TX_AMOUNT_RE.exec(rest);
  if (!amountMatch) return null;

  const isCredit = amountMatch[1] != null;
  const amountStr = amountMatch[2].replace(/,/g, '');
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  let descRaw = rest.slice(0, amountMatch.index).trim();
  descRaw = descRaw.replace(/\s+[+\-]\s+\d+\s*$/, '').trim();

  const merchant = cleanMerchant(descRaw);
  const txType = isCredit ? 'credit' : 'debit';

  return {
    date: parsedDate,
    merchant,
    amount,
    type: txType,
    description: descRaw,
  };
}

// ─── Merchant cleanup ────────────────────────────────────────

function cleanMerchant(raw) {
  if (!raw) return 'Unknown';
  let merchant = raw;
  merchant = merchant.replace(/^EMI\s+/, '');
  merchant = merchant.replace(/^(PYU|PAY|RSP|ING|PPSL|BPPY)\*/, '');
  merchant = merchant.replace(/\(Ref#[^)]*\)?\s*$/, '');
  merchant = merchant.trim();
  return merchant ? merchant.slice(0, 512) : raw.slice(0, 512);
}
