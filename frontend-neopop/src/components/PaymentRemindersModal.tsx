import { useCallback, useEffect, useState } from 'react';
import { Button, Typography, Row, Column } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import {
  SelectableElevatedCard as ElevatedCard,
  TRANSPARENT_ELEVATED_CARD_EDGES,
} from '@/components/SelectableElevatedCard';
import { CloseButton } from '@/components/CloseButton';
import {
  ackDueReminder,
  getDueReminders,
  localCalendarDateISO,
  type DueReminderItem,
} from '@/lib/api';
import { BANK_CONFIG, type Bank } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/components/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PaymentRemindersModal({ open, onClose }: Props) {
  const [items, setItems] = useState<DueReminderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const ld = localCalendarDateISO();
    const { items: next } = await getDueReminders(ld);
    setItems(next);
    if (next.length === 0) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const ld = localCalendarDateISO();
    getDueReminders(ld)
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load payment reminders');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handlePaid = async (cardId: string) => {
    setBusyId(cardId);
    try {
      await ackDueReminder(cardId);
      await refresh();
    } catch {
      toast.error('Could not mark as paid');
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
        aria-hidden
      />
      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        edgeColors={TRANSPARENT_ELEVATED_CARD_EDGES}
        style={{
          padding: 0,
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          maxHeight: '80vh',
          display: 'block',
          backgroundColor: 'transparent',
          overflow: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Typography fontType={FontType.BODY} fontSize={18} fontWeight={FontWeights.BOLD} color={mainColors.white}>
            Payments due
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              Loading…
            </Typography>
          ) : items.length === 0 ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              No upcoming payments need attention right now.
            </Typography>
          ) : (
            <Column style={{ gap: 14 }}>
              {items.map((item) => {
                const bankLabel =
                  BANK_CONFIG[item.bank as Bank]?.name ?? item.bank.toUpperCase();
                const amt =
                  item.totalAmountDue != null
                    ? formatCurrency(item.totalAmountDue, item.currency ?? 'INR')
                    : 'Amount not on file — check your statement';
                return (
                  <div
                    key={item.cardId}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <Column style={{ gap: 4, flex: 1 }}>
                        <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                          {bankLabel} ····{item.cardLast4}
                        </Typography>
                        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                          Due {fmtDate(item.dueDate)}
                          {item.usesManualDueDate ? ' · manual date' : ''}
                        </Typography>
                        <Typography fontType={FontType.BODY} fontSize={15} fontWeight={FontWeights.BOLD} color={colorPalette.rss[500]}>
                          {amt}
                        </Typography>
                      </Column>
                      <Button
                        variant="primary"
                        kind="elevated"
                        size="medium"
                        colorMode="dark"
                        disabled={busyId !== null}
                        onClick={() => void handlePaid(item.cardId)}
                      >
                        {busyId === item.cardId ? '…' : 'Mark as paid'}
                      </Button>
                    </Row>
                  </div>
                );
              })}
              <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.35)" style={{ marginTop: 8 }}>
                Close this window to be reminded again tomorrow if you have not marked paid.
              </Typography>
            </Column>
          )}
        </div>
      </ElevatedCard>
    </div>
  );
}
