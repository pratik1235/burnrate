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

const RemoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: auto;
  margin-right: 8px;
  background: rgba(238, 77, 55, 0.15);
  border: 1px solid rgba(238, 77, 55, 0.4);
  border-radius: 8px;
  color: ${mainColors.red};
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;

  &:hover {
    background: rgba(238, 77, 55, 0.3);
  }
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

  const cardSpendMap = safeCards.map((card) => {
    const match = cardBreakdown.find(
      (cb) => cb.bank === card.bank && cb.last4 === card.last4
    );
    return { ...card, spend: match?.amount ?? 0, txnCount: match?.count ?? 0 };
  });

  const handleRemoveCard = async (cardId: string, cardLabel: string) => {
    const confirmed = window.confirm('Remove this card and all its transactions?');
    if (!confirmed) return;

    try {
      await deleteCard(cardId);
      toast.success(`${cardLabel} removed successfully`);
      refetchCards();
    } catch {
      toast.error('Failed to remove card');
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
          <div style={{ color: 'rgba(255,255,255,0.6)', padding: 48 }}>
            Loading cards...
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
                    <Typography
                      fontType={FontType.BODY}
                      fontSize={18}
                      fontWeight={FontWeights.BOLD}
                      color={mainColors.white}
                    >
                      {formatCurrency(card.spend)}
                    </Typography>
                    <Typography
                      fontType={FontType.BODY}
                      fontSize={13}
                      fontWeight={FontWeights.REGULAR}
                      color="rgba(255,255,255,0.6)"
                    >
                      {card.txnCount} transaction{card.txnCount !== 1 ? 's' : ''}
                    </Typography>
                  </SpendInfo>
                  <RemoveButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCard(card.id, `${card.bank.toUpperCase()} ...${card.last4}`);
                    }}
                  >
                    <Trash2 size={14} />
                  </RemoveButton>
                </CardFooter>
              </CardItem>
            ))}
          </CardsGrid>
        )}
      </Content>
      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} />
    </PageLayout>
  );
}
