import { useState, useEffect, useRef } from 'react';
import { ElevatedCard, InputField } from '@cred/neopop-web/lib/components';
import { Typography } from '@cred/neopop-web/lib/components';
import { colorPalette } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { Button } from '@cred/neopop-web/lib/components';
import { Search } from 'lucide-react';
import { CloseButton } from '@/components/CloseButton';
import { CATEGORY_CONFIG, type Category } from '@/lib/types';

interface CommandSearchProps {
  open: boolean;
  onClose: () => void;
  onSearch?: (query: string, filters: SearchFilters) => void;
  className?: string;
}

interface SearchFilters {
  categories: Category[];
}

const FILTER_CHIPS: { id: Category; label: string }[] = (
  Object.entries(CATEGORY_CONFIG) as [Category, (typeof CATEGORY_CONFIG)[Category]][]
).map(([id, config]) => ({ id, label: config.label }));

export function CommandSearch({ open, onClose, onSearch, className }: CommandSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setSelectedCategories([]);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const toggleCategory = (cat: Category) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSearch = () => {
    onSearch?.(query, { categories: selectedCategories });
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh' }}>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      />

      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
        className={className}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Search size={18} color="rgba(255,255,255,0.5)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <InputField
              colorMode="dark"
              placeholder="Search transactions..."
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearch()}
              inputRef={inputRef}
            />
          </div>
          <CloseButton onClick={onClose} variant="transparent" />
        </div>

        <div style={{ padding: 16 }}>
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)" style={{ marginBottom: 8 }}>
            Categories
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FILTER_CHIPS.map((chip) => (
              <Button
                key={chip.id}
                variant={selectedCategories.includes(chip.id) ? 'secondary' : 'primary'}
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => toggleCategory(chip.id)}
              >
                {chip.label}
              </Button>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(255,255,255,0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            Type to search by merchant, amount, or description
          </Typography>
          <kbd style={{ fontSize: 12, backgroundColor: colorPalette.black[100], border: '1px solid rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
            esc
          </kbd>
        </div>
      </ElevatedCard>
    </div>
  );
}
