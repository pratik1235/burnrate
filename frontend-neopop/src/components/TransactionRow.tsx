import { useState, useEffect, useMemo, useCallback } from 'react';
import { Typography, Tag } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import styled from 'styled-components';
import { formatCurrency } from '@/lib/utils';
import type { Transaction } from '@/lib/types';
import { CATEGORY_CONFIG, BANK_CONFIG } from '@/lib/types';
import { updateTransactionTags, updateTransactionCategory, getAllCategories, getTagDefinitions } from '@/lib/api';
import { SelectDropdown, type SelectDropdownOption } from '@/components/SelectDropdown';
import {
  UtensilsCrossed,
  ShoppingBag,
  Car,
  Receipt,
  Film,
  Fuel,
  Heart,
  ShoppingCart,
  CreditCard,
  Coins,
  MoreHorizontal,
  EyeOff,
  Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

let _categoryCache: Record<string, { name: string; color: string; icon: string }> | null = null;
let _categoryCachePromise: Promise<void> | null = null;

function loadCategoryCache(): Promise<void> {
  if (_categoryCache) return Promise.resolve();
  if (_categoryCachePromise) return _categoryCachePromise;
  _categoryCachePromise = getAllCategories()
    .then((data) => {
      _categoryCache = {};
      for (const c of data) {
        _categoryCache![c.slug] = { name: c.name, color: c.color, icon: c.icon };
      }
    })
    .catch(() => {
      _categoryCache = {};
    });
  return _categoryCachePromise;
}

const ICON_MAP: Record<string, LucideIcon> = {
  UtensilsCrossed,
  ShoppingBag,
  Car,
  Receipt,
  Film,
  Fuel,
  Heart,
  ShoppingCart,
  CreditCard,
  Coins,
  MoreHorizontal,
};

const TagBtn = styled.div`
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;

  /* Reduce trigger height by ~20% — NeoPOP DropdownContainer is a div with 10px vertical padding */
  [class*="DropdownContainer"] {
    padding-top: 3px !important;
    padding-bottom: 3px !important;
    padding-left: 5px !important;
    padding-right: 5px !important;
  }
`;

const CategoryBadge = styled.span<{ $bgColor: string; $color: string }>`
  padding: 2px 8px;
  border-radius: 12px;
  background-color: ${(p) => p.$bgColor};
  color: ${(p) => p.$color};
  cursor: pointer;
  border: 1px solid transparent;
  transition: border-color 0.2s;
  display: inline-flex;
  align-items: center;

  &:hover {
    border-color: ${(p) => p.$color};
  }
`;

const RowContainer = styled.div<{ $isCcPayment: boolean; $isExcluded: boolean }>`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background-color: ${({ $isCcPayment }) => $isCcPayment ? 'rgba(107,114,128,0.08)' : 'rgba(255,255,255,0.03)'};
  border-radius: 8px;
  margin-bottom: 4px;
  opacity: ${({ $isCcPayment, $isExcluded }) => ($isExcluded ? 0.35 : $isCcPayment ? 0.7 : 1)};
  filter: ${({ $isExcluded }) => ($isExcluded ? 'grayscale(40%)' : 'none')};

  &:hover ${TagBtn} {
    opacity: 1;
  }
`;

interface TransactionRowProps {
  transaction: Transaction;
  className?: string;
  exclusionMode?: boolean;
  isExcluded?: boolean;
  onToggleExclude?: (id: string) => void;
}

export function TransactionRow({ transaction, className, exclusionMode, isExcluded, onToggleExclude }: TransactionRowProps) {
  const [tags, setTags] = useState<string[]>(transaction.tags ?? []);
  const [catMap, setCatMap] = useState<Record<string, { name: string; color: string; icon: string }>>({});
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [localCategory, setLocalCategory] = useState<string>(transaction.category);

  useEffect(() => {
    let cancelled = false;
    loadCategoryCache().then(() => {
      if (!cancelled && _categoryCache) setCatMap(_categoryCache);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTagDefinitions()
      .then((data) => { if (!cancelled) setAvailableTags(data.map((t: any) => t.name)); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setTags(transaction.tags ?? []);
  }, [transaction.id, transaction.tags?.join(',')]);

  useEffect(() => {
    setLocalCategory(transaction.category);
  }, [transaction.id, transaction.category]);

  const tagOptions = useMemo<SelectDropdownOption[]>(
    () => availableTags.map((name) => ({ value: name, label: name })),
    [availableTags],
  );

  const categoryOptions = useMemo<SelectDropdownOption[]>(() => {
    const prebuilt = Object.entries(CATEGORY_CONFIG).map(([slug, config]) => ({
      value: slug,
      label: config.label,
    }));
    const custom = Object.entries(catMap)
      .filter(([slug]) => !CATEGORY_CONFIG[slug])
      .map(([slug, cat]) => ({ value: slug, label: cat.name }));
    return [...prebuilt, ...custom].sort((a, b) => a.label.localeCompare(b.label));
  }, [catMap]);

  const handleTagSelectionChange = useCallback(
    (next: string[]) => {
      const prev = tags;
      setTags(next);
      updateTransactionTags(transaction.id, next).catch(() => setTags(prev));
    },
    [tags, transaction.id],
  );

  const handleCategorySelection = useCallback((newSlug: string) => {
    if (newSlug === localCategory) return;
    const old = localCategory;
    setLocalCategory(newSlug);
    updateTransactionCategory(transaction.id, newSlug).catch(() => {
      setLocalCategory(old);
    });
  }, [transaction.id, localCategory]);

  const dynamicCat = catMap[localCategory];
  const catColor = dynamicCat?.color ?? CATEGORY_CONFIG[localCategory]?.color ?? colorPalette.black[50];
  const catLabel = dynamicCat?.name ?? CATEGORY_CONFIG[localCategory]?.label ?? localCategory;
  const catIcon = dynamicCat?.icon ?? CATEGORY_CONFIG[localCategory]?.icon ?? 'MoreHorizontal';
  const Icon = ICON_MAP[catIcon] ?? MoreHorizontal;
  const bankConfig = BANK_CONFIG[transaction.bank] ?? BANK_CONFIG.hdfc;
  const isCredit = transaction.type === 'credit';
  const isCcPayment = localCategory === 'cc_payment';

  const handleToggleExclude = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExclude?.(transaction.id);
  };

  const showExcludeIcon = exclusionMode && onToggleExclude;

  return (
    <RowContainer $isCcPayment={isCcPayment} $isExcluded={!!isExcluded} className={className}>
      {showExcludeIcon && (
        <button
          type="button"
          onClick={handleToggleExclude}
          aria-label={isExcluded ? 'Include transaction' : 'Exclude transaction'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            flexShrink: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {isExcluded ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      )}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${catColor}20`,
        }}
      >
        <Icon size={18} color={catColor} />
      </div>

      <div style={{ flex: 1, minWidth: 0, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Typography
            fontType={FontType.BODY}
            fontSize={14}
            fontWeight={FontWeights.SEMI_BOLD}
            color={mainColors.white}
            style={{ overflow: 'visible', marginRight: '10em', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '10.5em', maxWidth: 'calc(100% - 35em)', flex: 1 }}
          >
            {transaction.merchant}
          </Typography>

          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', flexShrink: 0 }}>
              {tags.map((tag) => (
                <Tag
                  key={tag}
                  colorConfig={{ background: 'rgba(255,135,68,0.15)', color: colorPalette.rss[500] }}
                  colorMode="dark"
                >
                  {tag}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {/* Category row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          
          
          <Typography
            as="span"
            fontType={FontType.BODY}
            fontSize={10}
            fontWeight={FontWeights.BOLD}
            color={transaction.source === 'BANK' ? '#3B82F6' : colorPalette.rss[500]}
            style={{
              padding: '1px 5px',
              borderRadius: 3,
              background: transaction.source === 'BANK' ? 'rgba(59,130,246,0.15)' : 'rgba(255,135,68,0.15)',
            }}
          >
            {transaction.source === 'BANK' ? 'BANK' : 'CC'}
          </Typography>
          <SelectDropdown
            selectionMode="single"
            options={categoryOptions}
            value={localCategory}
            onChange={handleCategorySelection}
            menuMount="portal"
            menuMinWidth={200}
            menuMaxHeight={300}
            menuOffset={4}
            menuBackgroundColor={colorPalette.popBlack[300]}
            onRootMouseDown={(e) => e.stopPropagation()}
            customTrigger={
              <CategoryBadge
                $bgColor={`${catColor}30`}
                $color={catColor}
                title={isCcPayment ? 'Credit card statement repayments are not included in spends calculation' : undefined}
              >
                <Typography
                  as="span"
                  fontType={FontType.BODY}
                  fontSize={12}
                  fontWeight={FontWeights.MEDIUM}
                  color="inherit"
                >
                  {catLabel}
                </Typography>
              </CategoryBadge>
            }
          />
          
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            {bankConfig.name} {transaction.cardLast4 ? `...${transaction.cardLast4}` : ''}
          </Typography> 
          
          {isCcPayment && (
            <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.35)">
              Not included in spends
            </Typography>
          )}
          <TagBtn style={{ position: 'relative' }}>
            <SelectDropdown
              selectionMode="multi"
              options={tagOptions}
              selectedValues={tags}
              onSelectedValuesChange={handleTagSelectionChange}
              maxSelected={3}
              staticTriggerLabel="Tag Transaction"
              placeholder="Tag Transaction"
              menuMount="portal"
              menuMinWidth={120}
              menuMaxHeight={190}
              
              menuOffset={4}
              menuBackgroundColor={colorPalette.popBlack[300]}
              colorConfig={{
                border: 'rgba(255,255,255,0.15)',
                text: 'rgba(255,255,255,0.5)',
                chevron: 'rgba(255,255,255,0.5)',
              }}
              emptyMenuContent={
                <Typography
                  fontType={FontType.BODY}
                  fontSize={12}
                  fontWeight={FontWeights.REGULAR}
                  color="rgba(255,255,255,0.5)"
                  style={{ maxWidth: 180, lineHeight: '1.4' }}
                >
                  You need to define tags on the Customize page first in order to use them.
                </Typography>
              }
              onRootMouseDown={(e) => e.stopPropagation()}
              ariaLabel="Tag transaction"
            />
          </TagBtn>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography
          fontType={FontType.BODY}
          fontSize={14}
          fontWeight={FontWeights.SEMI_BOLD}
          color={isCredit ? mainColors.green : mainColors.white}
        >
          {isCredit ? '+' : '-'}{formatCurrency(transaction.amount, transaction.currency ?? 'INR')}
        </Typography>
        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginTop: 4 }}>
          {new Date(transaction.date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Typography>
      </div>
    </RowContainer>
  );
}
