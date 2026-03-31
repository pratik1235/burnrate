import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { CreditCardVisual } from '@/components/CreditCardVisual';
import { FilterModal } from '@/components/FilterModal';
import { useFilters } from '@/contexts/FilterContext';
import { Button, Typography } from '@cred/neopop-web/lib/components';
import { mainColors } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { useCards, useAnalytics } from '@/hooks/useApi';
import { deleteCard } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/components/Toast';
import { Trash2, SlidersHorizontal, Plus } from 'lucide-react';
import { CloseButton } from '@/components/CloseButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import styled from 'styled-components';

const PageLayout = styled.div`
  min-height: 100vh;
  background-color: ${mainColors.black};
`;

const Content = styled.main`
  padding: 32px 24px;
  max-width: 1000px;
  margin: 0 auto;
`;

const SectionTitle = styled.div`
  margin-bottom: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const CardItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 400px;
  gap: 12px;
`;


const SpendInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  max-width: 400px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
  gap: 20px;
`;

const FilterRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

function countActiveFilters(filters: ReturnType<typeof useFilters>['filters']): number {
  let count = 0;
  count += filters.selectedCards.length;
  count += filters.selectedCategories.length;
  count += filters.selectedTags.length;
  if (filters.dateRange.from) count++;
  if (filters.dateRange.to) count++;
  if (filters.amountRange.min !== undefined) count++;
  if (filters.amountRange.max !== undefined) count++;
  if (filters.direction !== 'all') count++;
  return count;
}

export function Cards() {
  const navigate = useNavigate();
  const { filters, setFilters, hasActiveFilters, clearFilters } = useFilters();
  const [filterOpen, setFilterOpen] = useState(false);
  const { cards, loading, refetch: refetchCards } = useCards();
  const { summary } = useAnalytics({
    from: filters.dateRange.from,
    to: filters.dateRange.to,
    cards: filters.selectedCards.length > 0 ? filters.selectedCards.join(',') : undefined,
    categories: filters.selectedCategories.length > 0 ? filters.selectedCategories.join(',') : undefined,
    tags: filters.selectedTags?.length > 0 ? filters.selectedTags.join(',') : undefined,
    direction: filters.direction !== 'all' ? filters.direction : undefined,
    amountMin: filters.amountRange.min,
    amountMax: filters.amountRange.max,
  });

  const activeCount = countActiveFilters(filters);
  const safeCards = Array.isArray(cards) ? cards : [];
  const cardBreakdown = summary?.cardBreakdown ?? [];
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; label: string } | null>(null);

  const cardSpendMap = safeCards.map((card) => {
    const matches = cardBreakdown.filter(
      (cb) => cb.bank === card.bank && cb.last4 === card.last4
    );
    if (matches.length === 0) {
      return { ...card, spend: 0, txnCount: 0, spendLines: undefined as { amount: number; currency: string }[] | undefined };
    }
    if (matches.length === 1) {
      return {
        ...card,
        spend: matches[0].amount,
        txnCount: matches[0].count,
        spendLines: undefined as { amount: number; currency: string }[] | undefined,
      };
    }
    return {
      ...card,
      spend: matches[0].amount,
      txnCount: matches.reduce((s, m) => s + m.count, 0),
      spendLines: matches.map((m) => ({
        amount: m.amount,
        currency: m.currency ?? 'INR',
      })),
    };
  });

  const handleRemoveCard = async (cardId: string, cardLabel: string) => {
    setConfirmRemove({ id: cardId, label: cardLabel });
  };

  const executeRemoveCard = async () => {
    if (!confirmRemove) return;
    try {
      await deleteCard(confirmRemove.id);
      toast.success(`${confirmRemove.label} removed successfully`);
      refetchCards();
    } catch {
      toast.error('Failed to remove card');
    } finally {
      setConfirmRemove(null);
    }
  };

  const handleCardClick = (cardId: string) => {
    const updatedCards = filters.selectedCards.includes(cardId)
      ? filters.selectedCards
      : [...filters.selectedCards, cardId];
    setFilters({ selectedCards: updatedCards });
    navigate('/transactions');
  };

  return (
    <PageLayout>
      <Navbar
        activeTab="cards"
        onTabChange={(tab) => navigate(`/${tab}`)}
      />
      <Content>
        <SectionTitle>
          <Typography
            fontType={FontType.HEADING}
            fontSize={24}
            fontWeight={FontWeights.BOLD}
            color={mainColors.white}
            style={{ letterSpacing: '-0.02em' }}
          >
            Your Cards
          </Typography>
        </SectionTitle>

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
          <Button
            variant="primary"
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={() => navigate('/setup')}
          >
            <Plus size={14} style={{ marginRight: 6 }} />
            Add Card
          </Button>
        </FilterRow>

        {loading ? (
          <div style={{ padding: 48 }}>
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              Loading cards...
            </Typography>
          </div>
        ) : safeCards.length === 0 ? (
          <EmptyState>
            <Typography
              fontType={FontType.BODY}
              fontSize={16}
              fontWeight={FontWeights.REGULAR}
              color="rgba(255,255,255,0.8)"
            >
              No cards registered yet. Set up your cards to get started.
            </Typography>
            <Button
              kind="elevated"
              size="medium"
              colorMode="dark"
              variant="primary"
              onClick={() => navigate('/setup')}
            >
              Set Up Cards
            </Button>
          </EmptyState>
        ) : (
          <CardsGrid>
            {cardSpendMap.map((card) => (
              <CardItem key={card.id}>
                <CreditCardVisual
                  bank={card.bank}
                  last4={card.last4}
                  cardName={card.name}
                  totalSpend={card.spend}
                  transactionCount={card.txnCount}
                  size="large"
                  onClick={() => handleCardClick(card.id)}
                />
                <CardFooter>
                  <SpendInfo>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      {card.spendLines && card.spendLines.length > 0 ? (
                        card.spendLines
                          .slice()
                          .sort((a, b) => a.currency.localeCompare(b.currency))
                          .map((line) => (
                            <Typography
                              key={line.currency}
                              fontType={FontType.BODY}
                              fontSize={18}
                              fontWeight={FontWeights.BOLD}
                              color={mainColors.white}
                            >
                              {formatCurrency(line.amount, line.currency)}
                            </Typography>
                          ))
                      ) : (
                        <Typography
                          fontType={FontType.BODY}
                          fontSize={18}
                          fontWeight={FontWeights.BOLD}
                          color={mainColors.white}
                        >
                          {formatCurrency(card.spend)}
                        </Typography>
                      )}
                    </div>
                    <Typography
                      fontType={FontType.BODY}
                      fontSize={13}
                      fontWeight={FontWeights.REGULAR}
                      color="rgba(255,255,255,0.6)"
                    >
                      {card.txnCount} transaction{card.txnCount !== 1 ? 's' : ''}
                    </Typography>
                  </SpendInfo>
                  <Button
                    variant="secondary"
                    kind="flat"
                    size="small"
                    colorMode="dark"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleRemoveCard(card.id, `${card.bank.toUpperCase()} ...${card.last4}`);
                    }}
                    style={{
                      minWidth: 32,
                      height: 32,
                      marginLeft: 'auto',
                      marginRight: 8,
                      background: 'rgba(238, 77, 55, 0.15)',
                      border: '1px solid rgba(238, 77, 55, 0.4)',
                      color: mainColors.red,
                      padding: 0,
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </CardFooter>
              </CardItem>
            ))}
          </CardsGrid>
        )}
      </Content>
      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} />
      <ConfirmModal
        open={confirmRemove !== null}
        title="Remove Card"
        message={`Remove ${confirmRemove?.label ?? 'this card'} and all its transactions?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={executeRemoveCard}
        onCancel={() => setConfirmRemove(null)}
      />
    </PageLayout>
  );
}
