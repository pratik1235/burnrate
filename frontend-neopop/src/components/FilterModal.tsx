import { useState, useEffect } from 'react';
import { ElevatedCard, InputField } from '@cred/neopop-web/lib/components';
import { Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { Button } from '@cred/neopop-web/lib/components';
import { CloseButton } from '@/components/CloseButton';
import { useFilters, type Direction, type SourceFilter } from '@/contexts/FilterContext';
import { useCards } from '@/hooks/useApi';
import { getAllCategories, getTagDefinitions, getBankAccountKeys } from '@/lib/api';
import type { Source } from '@/lib/types';

export interface BankStatementFilterValues {
  banks: string[];
  from?: string;
  to?: string;
  /** When set, list only credit card or bank-account statements. */
  source?: Source;
}

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  variant?: 'full' | 'bankStatements';
  /** Distinct bank slugs from imported BANK statements (for bankStatements variant) */
  availableBanks?: string[];
  bankStatementFilters?: BankStatementFilterValues;
  onApplyBankStatements?: (f: BankStatementFilterValues) => void;
}

export function FilterModal({
  open,
  onClose,
  variant = 'full',
  availableBanks = [],
  bankStatementFilters,
  onApplyBankStatements,
}: FilterModalProps) {
  const { filters, setFilters, clearFilters } = useFilters();
  const { cards } = useCards();

  const [allCategories, setAllCategories] = useState<{ slug: string; name: string; color: string }[]>([]);
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string }[]>([]);
  const [bankAccountOptions, setBankAccountOptions] = useState<{ id: string; bank: string; last4: string }[]>([]);
  const [localCards, setLocalCards] = useState<string[]>([]);
  const [localBankAccounts, setLocalBankAccounts] = useState<string[]>([]);
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [localDirection, setLocalDirection] = useState<Direction>('all');
  const [localSource, setLocalSource] = useState<SourceFilter>('all');
  const [localFrom, setLocalFrom] = useState('');
  const [localTo, setLocalTo] = useState('');
  const [localMin, setLocalMin] = useState('');
  const [localMax, setLocalMax] = useState('');
  const [localStmtBanks, setLocalStmtBanks] = useState<string[]>([]);
  const [localStmtFrom, setLocalStmtFrom] = useState('');
  const [localStmtTo, setLocalStmtTo] = useState('');
  const [localStmtSource, setLocalStmtSource] = useState<'all' | Source>('all');

  useEffect(() => {
    let cancelled = false;
    getAllCategories()
      .then((data) => {
        if (!cancelled) setAllCategories(data.map((c) => ({ slug: c.slug, name: c.name, color: c.color })));
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTagDefinitions()
      .then((data) => { if (!cancelled) setAvailableTags(data as unknown as { id: string; name: string }[]); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open || variant !== 'full') return;
    let cancelled = false;
    getBankAccountKeys()
      .then((rows) => { if (!cancelled) setBankAccountOptions(rows); })
      .catch(() => { if (!cancelled) setBankAccountOptions([]); });
    return () => { cancelled = true; };
  }, [open, variant]);

  const safeCards = Array.isArray(cards) ? cards : [];

  useEffect(() => {
    if (!open) return;
    if (variant === 'bankStatements') {
      setLocalStmtBanks(bankStatementFilters?.banks ?? []);
      setLocalStmtFrom(bankStatementFilters?.from ?? '');
      setLocalStmtTo(bankStatementFilters?.to ?? '');
      setLocalStmtSource(bankStatementFilters?.source ?? 'all');
      return;
    }
    setLocalCards(filters.selectedCards);
    setLocalBankAccounts(filters.selectedBankAccounts ?? []);
    setLocalCategories(filters.selectedCategories);
    setLocalTags(filters.selectedTags ?? []);
    setLocalDirection(filters.direction);
    setLocalSource(filters.source ?? 'all');
    setLocalFrom(filters.dateRange.from ?? '');
    setLocalTo(filters.dateRange.to ?? '');
    setLocalMin(filters.amountRange.min?.toString() ?? '');
    setLocalMax(filters.amountRange.max?.toString() ?? '');
  }, [open, variant, filters, bankStatementFilters]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const toggleCard = (id: string) => {
    setLocalCards((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleBankAccount = (id: string) => {
    setLocalBankAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const toggleStmtBank = (slug: string) => {
    setLocalStmtBanks((prev) =>
      prev.includes(slug) ? prev.filter((b) => b !== slug) : [...prev, slug]
    );
  };

  const toggleCategory = (cat: string) => {
    setLocalCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleTag = (tagName: string) => {
    setLocalTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  };

  const handleApply = () => {
    if (variant === 'bankStatements') {
      onApplyBankStatements?.({
        banks: localStmtBanks,
        from: localStmtFrom || undefined,
        to: localStmtTo || undefined,
        source: localStmtSource === 'all' ? undefined : localStmtSource,
      });
      onClose();
      return;
    }
    setFilters({
      selectedCards: localCards,
      selectedBankAccounts: localBankAccounts,
      selectedCategories: localCategories,
      selectedTags: localTags,
      direction: localDirection,
      source: localSource,
      dateRange: {
        from: localFrom || undefined,
        to: localTo || undefined,
      },
      amountRange: {
        min: localMin ? Number(localMin) : undefined,
        max: localMax ? Number(localMax) : undefined,
      },
    });
    onClose();
  };

  const handleClearAll = () => {
    if (variant === 'bankStatements') {
      onApplyBankStatements?.({ banks: [], from: undefined, to: undefined, source: undefined });
      setLocalStmtBanks([]);
      setLocalStmtFrom('');
      setLocalStmtTo('');
      setLocalStmtSource('all');
      onClose();
      return;
    }
    clearFilters();
    onClose();
  };

  if (!open) return null;

  const inputStyle = {
    backgroundColor: colorPalette.black[100],
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    color: '#ffffff',
    outline: 'none' as const,
    width: '100%',
    colorScheme: 'dark' as const,
  };

  const uniqueBanks = Array.from(new Set(availableBanks.filter(Boolean))).sort();

  if (variant === 'bankStatements') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
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
        />
        <ElevatedCard
          backgroundColor={colorPalette.black[90]}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 520,
            maxHeight: '80vh',
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
              Filters
            </Typography>
            <CloseButton onClick={onClose} variant="modal" />
          </div>
          <div style={{ padding: 20 }}>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)" style={{ marginBottom: 10 }}>
              Bank name
            </Typography>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {uniqueBanks.length === 0 ? (
                <Typography fontType={FontType.BODY} fontSize={13} color="rgba(255,255,255,0.45)">
                  Import a bank statement to filter by bank.
                </Typography>
              ) : (
                uniqueBanks.map((b) => (
                  <Button
                    key={b}
                    variant={localStmtBanks.includes(b) ? 'secondary' : 'primary'}
                    kind="elevated"
                    size="small"
                    colorMode="dark"
                    onClick={() => toggleStmtBank(b)}
                  >
                    {b.toUpperCase()}
                  </Button>
                ))
              )}
            </div>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)" style={{ marginBottom: 10 }}>
              Source
            </Typography>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {(['all', 'CC', 'BANK'] as const).map((src) => (
                <Button
                  key={src}
                  variant={localStmtSource === src ? 'secondary' : 'primary'}
                  kind="elevated"
                  size="small"
                  colorMode="dark"
                  onClick={() => setLocalStmtSource(src)}
                >
                  {src === 'all' ? 'All' : src}
                </Button>
              ))}
            </div>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)" style={{ marginBottom: 10 }}>
              Date range
            </Typography>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <InputField
                  colorMode="dark"
                  type="date"
                  className="filter-date-input-bs"
                  value={localStmtFrom}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalStmtFrom(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <InputField
                  colorMode="dark"
                  type="date"
                  className="filter-date-input-bs"
                  value={localStmtTo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalStmtTo(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <style>{`
              .filter-date-input-bs::-webkit-calendar-picker-indicator {
                filter: invert(0.7) sepia(1) saturate(5) hue-rotate(350deg);
                cursor: pointer;
                opacity: 1;
              }
            `}</style>
          </div>
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(255,255,255,0.02)',
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end',
            }}
          >
            <Button variant="secondary" kind="elevated" size="small" colorMode="dark" onClick={handleClearAll}>
              Clear All
            </Button>
            <Button variant="primary" kind="elevated" size="small" colorMode="dark" onClick={handleApply}>
              Apply Filters
            </Button>
          </div>
        </ElevatedCard>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
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
      />

      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          maxHeight: '80vh',
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
          <Typography
            fontType={FontType.BODY}
            fontSize={18}
            fontWeight={FontWeights.BOLD}
            color={mainColors.white}
          >
            Filters
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>

        <div style={{ padding: 20 }}>
          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color="rgba(255,255,255,0.5)"
            style={{ marginBottom: 10 }}
          >
            Cards
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {safeCards.map((card) => (
              <Button
                key={card.id}
                variant={localCards.includes(card.id) ? 'secondary' : 'primary'}
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => toggleCard(card.id)}
              >
                {card.bank} ...{card.last4}
              </Button>
            ))}
          </div>

          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color="rgba(255,255,255,0.5)"
            style={{ marginBottom: 10 }}
          >
            Bank accounts
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {bankAccountOptions.length === 0 ? (
              <Typography fontType={FontType.BODY} fontSize={13} color="rgba(255,255,255,0.45)">
                No bank account transactions yet.
              </Typography>
            ) : (
              bankAccountOptions.map((a) => (
                <Button
                  key={a.id}
                  variant={localBankAccounts.includes(a.id) ? 'secondary' : 'primary'}
                  kind="elevated"
                  size="small"
                  colorMode="dark"
                  onClick={() => toggleBankAccount(a.id)}
                >
                  {a.bank.toUpperCase()} ...{a.last4}
                </Button>
              ))
            )}
          </div>

          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color="rgba(255,255,255,0.5)"
            style={{ marginBottom: 10 }}
          >
            Direction
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {(['all', 'incoming', 'outgoing'] as const).map((d) => (
              <Button
                key={d}
                variant={localDirection === d ? 'secondary' : 'primary'}
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => setLocalDirection(d)}
              >
                {d === 'all' ? 'All' : d === 'incoming' ? 'Incoming' : 'Outgoing'}
              </Button>
            ))}
          </div>

          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color="rgba(255,255,255,0.5)"
            style={{ marginBottom: 10 }}
          >
            Source
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {(['all', 'CC', 'BANK'] as const).map((s) => (
              <Button
                key={s}
                variant={localSource === s ? 'secondary' : 'primary'}
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => setLocalSource(s)}
              >
                {s === 'all' ? 'All' : s === 'CC' ? 'Credit Card' : 'Bank Account'}
              </Button>
            ))}
          </div>

          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color="rgba(255,255,255,0.5)"
            style={{ marginBottom: 10 }}
          >
            Categories
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {allCategories.map((cat) => (
              <Button
                key={cat.slug}
                variant={localCategories.includes(cat.slug) ? 'secondary' : 'primary'}
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => toggleCategory(cat.slug)}
              >
                {cat.name}
              </Button>
            ))}
          </div>

          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color="rgba(255,255,255,0.5)"
            style={{ marginBottom: 10 }}
          >
            Date Range
          </Typography>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <InputField
                colorMode="dark"
                type="date"
                className="filter-date-input"
                value={localFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalFrom(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <InputField
                colorMode="dark"
                type="date"
                className="filter-date-input"
                value={localTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalTo(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <style>{`
            .filter-date-input::-webkit-calendar-picker-indicator {
              filter: invert(0.7) sepia(1) saturate(5) hue-rotate(350deg);
              cursor: pointer;
              opacity: 1;
            }
          `}</style>

          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color="rgba(255,255,255,0.5)"
            style={{ marginBottom: 10 }}
          >
            Amount Range
          </Typography>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1 }}>
              <InputField
                colorMode="dark"
                type="number"
                placeholder="Min"
                value={localMin}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalMin(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <InputField
                colorMode="dark"
                type="number"
                placeholder="Max"
                value={localMax}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalMax(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {availableTags.length > 0 && (
            <>
              <Typography
                fontType={FontType.BODY}
                fontSize={12}
                fontWeight={FontWeights.MEDIUM}
                color="rgba(255,255,255,0.5)"
                style={{ marginBottom: 10 }}
              >
                Tags
              </Typography>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {availableTags.map((tag) => (
                  <Button
                    key={tag.id}
                    variant={localTags.includes(tag.name) ? 'secondary' : 'primary'}
                    kind="elevated"
                    size="small"
                    colorMode="dark"
                    onClick={() => toggleTag(tag.name)}
                  >
                    {tag.name}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(255,255,255,0.02)',
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="secondary"
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={handleClearAll}
          >
            Clear All
          </Button>
          <Button
            variant="primary"
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={handleApply}
          >
            Apply Filters
          </Button>
        </div>
      </ElevatedCard>
    </div>
  );
}
