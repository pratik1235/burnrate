import { formatCurrency } from '@/lib/utils';
import { Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import type { MerchantSpend } from '@/lib/types';

interface TopMerchantsProps {
  data: MerchantSpend[];
  className?: string;
}

export function TopMerchants({ data, className }: TopMerchantsProps) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  return (
    <div
      style={{ padding: 20, minWidth: 280, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}
      className={className}
    >
      <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white} style={{ marginBottom: 16 }}>
        Top Merchants
      </Typography>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.map((merchant, i) => {
          const widthPct = (merchant.amount / maxAmount) * 100;
          return (
            <div key={merchant.merchant} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.BOLD} color={colorPalette.rss[500]} style={{ width: 24, textAlign: 'right' }}>
                {i + 1}
              </Typography>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color={mainColors.white} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {merchant.merchant}
                  </Typography>
                  <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.MEDIUM} color={mainColors.white} style={{ marginLeft: 8 }}>
                    {formatCurrency(merchant.amount)}
                  </Typography>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 8,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${widthPct}%`,
                      backgroundColor: colorPalette.rss[500],
                      borderRadius: 4,
                      transition: 'width 0.5s',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
