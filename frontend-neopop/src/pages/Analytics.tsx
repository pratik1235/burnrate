import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { DateRangePicker } from '@/components/DateRangePicker';
import { CategoryDonut } from '@/components/CategoryDonut';
import { TopMerchants } from '@/components/TopMerchants';
import { CashFlowChart } from '@/components/CashFlowChart';
import { CardComparison } from '@/components/CardComparison';
import { InsightCard } from '@/components/InsightCard';
import { CloseButton } from '@/components/CloseButton';
import { FilterModal } from '@/components/FilterModal';
import { useFilters } from '@/contexts/FilterContext';
import { useAnalytics } from '@/hooks/useApi';
import { CATEGORY_CONFIG } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Button, Typography } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { SlidersHorizontal, Gauge, TrendingUp, Wallet } from 'lucide-react';
import styled from 'styled-components';

const PageLayout = styled.div`
  min-height: 100vh;
  background-color: ${mainColors.black};
`;

const Content = styled.main`
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Skeleton = styled.div`
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  min-height: 200px;
`;

const MetricsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 32px;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

type Preset = 'this_month' | '3_months' | '6_months' | '1_year' | 'custom';

function getDateRangeFromPreset(preset: Preset): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0]!;
  const from = new Date(now);

  switch (preset) {
    case 'this_month':
      from.setDate(1);
      break;
    case '3_months':
      from.setMonth(from.getMonth() - 3);
      break;
    case '6_months':
      from.setMonth(from.getMonth() - 6);
      break;
    case '1_year':
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      return {};
  }
  return { from: from.toISOString().split('T')[0], to };
}

function generateInsight(
  merchants: { merchant: string; amount: number; count: number }[],
  categories: { category: string; amount: number }[]
): string {
  const top = merchants[0];
  const topCat = categories[0];
  if (!top && !topCat) return 'Add more transactions to unlock insights!';

  const insights: string[] = [];

  if (top && top.count >= 5) {
    insights.push(
      `You ordered from ${top.merchant} ${top.count} times this period — that's ₹${(top.amount / 1000).toFixed(0)}k in total.`
    );
  }
  if (top && top.count >= 10) {
    insights.push(
      `Your ${top.merchant} habit is strong: ${top.count} orders. Consider a subscription?`
    );
  }
  if (topCat && topCat.amount > 20000) {
    const label = CATEGORY_CONFIG[topCat.category as keyof typeof CATEGORY_CONFIG]?.label ?? topCat.category;
    insights.push(
      `Your biggest spend category is ${label} at ₹${(topCat.amount / 1000).toFixed(0)}k.`
    );
  }
  if (merchants.some((m) => m.merchant.includes('Swiggy') || m.merchant.includes('Zomato'))) {
    const food = merchants.filter(
      (m) => m.merchant.includes('Swiggy') || m.merchant.includes('Zomato')
    );
    const total = food.reduce((s, m) => s + m.amount, 0);
    const count = food.reduce((s, m) => s + m.count, 0);
    if (count >= 5) {
      insights.push(
        `You ordered food delivery ${count} times (₹${(total / 1000).toFixed(0)}k). Your kitchen misses you.`
      );
    }
  }

  return insights[Math.floor(Math.random() * insights.length)] ??
    `You spent across ${categories.length} categories. Stay curious!`;
}

function presetFromDateRange(dr: { from?: string; to?: string }): Preset | undefined {
  if (!dr.from && !dr.to) return undefined;
  if (!dr.from || !dr.to) return 'custom';
  const now = new Date();
  const to = now.toISOString().split('T')[0]!;
  if (dr.to !== to) return 'custom';
  for (const p of ['this_month', '3_months', '6_months', '1_year'] as const) {
    const r = getDateRangeFromPreset(p);
    if (r.from === dr.from) return p;
  }
  return 'custom';
}

