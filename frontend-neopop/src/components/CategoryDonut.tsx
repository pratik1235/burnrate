import { useState, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { formatCurrency } from '@/lib/utils';
import type { CategoryBreakdown } from '@/lib/types';
import { CATEGORY_CONFIG, CATEGORY_COLORS } from '@/lib/types';
import { getAllCategories } from '@/lib/api';

interface CategoryDonutProps {
  data: CategoryBreakdown[];
  className?: string;
}

function CustomTooltip({
  active,
  payload,
  catMap,
}: TooltipProps<number, string> & {
  catMap: Record<string, { name: string; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const category = entry.name as string;
  const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
  const color = catMap[category]?.color ?? CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.other;
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
      <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.SEMI_BOLD} color={color}>
        {catMap[category]?.name ?? config?.label ?? category}
      </Typography>
      <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
        {formatCurrency(entry.value as number)}
      </Typography>
    </div>
  );
}

export function CategoryDonut({ data, className }: CategoryDonutProps) {
  const [catMap, setCatMap] = useState<Record<string, { name: string; color: string }>>({});
  const total = data.reduce((sum, d) => sum + d.amount, 0);

  useEffect(() => {
    let cancelled = false;
    getAllCategories()
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, { name: string; color: string }> = {};
        for (const c of data) map[c.slug] = { name: c.name, color: c.color };
        setCatMap(map);
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      style={{ padding: 20, minWidth: 280, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}
      className={className}
    >
      <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white} style={{ marginBottom: 16 }}>
        Where your money goes
      </Typography>

      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <div style={{ width: 176, height: 176, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={72}
                paddingAngle={2}
                dataKey="amount"
                nameKey="category"
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.category}
                    fill={catMap[entry.category]?.color ?? CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.other}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip catMap={catMap} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
          {data.slice(0, 6).map((entry) => {
            const config = CATEGORY_CONFIG[entry.category as keyof typeof CATEGORY_CONFIG];
            const color = catMap[entry.category]?.color ?? CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.other;
            const pct = total > 0 ? Math.round((entry.amount / total) * 100) : 0;
            return (
              <div key={entry.category} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: color,
                  }}
                />
                <Typography
                  fontType={FontType.BODY}
                  fontSize={12}
                  fontWeight={FontWeights.REGULAR}
                  color={mainColors.white}
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {catMap[entry.category]?.name ?? config?.label ?? entry.category}
                </Typography>
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white} style={{ flexShrink: 0 }}>
                  {pct}%
                </Typography>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
