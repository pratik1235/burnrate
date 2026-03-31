import { Typography } from '@cred/neopop-web/lib/components';
import { mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Bank } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';

interface CardWidgetProps {
  bank: Bank;
  last4: string;
  totalSpend: number;
  /** When multiple currency rows exist for this card */
  spendLines?: { amount: number; currency: string }[];
  transactionCount: number;
  className?: string;
}

export function CardWidget({ bank, last4, totalSpend, spendLines, transactionCount, className }: CardWidgetProps) {
  const config = BANK_CONFIG[bank];

  return (
    <div
      style={{ padding: 20, minWidth: 280, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: config.color,
              color: mainColors.white,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {config.logo}
          </div>
          <div>
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              {config.name}
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              ...{last4}
            </Typography>
          </div>
        </div>
        <CreditCard size={18} color="rgba(255,255,255,0.5)" />
      </div>

      <div style={{ marginBottom: 4 }}>
        {spendLines && spendLines.length > 0 ? (
          spendLines
            .slice()
            .sort((a, b) => a.currency.localeCompare(b.currency))
            .map((line) => (
              <Typography key={line.currency} fontType={FontType.BODY} fontSize={20} fontWeight={FontWeights.BOLD} color={mainColors.white}>
                {formatCurrency(line.amount, line.currency)}
              </Typography>
            ))
        ) : (
          <Typography fontType={FontType.BODY} fontSize={24} fontWeight={FontWeights.BOLD} color={mainColors.white}>
            {formatCurrency(totalSpend)}
          </Typography>
        )}
      </div>
      <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
        {transactionCount} transaction{transactionCount !== 1 ? 's' : ''}
      </Typography>
    </div>
  );
}
