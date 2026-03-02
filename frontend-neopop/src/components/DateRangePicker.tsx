import { useState, useEffect } from 'react';
import { Button, Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { mainColors } from '@cred/neopop-web/lib/primitives';
import { Calendar } from 'lucide-react';

type Preset = 'this_month' | '3_months' | '6_months' | '1_year' | 'custom';

interface DateRangePickerProps {
  value?: Preset;
  onChange?: (preset: Preset, range?: { from: string; to: string }) => void;
  className?: string;
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: '3_months', label: '3 months' },
  { id: '6_months', label: '6 months' },
  { id: '1_year', label: '1 year' },
  { id: 'custom', label: 'Custom' },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [selected, setSelected] = useState<Preset | undefined>(value);
  const [showCustom, setShowCustom] = useState(value === 'custom');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    setSelected(value);
    setShowCustom(value === 'custom');
  }, [value]);

  const handleSelect = (preset: Preset) => {
    setSelected(preset);
    setShowCustom(preset === 'custom');
    if (preset !== 'custom') {
      onChange?.(preset);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className={className}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant={selected === preset.id ? 'secondary' : 'primary'}
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={() => handleSelect(preset.id)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Calendar size={16} color={mainColors.white} />
          <input
            type="date"
            className="filter-date-input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (to) onChange?.('custom', { from: e.target.value, to });
            }}
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: '#ffffff',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              outline: 'none',
              fontSize: 14,
              colorScheme: 'dark',
            }}
          />
          <Typography as="span" fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">to</Typography>
          <input
            type="date"
            className="filter-date-input"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (from) onChange?.('custom', { from, to: e.target.value });
            }}
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: '#ffffff',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              outline: 'none',
              fontSize: 14,
              colorScheme: 'dark',
            }}
          />
        </div>
      )}
      <style>{`
        .filter-date-input::-webkit-calendar-picker-indicator {
          filter: invert(0.7) sepia(1) saturate(5) hue-rotate(350deg);
          cursor: pointer;
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
