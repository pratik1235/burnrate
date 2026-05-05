import { describe, expect, it } from 'vitest';
import { paginateBounds } from '@/lib/pagination';

describe('paginateBounds', () => {
  it('returns empty slice when total is 0', () => {
    expect(paginateBounds(0, 0, 10)).toEqual({
      pageCount: 1,
      displayPageIndex: 0,
      start: 0,
      end: 0,
    });
  });

  it('single page when items fit in one page', () => {
    expect(paginateBounds(0, 5, 10)).toEqual({
      pageCount: 1,
      displayPageIndex: 0,
      start: 0,
      end: 5,
    });
  });

  it('clamps page index past last page', () => {
    expect(paginateBounds(99, 25, 10)).toEqual({
      pageCount: 3,
      displayPageIndex: 2,
      start: 20,
      end: 25,
    });
  });

  it('second page slice', () => {
    expect(paginateBounds(1, 25, 10)).toEqual({
      pageCount: 3,
      displayPageIndex: 1,
      start: 10,
      end: 20,
    });
  });
});