function AnalyticsContent() {
  const navigate = useNavigate();
  const { filters, setFilters, hasActiveFilters, clearFilters } = useFilters();
  const [filterOpen, setFilterOpen] = useState(false);

  // Derive active preset from the global filter dateRange (undefined when no date range set)
  const activePreset = useMemo(() => presetFromDateRange(filters.dateRange), [filters.dateRange]);

  const { summary, categories, trends, merchants, loading } = useAnalytics({
    from: filters.dateRange.from,
    to: filters.dateRange.to,
    cards: filters.selectedCards.length > 0 ? filters.selectedCards.join(',') : undefined,
    categories: filters.selectedCategories.length > 0 ? filters.selectedCategories.join(',') : undefined,
    tags: filters.selectedTags?.length > 0 ? filters.selectedTags.join(',') : undefined,
    direction: filters.direction !== 'all' ? filters.direction : undefined,
    amountMin: filters.amountRange.min,
    amountMax: filters.amountRange.max,
  });

  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeTrends = Array.isArray(trends) ? trends : [];
  const safeMerchants = Array.isArray(merchants) ? merchants : [];

  const avgMonthlySpend = summary?.avgMonthlySpend ?? 0;
  const monthsInRange = summary?.monthsInRange ?? 0;

  const creditUtilization = useMemo(() => {
    const totalLimit = summary?.creditLimit || 0;
    const months = summary?.monthsInRange || 1;
    if (totalLimit === 0) return { ratio: 0, spend: summary?.totalSpend ?? 0, limit: 0, months };
    const currentSpend = summary?.totalSpend ?? 0;
    const effectiveLimit = totalLimit * months;
    const ratio = Math.min(Math.round((currentSpend / effectiveLimit) * 100), 100);
    return { ratio, spend: currentSpend, limit: totalLimit, months };
  }, [summary]);

  const cardSpend = useMemo(() => {
    const breakdown = summary?.cardBreakdown ?? [];
    return breakdown
      .map((cb) => ({
        bank: cb.bank as import('@/lib/types').Bank,
        last4: cb.last4,
        amount: cb.amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [summary]);

  const insightText = useMemo(
    () =>
      generateInsight(
        safeMerchants,
        safeCategories.map((c) => ({ category: c.category, amount: c.amount }))
      ),
    [safeMerchants, safeCategories]
  );

  const periodLabel = (() => {
    switch (activePreset) {
      case 'this_month': return 'This month';
      case '3_months': return 'Last 3 months';
      case '6_months': return 'Last 6 months';
      case '1_year': return 'Last year';
      default:
        if (filters.dateRange.from && filters.dateRange.to) {
          const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          return `${fmt(filters.dateRange.from)} – ${fmt(filters.dateRange.to)}`;
        }
        return 'All time';
    }
  })();

  const activeCount =
    filters.selectedCards.length +
    filters.selectedCategories.length +
    filters.selectedTags.length +
    (filters.dateRange.from ? 1 : 0) +
    (filters.dateRange.to ? 1 : 0) +
    (filters.amountRange.min !== undefined ? 1 : 0) +
    (filters.amountRange.max !== undefined ? 1 : 0) +
    (filters.direction !== 'all' ? 1 : 0);

  return (
    <PageLayout>
      <Navbar activeTab="analytics" onTabChange={(tab) => navigate(`/${tab}`)} />
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
              <CloseButton variant="inline" onClick={clearFilters} />
            )}
          </div>
          <DateRangePicker
            value={activePreset}
            onChange={(p, range) => {
              if (p === 'custom' && range) {
                setFilters({ dateRange: { from: range.from, to: range.to } });
              } else if (p !== 'custom') {
                const r = getDateRangeFromPreset(p);
                setFilters({ dateRange: { from: r.from, to: r.to } });
              }
            }}
          />
        </ActionBar>

        <MetricsRow>
          <div style={{ padding: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Wallet size={18} color={colorPalette.rss[500]} />
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)">
                Total Spends
              </Typography>
            </div>
            <Typography fontType={FontType.BODY} fontSize={28} fontWeight={FontWeights.BOLD} color={mainColors.white} style={{ letterSpacing: '-0.02em', marginBottom: 8 }}>
              {formatCurrency(summary?.totalSpend ?? 0)}
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              {periodLabel}
            </Typography>
          </div>

          <div style={{ padding: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Gauge size={18} color={colorPalette.rss[500]} />
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)">
                Credit Utilization
              </Typography>
            </div>
            {creditUtilization.limit === 0 ? (
              <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginTop: 8 }}>
                Credit limit not available
              </Typography>
            ) : (
              <>
                <Typography fontType={FontType.BODY} fontSize={28} fontWeight={FontWeights.BOLD} color={mainColors.white} style={{ letterSpacing: '-0.02em', marginBottom: 8 }}>
                  {creditUtilization.ratio}%
                </Typography>
                <div style={{ width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    height: '100%',
                    width: `${creditUtilization.ratio}%`,
                    backgroundColor: creditUtilization.ratio > 75 ? mainColors.red : creditUtilization.ratio > 50 ? colorPalette.warning[500] : mainColors.green,
                    borderRadius: 3,
                    transition: 'width 0.5s',
                  }} />
                </div>
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  {formatCurrency(creditUtilization.spend)} out of {formatCurrency(creditUtilization.limit)} × {creditUtilization.months} month{creditUtilization.months === 1 ? '' : 's'}
                </Typography>
              </>
            )}
          </div>

          <div style={{ padding: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <TrendingUp size={18} color={mainColors.green} />
              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)">
                Avg Monthly Spend
              </Typography>
            </div>
            <Typography fontType={FontType.BODY} fontSize={28} fontWeight={FontWeights.BOLD} color={mainColors.white} style={{ letterSpacing: '-0.02em', marginBottom: 8 }}>
              {formatCurrency(avgMonthlySpend)}
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Across {monthsInRange} month{monthsInRange !== 1 ? 's' : ''}
            </Typography>
          </div>
        </MetricsRow>

        <Grid>
          <LeftColumn>
            {loading ? (
              <Skeleton style={{ height: 320 }} />
            ) : safeCategories.length === 0 ? (
              <div style={{ padding: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  No category data for selected filter values. Import statements to see breakdown.
                </Typography>
              </div>
            ) : (
              <CategoryDonut data={safeCategories} />
            )}
            {loading ? (
              <Skeleton style={{ height: 280 }} />
            ) : safeMerchants.length === 0 ? (
              <div style={{ padding: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  No merchant data for selected filter values.
                </Typography>
              </div>
            ) : (
              <TopMerchants data={safeMerchants} />
            )}
          </LeftColumn>
          <RightColumn>
            {loading ? (
              <Skeleton style={{ height: 280 }} />
            ) : safeTrends.length === 0 ? (
              <div style={{ padding: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  No spending trends for selected filter values.
                </Typography>
              </div>
            ) : (
              <CashFlowChart data={safeTrends} />
            )}
            {loading ? (
              <Skeleton style={{ height: 200 }} />
            ) : cardSpend.length === 0 ? (
              <div style={{ padding: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  No card spend data yet.
                </Typography>
              </div>
            ) : (
              <CardComparison data={cardSpend} period={periodLabel} />
            )}
            <InsightCard text={insightText} />
          </RightColumn>
        </Grid>
      </Content>

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} />
    </PageLayout>
  );
}

export function Analytics() {
  return <AnalyticsContent />;
}
