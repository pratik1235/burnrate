import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { formatCurrencyCompact, formatCurrency } from '@/lib/utils';

interface CashFlowData {
  month: string;
  spend: number;
}

function CustomTooltip({
  active,
  payload,
  label,
  currency = 'INR',
}: TooltipProps<number, string> & { currency?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: colorPalette.black[90],
        borderRadius: 8,
        padding: '8px 12px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)" style={{ marginBottom: 4 }}>{label}</Typography>
      <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
        {formatCurrency(payload[0].value as number, currency)}
      </Typography>
    </div>
  );
}

interface CashFlowChartProps {
  data: CashFlowData[];
  currency?: string;
  className?: string;
}

export function CashFlowChart({ data, currency = 'INR', className }: CashFlowChartProps) {
  return (
    <div
      style={{ padding: 20, minWidth: 320, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
          Cash Flow ({currency})
        </Typography>
        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
          {data.length} months
        </Typography>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="25%">
          <defs>
            <linearGradient id="neopopBarGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={colorPalette.rss[500]} stopOpacity={0.85} />
              <stop offset="100%" stopColor="#FFAB7C" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" strokeOpacity={0.8} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
            tickFormatter={(v) => formatCurrencyCompact(v, currency)}
            width={45}
          />
          <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 6 }} />
          <Bar
            dataKey="spend"
            fill="url(#neopopBarGradient)"
            radius={[6, 6, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
