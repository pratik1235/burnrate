import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SpendSummary } from '@/components/SpendSummary';
import { StatUpload } from '@/components/StatUpload';
import { CardWidget } from '@/components/CardWidget';
import { CashFlowChart } from '@/components/CashFlowChart';
import { TransactionRow } from '@/components/TransactionRow';
import { FilterModal } from '@/components/FilterModal';
import { useFilters } from '@/contexts/FilterContext';
import { useAnalytics, useTransactions, useCards } from '@/hooks/useApi';
import { uploadStatement, uploadStatementsBulk, getStatementPeriods } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/components/Toast';
import { Button, Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { ElevatedCard } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { SlidersHorizontal } from 'lucide-react';
import { CloseButton } from '@/components/CloseButton';
import type { StatementPeriod } from '@/lib/api';
import styled from 'styled-components';

const PageLayout = styled.div`
  min-height: 100vh;
  background-color: ${mainColors.black};
`;

const Content = styled.main`
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
`;

const FilterRow = styled.div`
  display: flex;
  margin-bottom: 24px;
`;

const TopRow = styled.div`
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const CardsRow = styled.div`
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  overflow-x: auto;
  padding-bottom: 8px;
  & > * {
    flex-shrink: 0;
  }
`;

const Section = styled.section`
  margin-bottom: 32px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const Skeleton = styled.div<{ width?: string; height?: string }>`
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  width: ${(p) => p.width ?? '100%'};
  height: ${(p) => p.height ?? '120px'};
`;

const StyledLink = styled(Link)`
  color: ${colorPalette.rss[500]};
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const ClickableSpend = styled.div`
  cursor: pointer;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  border-radius: 12px;
  &:hover {
    transform: translateY(-3px) scale(1.01);
    box-shadow: 0 8px 24px rgba(255, 255, 255, 0.06);
  }
  &:active {
    transform: translateY(0) scale(0.99);
    box-shadow: none;
  }
`;

function countActiveFilters(filters: ReturnType<typeof useFilters>['filters']): number {
  let count = 0;
  count += filters.selectedCards.length;
  count += filters.selectedBankAccounts.length;
  count += filters.selectedCategories.length;
  count += filters.selectedTags.length;
  if (filters.dateRange.from) count++;
  if (filters.dateRange.to) count++;
  if (filters.amountRange.min !== undefined) count++;
  if (filters.amountRange.max !== undefined) count++;
  if (filters.direction !== 'all') count++;
  if (filters.source !== 'all') count++;
  return count;
}

function StatementPeriodsModal({
  open,
  onClose,
  periods,
  loading,
  onStatementClick,
}: {
  open: boolean;
  onClose: () => void;
  periods: StatementPeriod[];
  loading: boolean;
  onStatementClick?: (period: StatementPeriod) => void;
}) {
  if (!open) return null;

  const fmt = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

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
          maxWidth: 560,
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
            Statement Periods
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Loading...
            </Typography>
          ) : periods.length === 0 ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              No statement periods found for the selected filter values.
            </Typography>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {periods.map((p, idx) => (
                <div
                  key={`${p.bank}-${p.cardLast4}-${idx}`}
                  onClick={() => onStatementClick?.(p)}
                  style={{
                    padding: '14px 16px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ flex: 1 }}>
                    <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                      {p.bank.toUpperCase()} ...{p.cardLast4}
                    </Typography>
                    <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginTop: 2 }}>
                      {p.periodStart ? fmt(p.periodStart) : '—'} – {p.periodEnd ? fmt(p.periodEnd) : '—'}
                    </Typography>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                     <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}> Statement Due</Typography>
                    <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.BOLD} color={colorPalette.rss[500]}>
                      {formatCurrency(p.totalAmountDue ?? 0, p.currency ?? 'INR')}
                    </Typography>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ElevatedCard>
    </div>
  );
}

function DashboardContent() {
  const navigate = useNavigate();
  const { filters, setFilters, hasActiveFilters, clearFilters } = useFilters();
  const [filterOpen, setFilterOpen] = useState(false);
  const [periodsModalOpen, setPeriodsModalOpen] = useState(false);
  const [periodsList, setPeriodsList] = useState<StatementPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);

  const activeCount = countActiveFilters(filters);

  const filterParams = {
    cards: filters.selectedCards.length > 0 ? filters.selectedCards.join(',') : undefined,
    bankAccounts:
      filters.selectedBankAccounts.length > 0 ? filters.selectedBankAccounts.join(',') : undefined,
    from: filters.dateRange.from,
    to: filters.dateRange.to,
    category: filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : undefined,
    tags: filters.selectedTags?.length > 0 ? filters.selectedTags.join(',') : undefined,
    direction: filters.direction !== 'all' ? filters.direction : undefined,
    source: filters.source !== 'all' ? filters.source : undefined,
    amountMin: filters.amountRange.min,
    amountMax: filters.amountRange.max,
  };

  const { summary, trends, trendsByCurrency, loading } = useAnalytics({
    from: filters.dateRange.from,
    to: filters.dateRange.to,
    cards: filters.selectedCards.length > 0 ? filters.selectedCards.join(',') : undefined,
    bankAccounts:
      filters.selectedBankAccounts.length > 0 ? filters.selectedBankAccounts.join(',') : undefined,
    categories: filters.selectedCategories.length > 0 ? filters.selectedCategories.join(',') : undefined,
    tags: filters.selectedTags?.length > 0 ? filters.selectedTags.join(',') : undefined,
    direction: filters.direction !== 'all' ? filters.direction : undefined,
    amountMin: filters.amountRange.min,
    amountMax: filters.amountRange.max,
    source: filters.source !== 'all' ? filters.source : undefined,
  });
  const { transactions, loading: txLoading } = useTransactions({
    ...filterParams,
    limit: 10,
    offset: 0,
  });
  const { cards, loading: cardsLoading } = useCards();

  const safeCards = Array.isArray(cards) ? cards : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  const safeSummary =
    summary && (summary.mixedCurrency || typeof summary.totalSpend === 'number')
      ? summary
      : {
          totalSpend: 0,
          mixedCurrency: false,
          deltaPercent: 0,
          deltaLabel: 'vs last month',
          period: 'This month',
          sparklineData: [{ value: 0 }],
          cardBreakdown: [],
        };
  const safeTrends = Array.isArray(trends) ? trends : [];
  const safeTrendsByCurrency = Array.isArray(trendsByCurrency) ? trendsByCurrency : [];

  const cardBreakdown = safeSummary.cardBreakdown ?? [];
  const cardSpendByCard = safeCards.map((card) => {
    const matches = cardBreakdown.filter(
      (cb) => cb.bank === card.bank && cb.last4 === card.last4
    );
    if (matches.length === 0) {
      return { ...card, spend: 0, count: 0, spendLines: undefined as { amount: number; currency: string }[] | undefined };
    }
    if (matches.length === 1) {
      return {
        ...card,
        spend: matches[0].amount,
        count: matches[0].count,
        spendLines: undefined as { amount: number; currency: string }[] | undefined,
      };
    }
    return {
      ...card,
      spend: matches[0].amount,
      count: matches.reduce((s, m) => s + m.count, 0),
      spendLines: matches.map((m) => ({
        amount: m.amount,
        currency: m.currency ?? 'INR',
      })),
    };
  });

  const periodLabel = (() => {
    const from = filters.dateRange.from;
    const to = filters.dateRange.to;
    if (from && to) {
      const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${fmt(from)} – ${fmt(to)}`;
    }
    if (from) return `From ${new Date(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    if (to) return `Until ${new Date(to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return 'All time';
  })();

  const handleSpendClick = async () => {
    setPeriodsModalOpen(true);
    setPeriodsLoading(true);
    try {
      const { periods } = await getStatementPeriods({
        from: filters.dateRange.from,
        to: filters.dateRange.to,
      });
      setPeriodsList(periods ?? []);
    } catch {
      toast.error('Failed to load statement periods');
      setPeriodsList([]);
    } finally {
      setPeriodsLoading(false);
    }
  };

  const handleUpload = async (file: File, password?: string) => {
    const loadingId = toast.loading('Processing statement...');
    try {
      const result = await uploadStatement(file, undefined, password);
      toast.dismiss(loadingId);

      if (result.status === 'success') {
        toast.success(
          `${result.count ?? 0} transactions imported from ${(result.bank ?? '').toUpperCase()} statement`
        );
        setTimeout(() => window.location.reload(), 1500);
      } else if (result.status === 'duplicate') {
        toast.info(result.message ?? 'Statement already imported');
      } else if (result.status === 'card_not_found') {
        toast.warning(
          result.message ?? 'Statement belongs to a card that has not been added yet. Add the card in Settings to process it.'
        );
      } else if (result.status === 'parse_error') {
        toast.warning(
          result.message ?? 'Could not extract transactions from this statement. The PDF format may not be supported yet.'
        );
      } else if (
        result.message?.toLowerCase().includes('unlock') ||
        result.message?.toLowerCase().includes('password')
      ) {
        toast.info('PDF is password-protected');
      } else {
        toast.error(result.message ?? 'Processing failed');
      }
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
      return { status: 'error', message, count: 0 };
    }
  };

  const handleBulkUpload = async (files: File[]) => {
    const loadingId = toast.loading(`Processing ${files.length} statements...`);
    try {
      const result = await uploadStatementsBulk(files);
      toast.dismiss(loadingId);

      if (result.success > 0) {
        toast.success(`${result.success} of ${result.total} statements imported`);
        setTimeout(() => window.location.reload(), 1500);
      }
      if (result.card_not_found > 0) {
        toast.warning(
          `${result.card_not_found} statement(s) skipped — card not added yet. Add the card in Settings to process them.`
        );
      }
      if (result.parse_error > 0) {
        toast.warning(
          `${result.parse_error} statement(s) could not be parsed. Check Customize → Reparse/Remove for details.`
        );
      }
      if (result.success === 0 && result.card_not_found === 0) {
        if (result.duplicate > 0 && result.failed === 0) {
          toast.info('All statements already imported');
        } else if (result.failed > 0) {
          toast.error(`${result.failed} of ${result.total} statements failed`);
        }
      }
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      const message = err instanceof Error ? err.message : 'Bulk upload failed';
      toast.error(message);
      return { status: 'error', total: files.length, success: 0, failed: files.length, duplicate: 0, skipped: 0 };
    }
  };

  return (
    <PageLayout>
      <Navbar activeTab="dashboard" onTabChange={(tab) => navigate(`/${tab}`)} />
      <Content>
        <FilterRow>
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
        </FilterRow>

        <TopRow>
          {loading ? (
            <div style={{ flex: '1.2 1 0', minWidth: 280 }}>
              <Skeleton width="100%" height="140px" />
            </div>
          ) : (
            <ClickableSpend style={{ flex: '1.2 1 0', minWidth: 280 }} onClick={handleSpendClick}>
              <SpendSummary
                totalSpend={safeSummary.totalSpend}
                mixedCurrency={safeSummary.mixedCurrency}
                totalSpendByCurrency={safeSummary.totalSpendByCurrency}
                deltaPercent={safeSummary.deltaPercent ?? null}
                deltaLabel={safeSummary.deltaLabel ?? 'vs last month'}
                sparklineData={
                  safeSummary.sparklineByCurrency?.[0]?.sparklineData ??
                  safeSummary.sparklineData ??
                  [{ value: 0 }]
                }
                period={periodLabel}
              />
            </ClickableSpend>
          )}
          <div style={{ flex: 1, minWidth: 280 }}>
            <StatUpload onUpload={handleUpload} onBulkUpload={handleBulkUpload} compact />
          </div>
        </TopRow>

        <Section>
          <SectionHeader>
            <Typography fontType={FontType.BODY} fontSize={18} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Your Cards
            </Typography>
          </SectionHeader>
          <CardsRow>
            {safeCards.length === 0 && !cardsLoading ? (
              <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                No cards yet. Complete setup to add your cards.
              </Typography>
            ) : (
            safeCards.map((card) => {
              const info = cardSpendByCard.find(
                (c) => c.bank === card.bank && c.last4 === card.last4
              );
              return (
                <CardWidget
                  key={card.id}
                  bank={card.bank}
                  last4={card.last4}
                  totalSpend={info?.spend ?? 0}
                  spendLines={info?.spendLines}
                  transactionCount={info?.count ?? 0}
                />
              );
            })
            )}
          </CardsRow>
        </Section>

        <Section>
          <SectionHeader>
            <Typography fontType={FontType.BODY} fontSize={18} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Cash Flow
            </Typography>
          </SectionHeader>
          {loading ? (
            <Skeleton height="280px" />
          ) : safeTrendsByCurrency.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {safeTrendsByCurrency.map((block) => (
                <CashFlowChart key={block.currency} data={block.trends} currency={block.currency} />
              ))}
            </div>
          ) : safeTrends.length === 0 ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              No spending data yet. Import statements to see your cash flow.
            </Typography>
          ) : (
            <CashFlowChart data={safeTrends} />
          )}
        </Section>

        <Section>
          <SectionHeader>
            <Typography fontType={FontType.BODY} fontSize={18} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Recent Transactions
            </Typography>
            <StyledLink to="/transactions">View all</StyledLink>
          </SectionHeader>
          {txLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} height="72px" />
              ))}
            </div>
          ) : safeTransactions.length === 0 ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              No transactions yet. Import credit card statements to get started.
            </Typography>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {safeTransactions.slice(0, 10).map((tx) => (
                <TransactionRow key={tx.id} transaction={tx} />
              ))}
            </div>
          )}
        </Section>
      </Content>

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} />
      <StatementPeriodsModal
        open={periodsModalOpen}
        onClose={() => setPeriodsModalOpen(false)}
        periods={periodsList}
        loading={periodsLoading}
        onStatementClick={(period) => {
          const matchingCard = safeCards.find(
            (c) => c.bank === period.bank && c.last4 === period.cardLast4
          );
          setFilters({
            dateRange: {
              from: period.periodStart ?? undefined,
              to: period.periodEnd ?? undefined,
            },
            selectedCards: matchingCard ? [matchingCard.id] : [],
          });
          setPeriodsModalOpen(false);
          navigate('/transactions');
        }}
      />
    </PageLayout>
  );
}

export function Dashboard() {
  return <DashboardContent />;
}
