import { useState, useEffect, useRef, useCallback } from 'react';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import { Button, InputField } from '@cred/neopop-web/lib/components';
import { Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import type { Bank } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';
import { Plus, Trash2, FolderOpen, Shield } from 'lucide-react';
import { api } from '@/lib/api';

export interface CardEntry {
  /** Present for cards loaded from the server (update flow); omitted for newly added rows */
  id?: string;
  bank: Bank;
  last4: string;
}

export interface SetupFormData {
  name: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  cards: CardEntry[];
  watchFolder: string;
  /** Empty = no preference (amounts still follow each transaction's currency) */
  displayCurrency: string;
}

export interface SetupFormInitialData {
  name?: string;
  dobDay?: string;
  dobMonth?: string;
  dobYear?: string;
  cards?: CardEntry[];
  watchFolder?: string;
  displayCurrency?: string;
}

interface SetupFormProps {
  onSubmit?: (data: SetupFormData) => void;
  className?: string;
  initialData?: SetupFormInitialData;
  isUpdate?: boolean;
}

const BANKS: { id: Bank; name: string; color: string }[] = (
  Object.entries(BANK_CONFIG) as [Bank, (typeof BANK_CONFIG)[Bank]][]
).map(([id, config]) => ({ id, name: config.name, color: config.color }));

export function SetupForm({ onSubmit, className, initialData, isUpdate = false }: SetupFormProps) {
  const [name, setName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [cards, setCards] = useState<CardEntry[]>([{ bank: 'hdfc', last4: '' }]);
  const [watchFolder, setWatchFolder] = useState('');
  const [displayCurrency, setDisplayCurrency] = useState('');

  const dobDayRef = useRef<HTMLInputElement | null>(null);
  const dobMonthRef = useRef<HTMLInputElement | null>(null);
  const dobYearRef = useRef<HTMLInputElement | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (initialData) {
      if (initialData.name) setName(initialData.name);
      if (initialData.dobDay) setDobDay(initialData.dobDay);
      if (initialData.dobMonth) setDobMonth(initialData.dobMonth);
      if (initialData.dobYear) setDobYear(initialData.dobYear);
      if (initialData.watchFolder) setWatchFolder(initialData.watchFolder);
      if (initialData.displayCurrency !== undefined) {
        setDisplayCurrency(initialData.displayCurrency ?? '');
      }
      if (initialData.cards && initialData.cards.length > 0) {
        setCards(initialData.cards);
      }
    }
  }, [initialData]);

  const handleBrowse = useCallback(async () => {
    try {
      const { data } = await api.post('/settings/browse-folder');
      if (cancelledRef.current) return;
      if (data.path) {
        setWatchFolder(data.path);
        return;
      }
    } catch {
      if (cancelledRef.current) return;
      // Backend not available, fall through
    }
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as Window & { showDirectoryPicker: (opts?: { mode?: string }) => Promise<{ name: string }> }).showDirectoryPicker({ mode: 'read' });
        if (!cancelledRef.current) setWatchFolder(handle.name);
      } catch {
        // User cancelled
      }
    }
  }, []);

  const addCard = useCallback(() => {
    setCards((prev) => [...prev, { bank: 'hdfc', last4: '' }]);
  }, []);

  const removeCard = useCallback((index: number) => {
    setCards((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }, []);

  const updateCard = useCallback((index: number, field: keyof CardEntry, value: string) => {
    setCards((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({ name, dobDay, dobMonth, dobYear, cards, watchFolder, displayCurrency });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: mainColors.black,
      }}
      className={className}
    >
      <div style={{ width: '100%', maxWidth: 448, boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <img src="/burnrate-logo.svg" alt="Burnrate" style={{ width: 28, height: 28 }} />
            <Typography fontType={FontType.BODY} fontSize={24} fontWeight={FontWeights.BOLD} color={mainColors.white} style={{ letterSpacing: '-0.02em' }}>
              burnrate
            </Typography>
          </div>
          <Typography fontType={FontType.BODY} fontSize={20} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white} style={{ marginBottom: 8 }}>
            Let's make sense of your spends.
          </Typography>
          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
            Set up your cards once, and we'll handle the rest.
          </Typography>
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.35)" style={{ marginTop: 6 }}>
            These details are needed to unlock and process your statement files.
          </Typography>
        </div>

        <form onSubmit={handleSubmit} style={{ boxSizing: 'border-box' }}>
          <div
            style={{
              backgroundColor: colorPalette.black[90],
              borderRadius: 16,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden',
              boxSizing: 'border-box',
              maxWidth: 448,
              width: '100%',
            }}
          >
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }}>
                Your name as on card</Typography>
              <InputField
                colorMode="dark"
                placeholder="Your Name"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', fontWeight: FontWeights.MEDIUM, padding: '10px 12px 5px 12px', border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 8, fontSize: 18, color: '#ffffff', outline: 'visible' }}
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }}>
                Date of Birth
              </Typography>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 8, overflow: 'hidden' }}>
                <input
                  ref={dobDayRef}
                  value={dobDay}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setDobDay(value);
                    if (value.length === 2) {
                      dobMonthRef.current?.focus();
                    }
                  }}
                  placeholder="DD"
                  maxLength={2}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                    color: '#ffffff',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    outline: 'none',
                    fontSize: 14,
                    textAlign: 'center',
                  }}
                />
                <input
                  ref={dobMonthRef}
                  value={dobMonth}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setDobMonth(value);
                    if (value.length === 2) {
                      dobYearRef.current?.focus();
                    }
                  }}
                  placeholder="MM"
                  maxLength={2}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                    color: '#ffffff',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    outline: 'none',
                    fontSize: 14,
                    textAlign: 'center',
                  }}
                />
                <input
                  ref={dobYearRef}
                  value={dobYear}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDobYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="YYYY"
                  maxLength={4}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                    color: '#ffffff',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    outline: 'none',
                    fontSize: 14,
                    textAlign: 'center',
                  }}
                />
              </div>
            </div>

            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }}>
                Your Credit Cards
              </Typography>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cards.map((card, index) => (
                  <div
                    key={card.id ?? `new-${index}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                  >
                    <select
                      value={card.bank}
                      onChange={(e) => updateCard(index, 'bank', e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        boxSizing: 'border-box',
                        backgroundColor: 'rgba(0, 0, 0, 0.05)',
                        color: '#ffffff',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.2)',
                        outline: 'none',
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                    >
                      {BANKS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <Typography
                        as="span"
                        fontType={FontType.BODY}
                        fontSize={12}
                        fontWeight={FontWeights.REGULAR}
                        color="rgba(255,255,255,0.5)"
                        style={{
                          position: 'absolute',
                          left: 12,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      >
                        ····
                      </Typography>
                      <input
                        value={card.last4}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCard(index, 'last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="1234"
                        maxLength={4}
                        style={{
                          width: 96,
                          paddingLeft: 40,
                          boxSizing: 'border-box',
                          backgroundColor: 'rgba(0, 0, 0, 0.05)',
                          color: '#ffffff',
                          padding: '10px 12px 10px 40px',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.2)',
                          outline: 'none',
                          fontSize: 14,
                        }}
                      />
                    </div>
                    {cards.length > 1 && (
                      <Button
                        type="button"
                        variant="primary"
                        kind="elevated"
                        size="small"
                        colorMode="dark"
                        onClick={() => removeCard(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'rgba(255,255,255,0.5)',
                          minWidth: 32,
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ height: 3 }} />
              <ButtonWithIcon
                type="button"
                icon={Plus}
                variant="primary"
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={addCard}
                gap={6}
                justifyContent="flex-start"
                labelTypographyProps={{ fontSize: 12, color: colorPalette.rss[500] }}
                style={{
                  marginTop: 8,
                  background: 'none',
                  border: 'none',
                  alignSelf: 'flex-start',
                  maxWidth: 180,
                }}
              >
                Add another card
              </ButtonWithIcon>
            </div>

            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <InputField
                    colorMode="dark"
                    placeholder="Path to statements folder"
                    label="Watch folder for new statements"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', fontWeight: FontWeights.MEDIUM, padding: '10px 12px 5px 12px', border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 8, fontSize: 14, color: '#ffffff', outline: 'visible' }}
                    value={watchFolder}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWatchFolder(e.target.value)}
                  />
                </div>
                <ButtonWithIcon
                  type="button"
                  icon={FolderOpen}
                  variant="primary"
                  kind="elevated"
                  size="medium"
                  colorMode="dark"
                  onClick={() => void handleBrowse()}
                  gap={4}
                  justifyContent="center"
                >
                  Browse
                </ButtonWithIcon>
              </div>
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginTop: 4 }}>
                Tip: Sync your Google Drive here for auto-import
              </Typography>
            </div>

            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }}>
                Display preference (optional)
              </Typography>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: 280,
                  boxSizing: 'border-box',
                  backgroundColor: 'rgba(0, 0, 0, 0.05)',
                  color: '#ffffff',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  outline: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <option value="">Auto (from transaction currency)</option>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
              <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.45)" style={{ marginTop: 4 }}>
                Does not convert amounts; used for empty states and ordering only.
              </Typography>
            </div>

            <Button type="submit" variant="primary" kind="elevated" size="big" colorMode="dark" fullWidth style={{ marginTop: 8 }}>
              {isUpdate ? 'Update' : 'Save & Continue'}
            </Button>
          </div>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          <Shield size={12} color="rgba(255,255,255,0.5)" />
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            Your data never leaves your laptop.
          </Typography>
        </div>
      </div>
    </div>
  );
}