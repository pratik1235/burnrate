import { useState, useEffect } from 'react';
import { Typography, Tag } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { formatCurrency } from '@/lib/utils';
import type { Transaction } from '@/lib/types';
import { CATEGORY_CONFIG, BANK_CONFIG } from '@/lib/types';
import { updateTransactionTags, getAllCategories, getTagDefinitions } from '@/lib/api';
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
  MoreHorizontal,
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
  MoreHorizontal,
};

interface TransactionRowProps {
  transaction: Transaction;
  className?: string;
}

export function TransactionRow({ transaction, className }: TransactionRowProps) {
  const [tags, setTags] = useState<string[]>(transaction.tags ?? []);
  const [isHovered, setIsHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [catMap, setCatMap] = useState<Record<string, { name: string; color: string; icon: string }>>({});
  const [availableTags, setAvailableTags] = useState<string[]>([]);

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
      .then((data) => { if (!cancelled) setAvailableTags(data.map((t) => t.name)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setTags(transaction.tags ?? []);
  }, [transaction.id, transaction.tags?.join(',')]);

  const dynamicCat = catMap[transaction.category];
  const catColor = dynamicCat?.color ?? CATEGORY_CONFIG[transaction.category]?.color ?? '#9CA3AF';
  const catLabel = dynamicCat?.name ?? CATEGORY_CONFIG[transaction.category]?.label ?? transaction.category;
  const catIcon = dynamicCat?.icon ?? CATEGORY_CONFIG[transaction.category]?.icon ?? 'MoreHorizontal';
  const Icon = ICON_MAP[catIcon] ?? MoreHorizontal;
  const bankConfig = BANK_CONFIG[transaction.bank] ?? BANK_CONFIG.hdfc;
  const isCredit = transaction.type === 'credit';
  const isCcPayment = transaction.category === 'cc_payment';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 16px',
        backgroundColor: isCcPayment ? 'rgba(107,114,128,0.08)' : 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        marginBottom: 4,
        opacity: isCcPayment ? 0.7 : 1,
      }}
      className={className}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setDropdownOpen(false);
      }}
    >
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
          {isHovered && availableTags.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(!dropdownOpen);
                }}
                style={{
                  padding: '1px 8px 1px 8px',
                  borderRadius: 0,
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  position: 'relative',
                }}
              >
                <Typography as="span" fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  Tag Transaction ▾
                </Typography>
              </span>
              {dropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    background: colorPalette.popBlack[300],
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    padding: 4,
                    zIndex: 9999,
                    minWidth: 140,
                    maxHeight: 200,
                    overflow: 'auto',
                  }}
                >
                  {availableTags.map((tagName) => {
                    const isSelected = tags.includes(tagName);
                    const disabled = !isSelected && tags.length >= 3;
                    return (
                      <div
                        key={tagName}
                        onClick={() => {
                          if (disabled) return;
                          const newTags = isSelected
                            ? tags.filter((t) => t !== tagName)
                            : [...tags, tagName];
                          setTags(newTags);
                          updateTransactionTags(transaction.id, newTags).catch(() => setTags(tags));
                        }}
                        style={{
                          padding: '6px 10px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          borderRadius: 4,
                          fontSize: 12,
                          color: disabled ? 'rgba(255,255,255,0.3)' : mainColors.white,
                          backgroundColor: isSelected ? 'rgba(255,135,68,0.15)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {isSelected ? '✓' : ''} {tagName}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <Typography
            as="span"
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.MEDIUM}
            color={catColor}
            style={{
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor: `${catColor}30`,
              cursor: isCcPayment ? 'help' : 'default',
            }}
            title={isCcPayment ? 'Credit card payments are not included in spends calculation' : undefined}
          >
            {catLabel}
          </Typography>
          {isCcPayment && (
            <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.35)">
              Not included in spends
            </Typography>
          )}
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            {bankConfig.name} ...{transaction.cardLast4}
          </Typography>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography
          fontType={FontType.BODY}
          fontSize={14}
          fontWeight={FontWeights.SEMI_BOLD}
          color={isCredit ? mainColors.green : mainColors.white}
        >
          {isCredit ? '+' : '-'}{formatCurrency(transaction.amount)}
        </Typography>
        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginTop: 4 }}>
          {new Date(transaction.date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          })}
        </Typography>
      </div>
    </div>
  );
}
