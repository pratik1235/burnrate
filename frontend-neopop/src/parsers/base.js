/**
 * Base data structures for parsed statements.
 * Port of backend/parsers/base.py
 */

/**
 * @typedef {Object} ParsedTransaction
 * @property {string} date - ISO date string 'YYYY-MM-DD'
 * @property {string} merchant
 * @property {number} amount
 * @property {'debit'|'credit'} type
 * @property {string} description
 */

/**
 * @typedef {Object} ParsedStatement
 * @property {string} bank
 * @property {string|null} period_start - ISO date string
 * @property {string|null} period_end - ISO date string
 * @property {ParsedTransaction[]} transactions
 * @property {string|null} card_last4
 * @property {number|null} total_amount_due
 * @property {number|null} credit_limit
 */

// ── Date parsing helpers (shared across all parsers) ─────────

/**
 * Parse DD/MM/YYYY or DD-MM-YYYY variants.
 * @param {string} dateStr
 * @returns {string|null} ISO date string or null
 */
export function parseNumericDate(dateStr) {
  const s = (dateStr || '').trim();
  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(+yyyy, +mm - 1, +dd);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // DD/MM/YY or DD-MM-YY
  m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{2})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const yyyy = +yy > 50 ? 1900 + +yy : 2000 + +yy;
    const d = new Date(yyyy, +mm - 1, +dd);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

const MONTH_MAP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/**
 * Parse text dates like 'DD Mon YYYY', 'DD Mon, YYYY', 'January 29, 2026'.
 * @param {string} dateStr
 * @returns {string|null} ISO date string or null
 */
export function parseTextDate(dateStr) {
  const s = (dateStr || '').trim().replace(/,/g, '').replace(/\s+/g, ' ');

  // "DD Mon YYYY" or "DD Month YYYY"
  let m = s.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (m) {
    const month = MONTH_MAP[m[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(+m[3], month, +m[1]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // "Month DD YYYY" (ICICI style: "January 29 2026")
  m = s.match(/^(\w+)\s+(\d{1,2})\s+(\d{4})$/);
  if (m) {
    const month = MONTH_MAP[m[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(+m[3], month, +m[2]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

/**
 * Parse short date "DD Mon" and resolve year from statement period.
 * @param {string} short - e.g. "15 Jan"
 * @param {number} refYear
 * @param {string|null} periodStart - ISO date
 * @param {string|null} periodEnd - ISO date
 * @returns {string|null}
 */
export function resolveShortDate(short, refYear, periodStart, periodEnd) {
  const s = (short || '').trim().replace(/\s+/g, ' ');
  const m = s.match(/^(\d{1,2})\s+(\w{3,})$/);
  if (!m) return null;

  const month = MONTH_MAP[m[2].toLowerCase()];
  if (month === undefined) return null;

  const candidate = new Date(refYear, month, +m[1]);
  if (isNaN(candidate.getTime())) return null;

  const candidateStr = candidate.toISOString().slice(0, 10);

  if (periodEnd && candidateStr > periodEnd) {
    const prev = new Date(refYear - 1, month, +m[1]);
    const prevStr = prev.toISOString().slice(0, 10);
    if (periodStart && prevStr >= periodStart) {
      return prevStr;
    }
    return candidateStr;
  }

  return candidateStr;
}
