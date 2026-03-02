import { formatCurrency } from '@/lib/utils';
import { Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface SpendSummaryProps {
  totalSpend: number;
  deltaPercent: number;
  deltaLabel?: string;
  sparklineData: { value: number }[];
  period: string;
  className?: string;
}

export function SpendSummary({
  totalSpend,
  deltaPercent,
  deltaLabel = 'vs last month',
  sparklineData,
  period,
  className,
}: SpendSummaryProps) {
  const isUp = deltaPercent >= 0;

  return (
    <div
      style={{ padding: 20, minWidth: 280, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}
      className={className}
    >
      <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)" style={{ marginBottom: 4 }}>
        Total Spend · {period}
      </Typography>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Typography fontType={FontType.BODY} fontSize={28} fontWeight={FontWeights.BOLD} color={mainColors.white} style={{ letterSpacing: '-0.02em' }}>
            {formatCurrency(totalSpend)}
          </Typography>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            {isUp ? (
              <TrendingUp size={14} color={mainColors.red} />
            ) : (
              <TrendingDown size={14} color={mainColors.green} />
            )}
            <Typography
              fontType={FontType.BODY}
              fontSize={12}
              fontWeight={FontWeights.MEDIUM}
              color={isUp ? mainColors.red : mainColors.green}
            >
              {isUp ? '+' : ''}{deltaPercent}% {deltaLabel}
            </Typography>
          </div>
        </div>

        <div style={{ width: 128, height: 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id="neopopSparkGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorPalette.rss[500]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={colorPalette.rss[500]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={colorPalette.rss[500]}
                strokeWidth={2.5}
                fill="url(#neopopSparkGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
