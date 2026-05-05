/** Zero-based page index clamped to available pages; half-open slice [start, end). */
export function paginateBounds(
  pageIndex: number,
  totalItems: number,
  pageSize: number,
): { pageCount: number; displayPageIndex: number; start: number; end: number } {
  if (totalItems <= 0 || pageSize <= 0) {
    return { pageCount: 1, displayPageIndex: 0, start: 0, end: 0 };
  }
  const pageCount = Math.ceil(totalItems / pageSize);
  const displayPageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const start = displayPageIndex * pageSize;
  const end = Math.min(start + pageSize, totalItems);
  return { pageCount, displayPageIndex, start, end };
}
