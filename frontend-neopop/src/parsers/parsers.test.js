import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { extractPagesDetailed } from './pdfService.js';
import { parseHDFC } from './hdfc.js';
import { parseAxis } from './axis.js';
import { parseICICI } from './icici.js';
import { generatePasswords, findPassword } from '../services/pdfUnlock.js';

const FIXTURES = resolve(__dirname, '../../../tests/fixtures');

const PROFILE = {
  name: 'Pratik Prakash',
  dob_day: '09',
  dob_month: '02',
  dob_year: '1999',
};

async function unlockAndExtract(pdfPath, bank) {
  const fileBuffer = readFileSync(pdfPath).buffer.slice(0); // ArrayBuffer
  const passwords = generatePasswords({
    bank,
    name: PROFILE.name,
    dobDay: PROFILE.dob_day,
    dobMonth: PROFILE.dob_month,
    cardLast4s: ['8087', '1464', '9735', '0000'],
    dobYear: PROFILE.dob_year,
  });

  const workingPassword = await findPassword(fileBuffer, passwords);
  // Pass workingPassword even if it's null (meaning not encrypted or we didn't find one, but findPassword checks if encrypted)
  return await extractPagesDetailed(fileBuffer, workingPassword);
}

describe('HDFC Parser (Card 8087, Feb 2026)', () => {
  it('correctly parses the HDFC account statement', async () => {
    const extracted = await unlockAndExtract(resolve(FIXTURES, 'hdfc_8087_2026-02.pdf'), 'hdfc');
    const result = parseHDFC(extracted.allLines, extracted.pages[0], extracted.fullText);

    expect(result.card_last4).toBe('8087');
    expect(result.period_start).toBeTruthy();
    expect(result.period_end).toBeTruthy();
    expect(new Date(result.period_start) < new Date(result.period_end)).toBe(true);

    expect(result.transactions.length).toBe(35);
    expect(result.total_amount_due).toBeGreaterThan(0);
    expect(result.credit_limit).toBeGreaterThan(0);

    const types = new Set(result.transactions.map((tx) => tx.type));
    expect(types.has('debit')).toBe(true);
    expect(types.has('credit')).toBe(true);

    for (const tx of result.transactions) {
      expect(tx.merchant).not.toBe('Unknown');
      expect(tx.merchant.length).toBeLessThanOrEqual(512);
      expect(tx.amount).toBeGreaterThan(0);
    }
  });
});

describe('Axis Parser (Card 9735)', () => {
  it('correctly parses the Axis account statement', async () => {
    const extracted = await unlockAndExtract(resolve(FIXTURES, 'axis_9735.pdf'), 'axis');
    const result = parseAxis(extracted.allLines, extracted.fullText);

    expect(result.card_last4).toBe('9735');
    expect(result.period_start).toBeTruthy();
    expect(result.period_end).toBeTruthy();

    expect(result.transactions.length).toBe(12);

    const debits = result.transactions
      .filter((tx) => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);
    expect(debits).toBeCloseTo(5064.0, 0);

    for (const tx of result.transactions) {
      expect(tx.merchant).toBeTruthy();
      expect(tx.merchant).not.toBe('Unknown');
    }
  });
});

describe('ICICI Parser (Card 0000)', () => {
  it('correctly parses the ICICI account statement', async () => {
    const extracted = await unlockAndExtract(resolve(FIXTURES, 'icici_0000.pdf'), 'icici');
    const result = parseICICI(extracted.allLines, extracted.fullText);

    expect(result.card_last4).toBe('0000');
    expect(result.period_start).toBeTruthy();
    expect(result.period_end).toBeTruthy();

    expect(result.transactions.length).toBe(4);

    const credits = result.transactions.filter((tx) => tx.type === 'credit');
    expect(credits.length).toBeGreaterThanOrEqual(1);

    const debits = result.transactions
      .filter((tx) => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);
    expect(debits).toBeCloseTo(2405.14, 0);
  });
});
