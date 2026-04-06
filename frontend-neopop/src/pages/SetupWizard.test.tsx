import { describe, expect, it } from 'vitest';
import { removedCardIds } from './SetupWizard';

describe('removedCardIds', () => {
  it('returns IDs present in baseline but not in submitted rows', () => {
    const baseline = [
      { id: 'a', bank: 'hdfc' as const, last4: '1111' },
      { id: 'b', bank: 'icici' as const, last4: '2222' },
    ];
    const submitted = [{ id: 'a', bank: 'hdfc' as const, last4: '1111' }];
    expect(removedCardIds(baseline, submitted)).toEqual(['b']);
  });

  it('ignores newly added rows without id when computing removals', () => {
    const baseline = [{ id: 'a', bank: 'hdfc' as const, last4: '1111' }];
    const submitted = [
      { id: 'a', bank: 'hdfc' as const, last4: '1111' },
      { bank: 'axis' as const, last4: '3333' },
    ];
    expect(removedCardIds(baseline, submitted)).toEqual([]);
  });

  it('returns empty when baseline is undefined', () => {
    expect(removedCardIds(undefined, [{ bank: 'hdfc' as const, last4: '1' }])).toEqual([]);
  });
});
