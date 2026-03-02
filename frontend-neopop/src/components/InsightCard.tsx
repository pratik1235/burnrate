import { Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { Lightbulb } from 'lucide-react';

interface InsightCardProps {
  text: string;
  className?: string;
}

export function InsightCard({ text, className }: InsightCardProps) {
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: '3px solid rgba(255,135,68,0.4)',
        borderRadius: 12,
      }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,135,68,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <Lightbulb size={16} color={colorPalette.rss[500]} />
        </div>
        <div>
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color={colorPalette.rss[500]} style={{ marginBottom: 4 }}>
            Fun Insight
          </Typography>
          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color={mainColors.white} style={{ lineHeight: 1.6 }}>
            {text}
          </Typography>
        </div>
      </div>
    </div>
  );
}
