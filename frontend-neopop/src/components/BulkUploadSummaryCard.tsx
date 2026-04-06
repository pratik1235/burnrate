import { useEffect } from 'react';
import { Button, Column, ElevatedCard, Row, Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import type { BulkUploadResult } from '@/lib/api';
import {
  MAX_BULK_DETAIL_ROWS,
  buildBulkUploadDetailRows,
} from '@/lib/bulkUploadSummary';

export interface BulkUploadSummaryCardProps {
  result: BulkUploadResult;
  onDismiss: () => void;
}

export function BulkUploadSummaryCard({ result, onDismiss }: BulkUploadSummaryCardProps) {
  const rows = buildBulkUploadDetailRows(result);
  const visible = rows.slice(0, MAX_BULK_DETAIL_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <ElevatedCard
      backgroundColor="#000000"
      edgeColors={{
        bottom: colorPalette.rss[500],
        right: colorPalette.rss[800],
      }}
      style={{ padding: 16, width: '100%', maxWidth: 520, maxHeight: 'min(72vh, 640px)', display: 'flex', flexDirection: 'column' }}
    >
      <Column style={{ gap: 12, minHeight: 0 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <Column style={{ gap: 6, flex: 1, minWidth: 0 }}>
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.BOLD} color={mainColors.white}>
              Upload summary
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.55)">
              {result.input_total} file(s) selected · {result.total} queued · {result.success} imported
              {rows.length > 0 ? ` · ${rows.length} need attention` : ''}
            </Typography>
          </Column>
          <Button variant="secondary" kind="elevated" colorMode="dark" size="small" onClick={onDismiss}>
            Dismiss
          </Button>
        </Row>

        {visible.length > 0 && (
          <Column style={{ gap: 8, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <Row style={{ gap: 12, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              <Typography
                fontType={FontType.BODY}
                fontSize={12}
                fontWeight={FontWeights.SEMI_BOLD}
                color={colorPalette.rss[400]}
                style={{ flex: '0 0 38%', minWidth: 0 }}
              >
                File
              </Typography>
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.SEMI_BOLD} color={colorPalette.rss[400]} style={{ flex: 1, minWidth: 0 }}>
                Reason
              </Typography>
            </Row>
            {visible.map((row, i) => (
              <Row key={`${row.fileName}-${i}`} style={{ gap: 12, alignItems: 'flex-start' }}>
                <Typography
                  fontType={FontType.BODY}
                  fontSize={12}
                  fontWeight={FontWeights.MEDIUM}
                  color={mainColors.white}
                  style={{
                    flex: '0 0 38%',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.fileName}
                >
                  {row.fileName}
                </Typography>
                <Typography
                  fontType={FontType.BODY}
                  fontSize={12}
                  fontWeight={FontWeights.REGULAR}
                  color="rgba(255,255,255,0.65)"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {row.detail}
                </Typography>
              </Row>
            ))}
            {hidden > 0 && (
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.45)">
                + {hidden} more (fix the listed files first, then re-upload the rest)
              </Typography>
            )}
          </Column>
        )}
      </Column>
    </ElevatedCard>
  );
}

export interface BulkUploadSummaryModalProps {
  open: boolean;
  result: BulkUploadResult | null;
  onDismiss: () => void;
}

export function BulkUploadSummaryModal({ open, result, onDismiss }: BulkUploadSummaryModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onDismiss]);

  if (!open || !result) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
        }}
        onClick={onDismiss}
        aria-hidden
      />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 520, zIndex: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label="Upload summary"
      >
        <BulkUploadSummaryCard result={result} onDismiss={onDismiss} />
      </div>
    </div>
  );
}
