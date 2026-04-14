import { useState, useCallback, useMemo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button, Typography, Tag, InputField, Row, Column } from '@cred/neopop-web/lib/components';
import { SelectableElevatedCard as ElevatedCard } from '@/components/SelectableElevatedCard';
import { mainColors, colorPalette } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { useMilestones, useCards } from '@/hooks/useApi';
import { createMilestone, deleteMilestone, triggerMilestoneSync } from '@/lib/api';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import { toast } from '@/components/Toast';
import { CloseButton } from '@/components/CloseButton';
import { SelectDropdown, type SelectDropdownOption } from '@/components/SelectDropdown';
import { Target, TrendingUp, Calendar, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { BANK_CONFIG } from '@/lib/types';
import type { Bank } from '@/lib/types';
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

const Header = styled.div`
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const FilterStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 20px;
`;

const FilterBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  margin-top: 10px;
`;

const ProgressBarFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${(p) => p.$percent}%;
  background: linear-gradient(90deg, ${colorPalette.rss[500]} 0%, ${colorPalette.rss[300]} 100%);
  border-radius: 3px;
`;

const MilestoneActions = styled.div`
  display: flex;
  gap: 4px;
  align-items: flex-start;
  flex-shrink: 0;
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

const FormField = styled.div`
  margin-bottom: 16px;
`;

const inputStyle = {
  backgroundColor: colorPalette.black[100],
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  color: mainColors.white,
  outline: 'none' as const,
  width: '100%',
  boxSizing: 'border-box' as const,
};

const edgeAccent = {
  bottom: colorPalette.rss[600],
  right: colorPalette.rss[800],
};

const milestoneDropdownTrigger = {
  border: 'rgba(255,255,255,0.12)',
  text: mainColors.white,
  chevron: 'rgba(255,255,255,0.5)',
};

const filterDropdownWrapper: CSSProperties = {
  minWidth: 200,
  maxWidth: 280,
  flexShrink: 0,
};

const PERIOD_KIND_OPTIONS: SelectDropdownOption[] = [
  { value: 'calendar_month', label: 'Monthly' },
  { value: 'calendar_quarter', label: 'Quarterly' },
  { value: 'calendar_year', label: 'Annual' },
  { value: 'rolling_days', label: 'Rolling 30 days' },
];

const MILESTONE_TYPE_OPTIONS: SelectDropdownOption[] = [
  { value: 'fee_waiver', label: 'Fee Waiver' },
  { value: 'bonus_points', label: 'Bonus Points' },
  { value: 'lounge_access', label: 'Lounge Access' },
  { value: 'accelerated_rewards', label: 'Accelerated Rewards' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'cashback', label: 'Cashback' },
];

export function Milestones() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { milestones, refetch } = useMilestones();
  const { cards } = useCards();

  const [selectedBanks, setSelectedBanks] = useState<string[]>([]);
  const [selectedLast4s, setSelectedLast4s] = useState<string[]>([]);
  const [bankSelectValue, setBankSelectValue] = useState('');
  const [last4SelectValue, setLast4SelectValue] = useState('');

  const activeMilestones = milestones.filter((m) => !m.isArchived);

  const filteredMilestones = useMemo(() => {
    if (selectedBanks.length === 0 && selectedLast4s.length === 0) return activeMilestones;
    return activeMilestones.filter((m) => {
      const card = cards.find((c) => c.id === m.cardId);
      if (!card) return false;
      if (selectedBanks.length > 0 && !selectedBanks.includes(card.bank)) return false;
      if (selectedLast4s.length > 0 && !selectedLast4s.includes(card.last4)) return false;
      return true;
    });
  }, [activeMilestones, cards, selectedBanks, selectedLast4s]);

  const uniqueBanks = useMemo(() => {
    const seen = new Set<string>();
    return cards
      .filter((c) => {
        if (seen.has(c.bank)) return false;
        seen.add(c.bank);
        return true;
      })
      .map((c) => [c.bank, BANK_CONFIG[c.bank as Bank]?.name || c.bank] as const)
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);

  const uniqueLast4s = useMemo(() => [...new Set(cards.map((c) => c.last4))].sort(), [cards]);

  const toggleBank = useCallback(
    (slug: string) =>
      setSelectedBanks((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug])),
    [],
  );
  const clearBanks = useCallback(() => setSelectedBanks([]), []);

  const toggleLast4 = useCallback(
    (l: string) =>
      setSelectedLast4s((prev) => (prev.includes(l) ? prev.filter((s) => s !== l) : [...prev, l])),
    [],
  );
  const clearLast4s = useCallback(() => setSelectedLast4s([]), []);

  const onBankDropdownChange = useCallback((slug: string) => {
    if (!slug) return;
    setSelectedBanks((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    setBankSelectValue('');
  }, []);

  const onLast4DropdownChange = useCallback((l: string) => {
    if (!l) return;
    setSelectedLast4s((prev) => (prev.includes(l) ? prev : [...prev, l]));
    setLast4SelectValue('');
  }, []);

  const unselectedBanks = useMemo(
    () => uniqueBanks.filter(([slug]) => !selectedBanks.includes(slug)),
    [uniqueBanks, selectedBanks],
  );
  const unselectedLast4s = useMemo(
    () => uniqueLast4s.filter((l) => !selectedLast4s.includes(l)),
    [uniqueLast4s, selectedLast4s],
  );

  const bankFilterOptions = useMemo<SelectDropdownOption[]>(
    () => unselectedBanks.map(([slug, name]) => ({ value: slug, label: name })),
    [unselectedBanks],
  );
  const last4FilterOptions = useMemo<SelectDropdownOption[]>(
    () => unselectedLast4s.map((l) => ({ value: l, label: `···· ${l}` })),
    [unselectedLast4s],
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === 'setup') navigate('/setup');
      else navigate(`/${tab}`);
    },
    [navigate],
  );

  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerMilestoneSync();
      toast.success('Milestone sync started');
      setTimeout(() => refetch(), 3000);
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMilestone(id);
    toast.success('Milestone deleted');
    refetch();
  };

  const handleCreate = async (data: {
    card_id: string;
    title: string;
    target_amount: number;
    period_kind?: string;
    milestone_type?: string;
    reward_description?: string;
  }) => {
    await createMilestone(data);
    toast.success('Milestone created');
    setShowCreateModal(false);
    refetch();
  };

  return (
    <PageLayout>
      <Navbar activeTab="milestones" onTabChange={handleTabChange} />
      <Content>
        <Header>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Target size={22} color={colorPalette.rss[500]} />
            <Typography
              fontType={FontType.HEADING}
              fontSize={22}
              fontWeight={FontWeights.EXTRA_BOLD}
              color={mainColors.white}
            >
              Milestones & Goals on Credit Cards
            </Typography>
            {activeMilestones.length > 0 && (
              <Tag
                colorMode="dark"
                colorConfig={{
                  background: 'rgba(255,135,68,0.18)',
                  color: colorPalette.rss[500],
                }}
              >
                {activeMilestones.length} active
              </Tag>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ButtonWithIcon
              icon={RefreshCw}
              kind="elevated"
              size="small"
              colorMode="dark"
              variant="primary"
              onClick={handleSync}
              iconProps={{ className: syncing ? 'animate-spin' : undefined }}
              gap={6}
              justifyContent="center"
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </ButtonWithIcon>
            <ButtonWithIcon
              icon={Plus}
              kind="elevated"
              size="small"
              colorMode="dark"
              variant="secondary"
              onClick={() => setShowCreateModal(true)}
              gap={6}
              justifyContent="center"
            >
              Add Milestone
            </ButtonWithIcon>
          </div>
        </Header>

        <div
          style={{
            background: 'rgba(255,135,68,0.08)',
            border: '1px solid rgba(255,135,68,0.15)',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 24,
          }}
        >
          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.REGULAR}
            color="rgba(255,255,255,0.55)"
          >
            Milestone targets are sourced from public bank information. Actual terms may differ — verify with your card issuer.
          </Typography>
        </div>

        {activeMilestones.length > 0 && (
          <FilterStack>
            <FilterBlock>
              <Typography
                fontType={FontType.BODY}
                fontSize={12}
                fontWeight={FontWeights.SEMI_BOLD}
                color="rgba(255,255,255,0.55)"
              >
                Filter by bank
              </Typography>
              <FilterRow>
                {unselectedBanks.length === 0 ? (
                  <Typography
                    fontType={FontType.BODY}
                    fontSize={13}
                    color="rgba(255,255,255,0.35)"
                    style={{ flex: '1 1 180px', minWidth: 0 }}
                  >
                    All banks are in the filter — remove one to add another.
                  </Typography>
                ) : (
                  <SelectDropdown
                    options={bankFilterOptions}
                    value={bankSelectValue}
                    onChange={onBankDropdownChange}
                    placeholder="Select bank"
                    ariaLabel="Add bank filter"
                    wrapperStyle={filterDropdownWrapper}
                    colorConfig={milestoneDropdownTrigger}
                    menuEdgeColors={edgeAccent}
                  />
                )}
                <Button
                  variant={selectedBanks.length === 0 ? 'secondary' : 'primary'}
                  kind="elevated"
                  size="small"
                  colorMode="dark"
                  onClick={clearBanks}
                >
                  All banks
                </Button>
                {[...selectedBanks]
                  .sort((a, b) => a.localeCompare(b))
                  .map((slug) => (
                    <Button
                      key={slug}
                      variant="secondary"
                      kind="elevated"
                      size="small"
                      colorMode="dark"
                      onClick={() => toggleBank(slug)}
                    >
                      {BANK_CONFIG[slug as Bank]?.name ?? slug}
                    </Button>
                  ))}
              </FilterRow>
            </FilterBlock>

            <FilterBlock>
              <Typography
                fontType={FontType.BODY}
                fontSize={12}
                fontWeight={FontWeights.SEMI_BOLD}
                color="rgba(255,255,255,0.55)"
              >
                Filter by card
              </Typography>
              <FilterRow>
                {unselectedLast4s.length === 0 ? (
                  <Typography
                    fontType={FontType.BODY}
                    fontSize={13}
                    color="rgba(255,255,255,0.35)"
                    style={{ flex: '1 1 180px', minWidth: 0 }}
                  >
                    All cards are in the filter — remove one to add another.
                  </Typography>
                ) : (
                  <SelectDropdown
                    options={last4FilterOptions}
                    value={last4SelectValue}
                    onChange={onLast4DropdownChange}
                    placeholder="Select card"
                    ariaLabel="Add card filter"
                    wrapperStyle={filterDropdownWrapper}
                    colorConfig={milestoneDropdownTrigger}
                    menuEdgeColors={edgeAccent}
                  />
                )}
                <Button
                  variant={selectedLast4s.length === 0 ? 'secondary' : 'primary'}
                  kind="elevated"
                  size="small"
                  colorMode="dark"
                  onClick={clearLast4s}
                >
                  All cards
                </Button>
                {[...selectedLast4s].sort().map((l) => (
                  <Button
                    key={l}
                    variant="secondary"
                    kind="elevated"
                    size="small"
                    colorMode="dark"
                    onClick={() => toggleLast4(l)}
                  >
                    ···· {l}
                  </Button>
                ))}
              </FilterRow>
            </FilterBlock>
          </FilterStack>
        )}

        {filteredMilestones.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Target size={48} style={{ marginBottom: 16, opacity: 0.25, color: colorPalette.rss[500] }} />
            <Typography fontType={FontType.BODY} fontSize={16} color="rgba(255,255,255,0.55)">
              {activeMilestones.length === 0
                ? 'No active milestones. Add one or trigger a sync to import predefined milestones.'
                : 'No milestones match the selected filters.'}
            </Typography>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredMilestones.map((m) => {
              const card = cards.find((c) => c.id === m.cardId);
              const bankName = card ? BANK_CONFIG[card.bank as Bank]?.name : 'Unknown';
              const lastFour = card?.last4 || '****';

              return (
                <ElevatedCard
                  key={m.id}
                  backgroundColor={mainColors.black}
                  edgeColors={edgeAccent}
                  style={{
                    padding: 16,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    display: 'block',
                    backgroundColor: 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <Typography
                          fontType={FontType.BODY}
                          fontSize={14}
                          fontWeight={FontWeights.BOLD}
                          color={mainColors.white}
                        >
                          {m.title}
                        </Typography>
                        <Typography
                          fontType={FontType.BODY}
                          fontSize={12}
                          fontWeight={FontWeights.REGULAR}
                          color="rgba(255,255,255,0.4)"
                        >
                          {bankName} ···· {lastFour}
                        </Typography>
                        <Tag
                          colorMode="dark"
                          colorConfig={{
                            background: 'rgba(255,135,68,0.15)',
                            color: colorPalette.rss[400],
                          }}
                        >
                          {m.milestoneType}
                        </Tag>
                        <Tag
                          colorMode="dark"
                          colorConfig={{
                            background: m.isAutoCreated ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)',
                            color: mainColors.white,
                          }}
                        >
                          {m.isAutoCreated ? 'Auto' : 'Manual'}
                        </Tag>
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <Typography
                          fontType={FontType.BODY}
                          fontSize={12}
                          fontWeight={FontWeights.REGULAR}
                          color="rgba(255,255,255,0.45)"
                          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <TrendingUp size={12} style={{ flexShrink: 0 }} />
                          ₹{m.currentAmount.toLocaleString()} / ₹{m.targetAmount.toLocaleString()}
                        </Typography>
                        <Typography
                          fontType={FontType.BODY}
                          fontSize={12}
                          fontWeight={FontWeights.REGULAR}
                          color="rgba(255,255,255,0.45)"
                          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Calendar size={12} style={{ flexShrink: 0 }} />
                          {m.daysLeft} days left
                        </Typography>
                      </div>
                      <ProgressBarContainer>
                        <ProgressBarFill $percent={m.percent} />
                      </ProgressBarContainer>
                      <Typography
                        fontType={FontType.BODY}
                        fontSize={12}
                        fontWeight={FontWeights.REGULAR}
                        color="rgba(255,255,255,0.5)"
                        style={{ marginTop: 6 }}
                      >
                        {m.percent.toFixed(1)}% • ₹{m.remaining.toLocaleString()} remaining
                      </Typography>
                    </div>

                    <MilestoneActions>
                      <button
                        type="button"
                        aria-label="Delete milestone"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 6,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onClick={() => handleDelete(m.id)}
                      >
                        <Trash2 size={14} color="rgba(255,255,255,0.35)" />
                      </button>
                    </MilestoneActions>
                  </div>
                </ElevatedCard>
              );
            })}
          </div>
        )}

        {showCreateModal && (
          <ModalOverlay onClick={() => setShowCreateModal(false)}>
            <ElevatedCard
              backgroundColor={mainColors.black}
              edgeColors={edgeAccent}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              style={{
                padding: 0,
                width: '100%',
                maxWidth: 460,
                maxHeight: 'none',
                display: 'block',
                backgroundColor: 'transparent',
                boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
              }}
            >
              <Column style={{ width: '100%', backgroundColor: colorPalette.black[500] }}>
                <Row
                  backgroundColor={colorPalette.black[500]}
                  className="h-center v-justify"
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <Typography
                    fontType={FontType.HEADING}
                    fontSize={18}
                    fontWeight={FontWeights.EXTRA_BOLD}
                    color={mainColors.white}
                  >
                    Create Milestone
                  </Typography>
                  <CloseButton onClick={() => setShowCreateModal(false)} variant="modal" />
                </Row>
                <CreateMilestoneModalContent
                  cards={cards}
                  onClose={() => setShowCreateModal(false)}
                  onCreate={handleCreate}
                />
              </Column>
            </ElevatedCard>
          </ModalOverlay>
        )}
      </Content>
    </PageLayout>
  );
}

function CreateMilestoneModalContent({
  cards,
  onClose,
  onCreate,
}: {
  cards: Array<{ id: string; bank: string; last4: string }>;
  onClose: () => void;
  onCreate: (data: {
    card_id: string;
    title: string;
    target_amount: number;
    period_kind?: string;
    milestone_type?: string;
  }) => void;
}) {
  const [cardId, setCardId] = useState(cards[0]?.id || '');
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('100000');
  const [periodKind, setPeriodKind] = useState('calendar_quarter');
  const [milestoneType, setMilestoneType] = useState('fee_waiver');

  const cardOptions = useMemo<SelectDropdownOption[]>(
    () =>
      cards.map((c) => ({
        value: c.id,
        label: `${BANK_CONFIG[c.bank as Bank]?.name} ···· ${c.last4}`,
      })),
    [cards],
  );

  const labelProps = {
    as: 'label' as const,
    fontType: FontType.BODY,
    fontSize: 12,
    fontWeight: FontWeights.SEMI_BOLD,
    color: 'rgba(255,255,255,0.55)' as const,
    style: { display: 'block' as const, marginBottom: 6 },
  };

  return (
    <>
      <div style={{ padding: 20 }}>
        <FormField>
          <Typography {...labelProps}>Card *</Typography>
          <SelectDropdown
            options={cardOptions}
            value={cardId}
            onChange={setCardId}
            placeholder="Select card"
            ariaLabel="Card"
            wrapperStyle={{ width: '100%', boxSizing: 'border-box' }}
            colorConfig={milestoneDropdownTrigger}
            menuEdgeColors={edgeAccent}
          />
        </FormField>

        <FormField>
          <Typography {...labelProps}>Title *</Typography>
          <InputField
            colorMode="dark"
            placeholder="e.g. Quarterly Spend Bonus"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </FormField>

        <FormField>
          <Typography {...labelProps}>Target Amount (₹) *</Typography>
          <InputField
            colorMode="dark"
            type="number"
            placeholder="100000"
            value={targetAmount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetAmount(e.target.value)}
            style={inputStyle}
          />
        </FormField>

        <FormField>
          <Typography {...labelProps}>Period</Typography>
          <SelectDropdown
            options={PERIOD_KIND_OPTIONS}
            value={periodKind}
            onChange={setPeriodKind}
            ariaLabel="Period"
            wrapperStyle={{ width: '100%', boxSizing: 'border-box' }}
            colorConfig={milestoneDropdownTrigger}
            menuEdgeColors={edgeAccent}
          />
        </FormField>

        <FormField>
          <Typography {...labelProps}>Type</Typography>
          <SelectDropdown
            options={MILESTONE_TYPE_OPTIONS}
            value={milestoneType}
            onChange={setMilestoneType}
            ariaLabel="Milestone type"
            wrapperStyle={{ width: '100%', boxSizing: 'border-box' }}
            colorConfig={milestoneDropdownTrigger}
            menuEdgeColors={edgeAccent}
          />
        </FormField>
      </div>

      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        <Button kind="elevated" size="small" colorMode="dark" variant="primary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          kind="elevated"
          size="small"
          colorMode="dark"
          variant="secondary"
          onClick={() => {
            if (!title.trim() || !targetAmount) return;
            onCreate({
              card_id: cardId,
              title: title.trim(),
              target_amount: parseFloat(targetAmount),
              period_kind: periodKind,
              milestone_type: milestoneType,
            });
          }}
        >
          Create
        </Button>
      </div>
    </>
  );
}
