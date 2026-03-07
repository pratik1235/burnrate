/**
 * Bank detector — determines which bank a statement PDF belongs to.
 * Direct port of backend/parsers/detector.py
 *
 * @param {string} filename - PDF filename
 * @param {string} [firstPageText] - Extracted first page text (optional)
 * @returns {string|null} Bank slug or null
 */
export function detectBank(filename, firstPageText) {
  const fn = (filename || '').toLowerCase();

  // --- Filename-based detection ---
  if (fn.includes('hdfc')) return 'hdfc';
  if (fn.includes('icici')) return 'icici';
  if (fn.includes('axis')) return 'axis';
  if (fn.includes('sbi card') || fn.includes('sbi') || fn.includes('state bank')) return 'sbi';
  if (fn.includes('american express') || fn.includes('amex')) return 'amex';
  if (fn.includes('idfc first') || fn.includes('idfc')) return 'idfc_first';
  if (fn.includes('indusind')) return 'indusind';
  if (fn.includes('kotak')) return 'kotak';
  if (fn.includes('standard chartered')) return 'sc';
  if (fn.includes('yes bank')) return 'yes';
  if (fn.includes('au small finance') || fn.includes('au bank')) return 'au';
  if (fn.includes('rbl bank') || fn.includes('rbl')) return 'rbl';
  if (fn.includes('federal') || fn.includes('federalbank')) return 'federal';
  if (fn.includes('indian bank') || fn.includes('indianbank') || fn.includes('indian_bank')) return 'indian_bank';

  // --- BIN-based detection from masked card numbers in filename ---
  const binMatch = fn.match(/(\d{4})[xX*]+\d{2,4}/);
  if (binMatch) {
    const first4 = binMatch[1];
    const hdfcBins = new Set(['5522', '4386', '4567', '5241', '4543', '5254', '4213']);
    const iciciBins = new Set(['4568', '5243', '4998', '5236', '4389', '4315', '5270', '4329']);
    const axisBins = new Set(['4108', '4178', '5269', '4021', '4717']);
    if (hdfcBins.has(first4)) return 'hdfc';
    if (iciciBins.has(first4)) return 'icici';
    if (axisBins.has(first4)) return 'axis';
  }

  // --- PDF text-based detection ---
  if (!firstPageText) return null;
  const text = firstPageText.toLowerCase();

  if (/\bhdfc\b/.test(text) || text.includes('hdfc bank')) return 'hdfc';
  if (/\bicici\b/.test(text) || text.includes('icici bank')) return 'icici';
  if (/\baxis\s*bank\b/.test(text) || text.includes('axis bank')) return 'axis';
  if (/\bsbi\b/.test(text) || text.includes('sbi card') || text.includes('state bank')) return 'sbi';
  if (text.includes('american express') || /\bamex\b/.test(text)) return 'amex';
  if (text.includes('idfc first') || /\bidfc\b/.test(text)) return 'idfc_first';
  if (/\bindusind\b/.test(text)) return 'indusind';
  if (/\bkotak\b/.test(text)) return 'kotak';
  if (text.includes('standard chartered')) return 'sc';
  if (text.includes('yes bank')) return 'yes';
  if (text.includes('au small finance') || text.includes('au bank')) return 'au';
  if (text.includes('rbl bank') || /\brbl\b/.test(text)) return 'rbl';
  if (text.includes('federal bank') || /\bfederal\s*bank\b/.test(text)) return 'federal';
  if (text.includes('indian bank') && !text.includes('south indian bank')) return 'indian_bank';

  return null;
}
