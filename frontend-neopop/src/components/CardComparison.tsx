import { formatCurrency } from '@/lib/utils';
import { Typography } from '@cred/neopop-web/lib/components';
import { mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import type { Bank } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';

interface CardSpend {
  bank: Bank;
  last4: string;
  amount: number;
}

interface CardComparisonProps {
  data: CardSpend[];
  period: string;
  className?: string;
}

export function CardComparison({ data, period, className }: CardComparisonProps) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  return (
    <div
      style={{ padding: 20, minWidth: 280, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
          Card Comparison
        </Typography>
        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
          {period}
        </Typography>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.map((card) => {
          const config = BANK_CONFIG[card.bank];
          const widthPct = (card.amount / maxAmount) * 100;
          return (
            <div key={`${card.bank}-${card.last4}`}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      backgroundColor: config.color,
                      color: mainColors.white,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {config.logo}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.MEDIUM} color={mainColors.white}>
                      {config.name}
                    </Typography>
                    <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                      ...{card.last4}
                    </Typography>
                  </div>
                </div>
                <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.MEDIUM} color={mainColors.white}>
                  {formatCurrency(card.amount)}
                </Typography>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 10,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${widthPct}%`,
                    backgroundColor: config.color,
                    borderRadius: 4,
                    transition: 'width 0.5s',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
