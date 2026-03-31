import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { TransactionRow } from '@/components/TransactionRow';
import { FilterModal } from '@/components/FilterModal';
import { useFilters } from '@/contexts/FilterContext';
import { useTransactions, useCards } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { CATEGORY_CONFIG, BANK_CONFIG } from '@/lib/types';
import { Button, SearchBar } from '@cred/neopop-web/lib/components';
import { Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { SlidersHorizontal, Download, EyeOff } from 'lucide-react';
import { CloseButton } from '@/components/CloseButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import styled from 'styled-components';

const PageLayout = styled.div`
  min-height: 100vh;
  background-color: ${mainColors.black};
`;

const Content = styled.main`
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
`;

const CompactSearchWrapper = styled.div`
  input {
    padding: 6px 12px !important;
    height: 0.2em !important;
    font-size: 13px !important;
  }
  > div {
    min-height: 0 !important;
  }
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  align-items: center;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const TransactionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DateGroup = styled.div`
  margin-bottom: 24px;
`;


const PAGE_SIZE = 20;

function TransactionsContent() {
  const navigate = useNavigate();
  const { filters, setFilters, hasActiveFilters, clearFilters } = useFilters();
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchClearKey, setSearchClearKey] = useState(0);
  const [page, setPage] = useState(0);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [searchTooltipVisible, setSearchTooltipVisible] = useState(false);
  const [excludeTooltipVisible, setExcludeTooltipVisible] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [exclusionMode, setExclusionMode] = useState(false);

  const categoryFilter =
    filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : undefined;

  const { transactions, total, totalAmount, loading } = useTransactions({
    cards: filters.selectedCards.length > 0 ? filters.selectedCards.join(',') : undefined,
    bankAccounts:
      filters.selectedBankAccounts.length > 0 ? filters.selectedBankAccounts.join(',') : undefined,
    category: categoryFilter,
    search: searchQuery || undefined,
    tags: filters.selectedTags?.length ? filters.selectedTags.join(',') : undefined,
    from: filters.dateRange.from,
    to: filters.dateRange.to,
    direction: filters.direction !== 'all' ? filters.direction : undefined,
    source: filters.source !== 'all' ? filters.source : undefined,
    amountMin: filters.amountRange.min,
    amountMax: filters.amountRange.max,
    limit: (page + 1) * PAGE_SIZE,
    offset: 0,
  });
  const { cards } = useCards();

  useEffect(() => {
    setPage(0);
    setExcludedIds(new Set());
    setExclusionMode(false);
  }, [
    filters.selectedCards,
    filters.selectedBankAccounts,
    filters.selectedCategories,
    filters.selectedTags,
    filters.dateRange.from,
    filters.dateRange.to,
    filters.amountRange.min,
    filters.amountRange.max,
    filters.direction,
    filters.source,
    searchQuery,
  ]);

  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeCards = Array.isArray(cards) ? cards : [];
  const safeTotal = typeof total === 'number' ? total : 0;
  const safeTotalAmount = typeof totalAmount === 'number' ? totalAmount : 0;

  const { adjustedTotal, excludedAmount, excludedCount } = useMemo(() => {
    if (excludedIds.size === 0) {
      return { adjustedTotal: safeTotalAmount, excludedAmount: 0, excludedCount: 0 };
    }
    let excludedAmountSum = 0;
    let count = 0;
    for (const tx of safeTransactions) {
      if (!excludedIds.has(tx.id)) continue;
      if (tx.category === 'cc_payment') continue;
      const signedAmount = tx.type === 'debit' ? tx.amount : -tx.amount;
      excludedAmountSum += signedAmount;
      count += 1;
    }
    return {
      adjustedTotal: safeTotalAmount - excludedAmountSum,
      excludedAmount: excludedAmountSum,
      excludedCount: count,
    };
  }, [safeTotalAmount, excludedIds, safeTransactions]);

  const handleToggleExclude = useCallback((id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleResetExclusions = useCallback(() => {
    setExcludedIds(new Set());
    setExclusionMode(false);
  }, []);

  const handleCardToggle = (cardId: string) => {
    setFilters({
      selectedCards: filters.selectedCards.includes(cardId)
        ? filters.selectedCards.filter((id) => id !== cardId)
        : [...filters.selectedCards, cardId],
    });
    setPage(0);
  };

  const handleAllCards = () => {
    setFilters({ selectedCards: [] });
    setPage(0);
  };

  const handleLoadMore = () => {
    setPage((p) => p + 1);
  };

  const handleExport = async () => {
    if (safeTransactions.length === 0) return;
    setExportConfirmOpen(true);
  };

  const executeExport = async () => {
    setExportConfirmOpen(false);

    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const header = 'Date,Description,Category,Currency,Amount,Card';
    const rows = safeTransactions.map((tx) => {
      const catLabel = CATEGORY_CONFIG[tx.category]?.label ?? tx.category;
      const bankName = BANK_CONFIG[tx.bank]?.name ?? tx.bank;
      const signedAmount = tx.type === 'debit' ? -tx.amount : tx.amount;
      const card = `${bankName}_${tx.cardLast4}`;
      return [
        tx.date,
        escapeCSV(tx.merchant),
        escapeCSV(catLabel),
        'INR',
        signedAmount.toFixed(2),
        escapeCSV(card),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as Window & { showSaveFilePicker: (opts: { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: `burnrate_transactions_${new Date().toISOString().split('T')[0]}.csv`,
          types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch {
        // User cancelled or API not supported
        return;
      }
    }

    // Fallback for browsers without File System Access API
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `burnrate_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const groupedByDate = safeTransactions.reduce<
    Record<string, typeof safeTransactions>
  >(
    (acc, tx) => {
      const date = tx.date;
      if (!acc[date]) acc[date] = [];
      acc[date]!.push(tx);
      return acc;
    },
    {}
  );

  const activeCount =
    filters.selectedCards.length +
    filters.selectedBankAccounts.length +
    filters.selectedCategories.length +
    (filters.selectedTags?.length ?? 0) +
    (filters.dateRange.from ? 1 : 0) +
    (filters.dateRange.to ? 1 : 0) +
    (filters.amountRange.min !== undefined ? 1 : 0) +
    (filters.amountRange.max !== undefined ? 1 : 0) +
    (filters.direction !== 'all' ? 1 : 0) +
    (filters.source !== 'all' ? 1 : 0);

  return (
    <PageLayout>
      <Navbar activeTab="transactions" onTabChange={(tab) => navigate(`/${tab}`)} />
      <Content>
        <ActionBar>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              variant={hasActiveFilters ? 'secondary' : 'primary'}
              kind="elevated"
              size="small"
              colorMode="dark"
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal size={14} style={{ marginRight: 6 }} />
              Filters {hasActiveFilters ? `(${activeCount})` : ''}
            </Button>
            {hasActiveFilters && (
              <CloseButton onClick={clearFilters} variant="inline" />
            )}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginLeft: 'auto',
              maxWidth: 400,
              position: 'relative',
            }}
            onMouseEnter={() => setSearchTooltipVisible(true)}
            onMouseLeave={() => setSearchTooltipVisible(false)}
          >
            {searchTooltipVisible && !searchQuery && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  background: colorPalette.popBlack[300],
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  zIndex: 10,
                  whiteSpace: 'nowrap',
                }}
              >
                <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
                  Search by description or merchant name
                </Typography>
              </div>
            )}
            <CompactSearchWrapper>
              <SearchBar
                key={searchClearKey}
                placeholder="Search transactions..."
                colorMode={searchQuery ? 'light' : 'dark'}
                handleSearchInput={(value: string) => setSearchInputValue(value)}
                onSubmit={() => {
                  setSearchQuery(searchInputValue);
                  setPage(0);
                }}
                // todo: reduce vertical size of the search bar
                colorConfig={{
                  border: 'rgba(255,255,255,0.2)',
                  activeBorder: '#ffffff',
                  backgroundColor: searchQuery ? mainColors.white : 'rgba(255,255,255,0.05)',
                  closeIcon: colorPalette.rss[500],
                }}
              />
            </CompactSearchWrapper>
            {searchQuery && (
              <CloseButton
                onClick={() => {
                  setSearchQuery('');
                  setSearchInputValue('');
                  setSearchClearKey((k) => k + 1);
                  setPage(0);
                }}
                variant="inline"
              />
            )}
          </div>
        </ActionBar>

        <FilterRow>
          <Button
            variant={filters.selectedCards.length === 0 ? 'secondary' : 'primary'}
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={handleAllCards}
          >
            All cards
          </Button>
          {safeCards.map((card) => (
            <Button
              key={card.id}
              variant={filters.selectedCards.includes(card.id) ? 'secondary' : 'primary'}
              kind="elevated"
              size="small"
              colorMode="dark"
              onClick={() => handleCardToggle(card.id)}
            >
              {card.bank} ...{card.last4}
            </Button>
          ))}
        </FilterRow>

        <Header>
          <div>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              {safeTotal} transaction{safeTotal !== 1 ? 's' : ''}
            </Typography>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Typography fontType={FontType.BODY} fontSize={20} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                {formatCurrency(adjustedTotal)} spent
              </Typography>
              {excludedCount > 0 && (
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  ({formatCurrency(Math.abs(excludedAmount))} excluded from {excludedCount} txn{excludedCount !== 1 ? 's' : ''})
                </Typography>
              )}
              {adjustedTotal < 0 && (
                <div style={{ position: 'relative', display: 'inline-flex' }}>
                  <Typography
                    as="span"
                    fontType={FontType.BODY}
                    fontSize={11}
                    fontWeight={FontWeights.REGULAR}
                    color="rgba(255,255,255,0.5)"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'help',
                    }}
                    onMouseEnter={() => setTooltipVisible(true)}
                    onMouseLeave={() => setTooltipVisible(false)}
                  >
                    ?
                  </Typography>
                  {tooltipVisible && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: 6,
                        background: colorPalette.popBlack[300],
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        zIndex: 10,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.7)">
                        Negative value means overall credit i.e. negative spends
                      </Typography>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setExcludeTooltipVisible(true)}
              onMouseLeave={() => setExcludeTooltipVisible(false)}
            >
              <Button
                variant={exclusionMode ? 'secondary' : 'primary'}
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => setExclusionMode((m) => !m)}
              >
                <EyeOff size={14} style={{ marginRight: 6 }} />
                Temporarily Exclude Txns
                {excludedIds.size > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: 'rgba(255,135,68,0.3)',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {excludedIds.size}
                  </span>
                )}
              </Button>
              {excludeTooltipVisible && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: 6,
                    background: colorPalette.popBlack[300],
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    zIndex: 10,
                    whiteSpace: 'normal',
                    maxWidth: 280,
                  }}
                >
                  <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.7)">
                    This allows you to temporarily exclude some transactions from the summation value above
                  </Typography>
                </div>
              )}
            </div>
            {excludedIds.size > 0 && (
              <Button
                variant="secondary"
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={handleResetExclusions}
              >
                Reset Exclusions
              </Button>
            )}
            <Button
              variant="primary"
              kind="elevated"
              size="small"
              colorMode="dark"
              onClick={handleExport}
            >
              <Download size={14} style={{ marginRight: 6 }} />
              Export
            </Button>
          </div>
        </Header>

        <div
          style={{
            background: 'rgba(255,135,68,0.08)',
            border: '1px solid rgba(255,135,68,0.15)',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 16,
          }}
        >
          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            CC Bill Payment transactions are not part of your spends and are as such not used for any computations.
          </Typography>
        </div>

        {loading ? (
          <Typography fontType={FontType.BODY} fontSize={14} color="rgba(255,255,255,0.5)">
            Loading...
          </Typography>
        ) : safeTransactions.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              No transactions found. Import credit card statements or adjust your filters.
            </Typography>
          </div>
        ) : (
          <TransactionList>
            {Object.entries(groupedByDate).map(([date, txs]) => (
              <DateGroup key={date}>
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {new Date(date).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Typography>
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    exclusionMode={exclusionMode}
                    isExcluded={excludedIds.has(tx.id)}
                    onToggleExclude={handleToggleExclude}
                  />
                ))}
              </DateGroup>
            ))}
          </TransactionList>
        )}

        {!loading && safeTransactions.length < safeTotal && (
          <Button
            variant="primary"
            kind="elevated"
            size="medium"
            colorMode="dark"
            fullWidth
            onClick={handleLoadMore}
            style={{ marginTop: 24 }}
          >
            Load more ({safeTotal - safeTransactions.length} remaining)
          </Button>
        )}
      </Content>

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} />
      <ConfirmModal
        open={exportConfirmOpen}
        title="Export Transactions"
        message="Do not save this file in your statements watch folder to avoid re-processing."
        confirmLabel="Export"
        variant="warning"
        onConfirm={executeExport}
        onCancel={() => setExportConfirmOpen(false)}
      />
    </PageLayout>
  );
}

export function Transactions() {
  return <TransactionsContent />;
}
