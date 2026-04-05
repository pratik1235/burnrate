import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button, Typography, ElevatedCard, Tag, InputField, Row, Column } from '@cred/neopop-web/lib/components';
import { mainColors, colorPalette } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { useMilestones, useCards } from '@/hooks/useApi';
import { createMilestone, deleteMilestone, archiveMilestone, triggerMilestoneSync } from '@/lib/api';
import { toast } from '@/components/Toast';
import { CloseButton } from '@/components/CloseButton';
import { Target, TrendingUp, Calendar, RefreshCw, Plus, Trash2, Archive } from 'lucide-react';
import { BANK_CONFIG } from '@/lib/types';
import type { Bank, Milestone } from '@/lib/types';
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

const CardSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
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

export function Milestones() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { milestones, refetch } = useMilestones();
  const { cards } = useCards();

  const activeMilestones = milestones.filter((m) => !m.isArchived);
  const groupedByCard = activeMilestones.reduce(
    (acc, m) => {
      const key = m.cardId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    },
    {} as Record<string, Milestone[]>,
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

  const handleArchive = async (id: string) => {
    await archiveMilestone(id);
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
              Milestones & Goals
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
            <Button kind="elevated" size="small" colorMode="dark" variant="primary" onClick={handleSync}>
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} style={{ marginRight: 6 }} />
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
            <Button
              kind="elevated"
              size="small"
              colorMode="dark"
              variant="secondary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={14} style={{ marginRight: 6 }} />
              Add Milestone
            </Button>
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

        {activeMilestones.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Target size={48} style={{ marginBottom: 16, opacity: 0.25, color: colorPalette.rss[500] }} />
            <Typography fontType={FontType.BODY} fontSize={16} color="rgba(255,255,255,0.55)">
              No active milestones. Add one or trigger a sync to import predefined milestones.
            </Typography>
          </div>
        ) : (
          <>
            {Object.entries(groupedByCard).map(([cardId, cardMilestones]) => {
              const card = cards.find((c) => c.id === cardId);
              const bankName = card ? BANK_CONFIG[card.bank as Bank]?.name : 'Unknown';
              const lastFour = card?.last4 || '****';

              return (
                <CardSection key={cardId}>
                  <Typography
                    fontType={FontType.BODY}
                    fontSize={11}
                    fontWeight={FontWeights.SEMI_BOLD}
                    color="rgba(255,255,255,0.45)"
                    style={{
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      paddingLeft: 4,
                    }}
                  >
                    {bankName} ···· {lastFour}
                  </Typography>
                  {cardMilestones.map((m) => (
                    <ElevatedCard
                      key={m.id}
                      backgroundColor={mainColors.black}
                      edgeColors={edgeAccent}
                      style={{ padding: 16 }}
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
                            <Tag
                              colorMode="dark"
                              colorConfig={{
                                background: 'rgba(255,135,68,0.15)',
                                color: colorPalette.rss[400],
                              }}
                            >
                              {m.milestoneType}
                            </Tag>
                            {m.isAutoCreated && (
                              <Tag
                                colorMode="dark"
                                colorConfig={{
                                  background: 'rgba(59,130,246,0.2)',
                                  color: mainColors.white,
                                }}
                              >
                                Auto
                              </Tag>
                            )}
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
                          {m.isCustom ? (
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
                          ) : (
                            <button
                              type="button"
                              aria-label="Archive milestone"
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 6,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              onClick={() => handleArchive(m.id)}
                            >
                              <Archive size={14} color="rgba(255,255,255,0.35)" />
                            </button>
                          )}
                        </MilestoneActions>
                      </div>
                    </ElevatedCard>
                  ))}
                </CardSection>
              );
            })}
          </>
        )}

        {showCreateModal && (
          <ModalOverlay onClick={() => setShowCreateModal(false)}>
            <ElevatedCard
              backgroundColor={mainColors.black}
              edgeColors={edgeAccent}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 460, boxShadow: '0 24px 48px rgba(0,0,0,0.55)' }}
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
          <select
            value={cardId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCardId(e.target.value)}
            style={inputStyle}
          >
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {BANK_CONFIG[c.bank as Bank]?.name} ···· {c.last4}
              </option>
            ))}
          </select>
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
          <select
            value={periodKind}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPeriodKind(e.target.value)}
            style={inputStyle}
          >
            <option value="calendar_month">Monthly</option>
            <option value="calendar_quarter">Quarterly</option>
            <option value="calendar_year">Annual</option>
            <option value="rolling_days">Rolling 30 days</option>
          </select>
        </FormField>

        <FormField>
          <Typography {...labelProps}>Type</Typography>
          <select
            value={milestoneType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMilestoneType(e.target.value)}
            style={inputStyle}
          >
            <option value="fee_waiver">Fee Waiver</option>
            <option value="bonus_points">Bonus Points</option>
            <option value="lounge_access">Lounge Access</option>
            <option value="accelerated_rewards">Accelerated Rewards</option>
            <option value="voucher">Voucher</option>
            <option value="cashback">Cashback</option>
          </select>
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
