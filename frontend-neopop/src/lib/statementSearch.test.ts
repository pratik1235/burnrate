import { describe, expect, it } from 'vitest';
import type { Statement } from '@/lib/types';
import { buildStatementSearchText, statementMatchesSearch } from '@/lib/statementSearch';

function baseStatement(over: Partial<Statement> = {}): Statement {
  return {
    id: '1',
    bank: 'hdfc',
    cardLast4: '4242',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    transactionCount: 12,
    totalSpend: 1000,
    source: 'CC',
    status: 'success',
    importedAt: '2025-02-01',
    ...over,
  };
}

describe('statementMatchesSearch', () => {
  it('matches empty query for any row', () => {
    expect(statementMatchesSearch(baseStatement(), '')).toBe(true);
    expect(statementMatchesSearch(baseStatement(), '   ')).toBe(true);
  });

  it('matches bank display name and slug', () => {
    const s = baseStatement({ bank: 'axis' });
    expect(statementMatchesSearch(s, 'axis')).toBe(true);
    expect(statementMatchesSearch(s, 'Axis Bank')).toBe(true);
  });

  it('matches last4 and file path fragments', () => {
    const s = baseStatement({
      cardLast4: '9911',
      displayPath: '/home/user/Statements/axis_jan.pdf',
    });
    expect(statementMatchesSearch(s, '9911')).toBe(true);
    expect(statementMatchesSearch(s, 'axis_jan')).toBe(true);
  });

  it('matches status message for parse errors', () => {
    const s = baseStatement({
      status: 'parse_error',
      statusMessage: 'Unsupported encryption',
    });
    expect(statementMatchesSearch(s, 'encryption')).toBe(true);
  });

  it('is case-insensitive', () => {
    const s = baseStatement({ bank: 'icici' });
    expect(statementMatchesSearch(s, 'ICICI')).toBe(true);
  });
});

describe('buildStatementSearchText', () => {
  it('includes normalized bank label', () => {
    const t = buildStatementSearchText(baseStatement({ bank: 'federal' }));
    expect(t).toContain('federal');
    expect(t).toContain('federal bank');
  });
});
