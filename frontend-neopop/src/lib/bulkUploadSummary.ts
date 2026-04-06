import type { BulkOutcomeItem, BulkRejectReason, BulkUploadResult } from '@/lib/api';

/** Max rows shown before "+ N more" in the summary card. */
export const MAX_BULK_DETAIL_ROWS = 14;

export function rejectReasonLabel(reason: BulkRejectReason): string {
  switch (reason) {
    case 'missing_filename':
      return 'Missing filename';
    case 'invalid_type':
      return 'Not a PDF or CSV file';
    case 'file_too_large':
      return 'Exceeds upload size limit (50 MB)';
    default:
      return 'Not accepted';
  }
}

function outcomeFallbackMessage(status: string): string {
  switch (status) {
    case 'duplicate':
      return 'Already imported';
    case 'card_not_found':
      return 'Card not added — add it in Settings first';
    case 'parse_error':
      return 'Could not parse this statement';
    case 'password_needed':
      return 'Password required — try uploading this file alone';
    case 'error':
      return 'Processing failed';
    default:
      return 'Not imported';
  }
}

export function outcomeDetail(o: BulkOutcomeItem): string {
  const m = o.message?.trim();
  if (m) return m;
  return outcomeFallbackMessage(o.status);
}

export function bulkUploadNeedsDetailPanel(result: BulkUploadResult): boolean {
  if (result.rejected.length > 0) return true;
  return result.outcomes.some((o) => o.status !== 'success');
}

export interface BulkUploadDetailRow {
  fileName: string;
  detail: string;
}

export function buildBulkUploadDetailRows(result: BulkUploadResult): BulkUploadDetailRow[] {
  const rows: BulkUploadDetailRow[] = [];
  for (const r of result.rejected) {
    rows.push({ fileName: r.file_name, detail: rejectReasonLabel(r.reason) });
  }
  for (const o of result.outcomes) {
    if (o.status !== 'success') {
      rows.push({ fileName: o.file_name, detail: outcomeDetail(o) });
    }
  }
  return rows;
}

export interface BulkToastApi {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

/**
 * Fire concise NeoPOP toasts after bulk upload. Inline detail lives in {@link BulkUploadSummaryCard}.
 */
export function notifyBulkUploadToasts(result: BulkUploadResult, toast: BulkToastApi): void {
  const notQueued = Math.max(0, result.input_total - result.total);
  const procIssues =
    result.duplicate +
    result.failed +
    result.card_not_found +
    result.parse_error +
    result.password_needed;

  if (result.success > 0) {
    let msg = `Imported ${result.success} of ${result.total} statement(s).`;
    if (notQueued > 0) {
      msg += ` ${notQueued} file(s) were not queued (wrong type or too large).`;
    }
    toast.success(msg);
    if (procIssues > 0) {
      const parts: string[] = [];
      if (result.duplicate) parts.push(`${result.duplicate} duplicate(s)`);
      if (result.failed) parts.push(`${result.failed} failed`);
      if (result.card_not_found) parts.push(`${result.card_not_found} card not found`);
      if (result.parse_error) parts.push(`${result.parse_error} parse error(s)`);
      if (result.password_needed) parts.push(`${result.password_needed} need password`);
      toast.warning(`Also: ${parts.join(', ')}. See summary below.`);
    }
    return;
  }

  if (result.total > 0 && procIssues === result.duplicate && result.duplicate === result.total) {
    toast.info('All selected statements were already imported.');
    return;
  }

  if (result.total === 0) {
    toast.error('No statements could be processed.');
    return;
  }

  const parts: string[] = [];
  if (result.duplicate) parts.push(`${result.duplicate} duplicate(s)`);
  if (result.failed) parts.push(`${result.failed} failed`);
  if (result.card_not_found) parts.push(`${result.card_not_found} card not found`);
  if (result.parse_error) parts.push(`${result.parse_error} parse error(s)`);
  if (result.password_needed) parts.push(`${result.password_needed} need password`);
  toast.error(`No statements imported. ${parts.length ? parts.join(', ') : 'Check your files and try again.'}`);
}

export function syntheticBulkUploadFailure(selectedCount: number): BulkUploadResult {
  return {
    status: 'error',
    input_total: selectedCount,
    total: 0,
    success: 0,
    failed: selectedCount,
    duplicate: 0,
    card_not_found: 0,
    parse_error: 0,
    password_needed: 0,
    skipped: 0,
    rejected: [],
    outcomes: [],
  };
}
