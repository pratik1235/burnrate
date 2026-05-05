import type { Statement } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';

/** Lowercased concatenation of fields users expect to find by typing. */
export function buildStatementSearchText(s: Statement): string {
  const cfg = BANK_CONFIG[s.bank] ?? { name: s.bank.toUpperCase(), color: '', logo: '' };
  const parts = [
    cfg.name,
    s.bank,
    s.cardLast4 ?? '',
    s.source,
    s.fileName ?? '',
    s.filePath ?? '',
    s.displayPath ?? '',
    s.originalUploadPath ?? '',
    s.status,
    s.statusMessage ?? '',
    s.periodStart ?? '',
    s.periodEnd ?? '',
    String(s.transactionCount),
    s.paymentDueDate ?? '',
    s.importedAt ?? '',
    (s.currency ?? '').toLowerCase(),
    s.parseFailed ? 'parse failed import error' : '',
  ];
  return parts.join(' ').toLowerCase();
}

export function statementMatchesSearch(s: Statement, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return buildStatementSearchText(s).includes(q);
}
