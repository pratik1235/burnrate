import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Button, Typography, ElevatedCard, Tag, InputField, SearchBar } from '@cred/neopop-web/lib/components';
import { mainColors, colorPalette } from '@cred/neopop-web/lib/primitives';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { useOffers } from '@/hooks/useApi';
import { createOffer, deleteOffer, hideOffer, triggerOfferSync } from '@/lib/api';
import type { GetOffersParams } from '@/lib/api';
import { toast } from '@/components/Toast';
import { CloseButton } from '@/components/CloseButton';
import { Gift, Percent, RefreshCw, Plus, EyeOff, Trash2, ExternalLink } from 'lucide-react';
import { BANK_CONFIG } from '@/lib/types';
import type { Bank } from '@/lib/types';
import styled from 'styled-components';

const OFFER_CATEGORIES: { slug: string; label: string }[] = [
  { slug: 'shopping', label: 'Shopping' },
  { slug: 'dining', label: 'Dining' },
  { slug: 'travel', label: 'Travel' },
  { slug: 'fuel', label: 'Fuel' },
  { slug: 'entertainment', label: 'Entertainment' },
  { slug: 'groceries', label: 'Groceries' },
  { slug: 'emi', label: 'EMI' },
  { slug: 'lounge', label: 'Lounge' },
];

const PageLayout = styled.div`
  min-height: 100vh;
  background-color: ${mainColors.black};
`;

const Content = styled.main`
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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

const Header = styled.div`
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
`;

const OffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
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
  border: `1px solid rgba(255,255,255,0.12)`,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  color: mainColors.white,
  outline: 'none' as const,
  width: '100%',
  boxSizing: 'border-box' as const,
};

const selectInlineStyle = {
  ...inputStyle,
  width: 'auto' as const,
  minWidth: 200,
  maxWidth: 280,
  flexShrink: 0,
};

const edgeAccent = {
  bottom: colorPalette.rss[600],
  right: colorPalette.rss[800],
};

export function Offers() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchClearKey, setSearchClearKey] = useState(0);
  const [selectedBanks, setSelectedBanks] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [bankSelectValue, setBankSelectValue] = useState('');
  const [categorySelectValue, setCategorySelectValue] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const banksKey = selectedBanks.join('|');
  const categoriesKey = selectedCategories.join('|');
  const offersParams = useMemo<GetOffersParams>(
    () => ({
      search: searchQuery || undefined,
      banks:
        selectedBanks.length > 0
          ? [...selectedBanks].sort((a, b) => a.localeCompare(b)).join(',')
          : undefined,
      categories:
        selectedCategories.length > 0
          ? [...selectedCategories].sort((a, b) => a.localeCompare(b)).join(',')
          : undefined,
      limit: 100,
    }),
    [searchQuery, banksKey, categoriesKey],
  );

  const { offers, total, lastSyncAt, loading, refetch } = useOffers(offersParams);

  const bankEntries = useMemo(
    () => Object.entries(BANK_CONFIG).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [],
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === 'setup') navigate('/setup');
      else navigate(`/${tab}`);
    },
    [navigate],
  );

  const toggleBank = useCallback((slug: string) => {
    setSelectedBanks((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }, []);

  const clearBanks = useCallback(() => setSelectedBanks([]), []);

  const toggleCategory = useCallback((slug: string) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }, []);

  const clearCategories = useCallback(() => setSelectedCategories([]), []);

  const onBankDropdownChange = useCallback((slug: string) => {
    if (!slug) return;
    setSelectedBanks((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    setBankSelectValue('');
  }, []);

  const onCategoryDropdownChange = useCallback((slug: string) => {
    if (!slug) return;
    setSelectedCategories((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    setCategorySelectValue('');
  }, []);

  const unselectedBankEntries = useMemo(
    () => bankEntries.filter(([slug]) => !selectedBanks.includes(slug)),
    [bankEntries, selectedBanks],
  );

  const unselectedCategories = useMemo(
    () => OFFER_CATEGORIES.filter((c) => !selectedCategories.includes(c.slug)),
    [selectedCategories],
  );

  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerOfferSync();
      toast.success('Offer sync started');
      setTimeout(() => refetch(), 3000);
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleHide = async (id: string) => {
    await hideOffer(id);
    refetch();
  };

  const handleDelete = async (id: string) => {
    await deleteOffer(id);
    toast.success('Offer deleted');
    refetch();
  };

  const handleCreate = async (data: {
    title: string;
    description?: string;
    bank?: string;
    category?: string;
    offer_type?: string;
  }) => {
    await createOffer(data);
    toast.success('Offer created');
    setShowCreateModal(false);
    refetch();
  };

  return (
    <PageLayout>
      <Navbar activeTab="offers" onTabChange={handleTabChange} />
      <Content>
        <Header>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Gift size={22} color={colorPalette.rss[500]} />
            <Typography
              fontType={FontType.HEADING}
              fontSize={22}
              fontWeight={FontWeights.EXTRA_BOLD}
              color={mainColors.white}
            >
              Offers & Benefits
            </Typography>
            {total > 0 && (
              <Tag
                colorMode="dark"
                colorConfig={{
                  background: 'rgba(255,135,68,0.18)',
                  color: colorPalette.rss[500],
                }}
              >
                {total} offers
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
              Add Offer
            </Button>
          </div>
        </Header>

        {lastSyncAt && (
          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.REGULAR}
            color="rgba(255,255,255,0.45)"
            style={{ marginBottom: 12 }}
          >
            Last synced: {new Date(lastSyncAt).toLocaleString()}
          </Typography>
        )}

        <ActionBar>
          <div style={{ flex: 1, minWidth: 200 }} />
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              maxWidth: 400,
              width: '100%',
            }}
          >
            <CompactSearchWrapper style={{ flex: 1 }}>
              <SearchBar
                key={searchClearKey}
                placeholder="Search offers..."
                colorMode={searchQuery ? 'light' : 'dark'}
                handleSearchInput={(value: string) => setSearchInputValue(value)}
                onSubmit={() => setSearchQuery(searchInputValue)}
                colorConfig={{
                  border: 'rgba(255,255,255,0.2)',
                  activeBorder: mainColors.white,
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
                }}
                variant="inline"
              />
            )}
          </div>
        </ActionBar>

        <FilterStack>
          <FilterBlock>
            <Typography
              fontType={FontType.BODY}
              fontSize={12}
              fontWeight={FontWeights.SEMI_BOLD}
              color="rgba(255,255,255,0.55)"
            >
              Select banks
            </Typography>
            <FilterRow>
              {unselectedBankEntries.length === 0 ? (
                <Typography
                  fontType={FontType.BODY}
                  fontSize={13}
                  color="rgba(255,255,255,0.35)"
                  style={{ flex: '1 1 180px', minWidth: 0 }}
                >
                  All banks are in the filter — remove one to add another.
                </Typography>
              ) : (
                <select
                  value={bankSelectValue}
                  aria-label="Add bank filter"
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onBankDropdownChange(e.target.value)}
                  style={selectInlineStyle}
                >
                  <option value="">Choose a bank…</option>
                  {unselectedBankEntries.map(([slug, cfg]) => (
                    <option key={slug} value={slug}>
                      {cfg.name}
                    </option>
                  ))}
                </select>
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
              Select categories
            </Typography>
            <FilterRow>
              {unselectedCategories.length === 0 ? (
                <Typography
                  fontType={FontType.BODY}
                  fontSize={13}
                  color="rgba(255,255,255,0.35)"
                  style={{ flex: '1 1 180px', minWidth: 0 }}
                >
                  All categories are in the filter — remove one to add another.
                </Typography>
              ) : (
                <select
                  value={categorySelectValue}
                  aria-label="Add category filter"
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onCategoryDropdownChange(e.target.value)}
                  style={selectInlineStyle}
                >
                  <option value="">Choose a category…</option>
                  {unselectedCategories.map(({ slug, label }) => (
                    <option key={slug} value={slug}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant={selectedCategories.length === 0 ? 'secondary' : 'primary'}
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={clearCategories}
              >
                All categories
              </Button>
              {[...selectedCategories]
                .sort((a, b) => a.localeCompare(b))
                .map((slug) => {
                  const label = OFFER_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
                  return (
                    <Button
                      key={slug}
                      variant="secondary"
                      kind="elevated"
                      size="small"
                      colorMode="dark"
                      onClick={() => toggleCategory(slug)}
                    >
                      {label}
                    </Button>
                  );
                })}
            </FilterRow>
          </FilterBlock>
        </FilterStack>

        <div
          style={{
            background: 'rgba(255,135,68,0.08)',
            border: '1px solid rgba(255,135,68,0.15)',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 20,
          }}
        >
          <Typography
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.REGULAR}
            color="rgba(255,255,255,0.55)"
          >
            Offers are sourced from public bank pages and aggregator sites. Verify with your card issuer before use.
          </Typography>
        </div>

        {loading ? (
          <Typography fontType={FontType.BODY} fontSize={14} color="rgba(255,255,255,0.5)">
            Loading offers...
          </Typography>
        ) : offers.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Gift size={48} style={{ marginBottom: 16, opacity: 0.25, color: colorPalette.rss[500] }} />
            <Typography fontType={FontType.BODY} fontSize={16} color="rgba(255,255,255,0.55)">
              No offers found. Try syncing or adding a manual offer.
            </Typography>
          </div>
        ) : (
          <OffersGrid>
            {offers.map((offer) => (
              <ElevatedCard
                key={offer.id}
                backgroundColor={colorPalette.black[500]}
                edgeColors={edgeAccent}
                fullWidth={true}
                style={{ padding: 18, }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <Typography fontType={FontType.BODY} fontSize={15} fontWeight={FontWeights.BOLD} color={mainColors.white}>
                    {offer.title}
                  </Typography>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {offer.isUserCreated ? (
                      <button
                        type="button"
                        aria-label="Delete offer"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 4,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onClick={() => handleDelete(offer.id)}
                      >
                        <Trash2 size={14} color="rgba(255,255,255,0.35)" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="Hide offer"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 4,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onClick={() => handleHide(offer.id)}
                      >
                        <EyeOff size={14} color="rgba(255,255,255,0.35)" />
                      </button>
                    )}
                  </div>
                </div>

                {offer.discountText && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Percent size={12} color={colorPalette.rss[500]} />
                    <Typography
                      fontType={FontType.BODY}
                      fontSize={13}
                      fontWeight={FontWeights.SEMI_BOLD}
                      color={colorPalette.rss[500]}
                    >
                      {offer.discountText}
                    </Typography>
                  </div>
                )}

                {offer.description && (
                  <Typography
                    fontType={FontType.BODY}
                    fontSize={13}
                    fontWeight={FontWeights.REGULAR}
                    color="rgba(255,255,255,0.5)"
                    style={{ marginTop: 6, lineHeight: 1.45 }}
                  >
                    {offer.description.length > 120 ? `${offer.description.slice(0, 120)}…` : offer.description}
                  </Typography>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {offer.bank && (
                    <Tag
                      colorMode="dark"
                      colorConfig={{
                        background: `${BANK_CONFIG[offer.bank as Bank]?.color || '#666'}40`,
                        color: mainColors.white,
                      }}
                    >
                      {BANK_CONFIG[offer.bank as Bank]?.name || offer.bank}
                    </Tag>
                  )}
                  {offer.category && (
                    <Tag
                      colorMode="dark"
                      colorConfig={{
                        background: 'rgba(255,135,68,0.15)',
                        color: colorPalette.rss[400],
                      }}
                    >
                      {offer.category}
                    </Tag>
                  )}
                  {offer.offerType && (
                    <Tag
                      colorMode="dark"
                      colorConfig={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
                    >
                      {offer.offerType}
                    </Tag>
                  )}
                  <Tag
                    colorMode="dark"
                    colorConfig={{
                      background: offer.isUserCreated ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)',
                      color: mainColors.white,
                    }}
                  >
                    {offer.isUserCreated ? 'Manual' : offer.source}
                  </Tag>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {offer.validUntil ? (
                    <Typography fontType={FontType.BODY} fontSize={11} color="rgba(255,255,255,0.4)">
                      Valid until {offer.validUntil}
                    </Typography>
                  ) : (
                    <span />
                  )}
                  {offer.sourceUrl && (
                    <a
                      href={offer.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open source"
                      style={{ color: colorPalette.rss[500], display: 'flex', alignItems: 'center' }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </ElevatedCard>
            ))}
          </OffersGrid>
        )}

        {showCreateModal && (
          <ModalOverlay onClick={() => setShowCreateModal(false)}>
            <ElevatedCard
              backgroundColor={colorPalette.black[90]}
              edgeColors={edgeAccent}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 460, boxShadow: '0 24px 48px rgba(0,0,0,0.55)' }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography
                  fontType={FontType.HEADING}
                  fontSize={18}
                  fontWeight={FontWeights.EXTRA_BOLD}
                  color={mainColors.white}
                >
                  Add Manual Offer
                </Typography>
                <CloseButton onClick={() => setShowCreateModal(false)} variant="modal" />
              </div>
              <CreateOfferModalContent onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
            </ElevatedCard>
          </ModalOverlay>
        )}
      </Content>
    </PageLayout>
  );
}

function CreateOfferModalContent({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    bank?: string;
    category?: string;
    offer_type?: string;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bank, setBank] = useState('');
  const [category, setCategory] = useState('');

  return (
    <>
      <div style={{ padding: 20 }}>
        <FormField>
          <Typography
            as="label"
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.SEMI_BOLD}
            color="rgba(255,255,255,0.55)"
            style={{ display: 'block', marginBottom: 6 }}
          >
            Title *
          </Typography>
          <InputField
            colorMode="dark"
            placeholder="e.g. 10% Cashback on Swiggy"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </FormField>

        <FormField>
          <Typography
            as="label"
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.SEMI_BOLD}
            color="rgba(255,255,255,0.55)"
            style={{ display: 'block', marginBottom: 6 }}
          >
            Description
          </Typography>
          <InputField
            colorMode="dark"
            placeholder="Offer details..."
            value={description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
            style={inputStyle}
          />
        </FormField>

        <FormField>
          <Typography
            as="label"
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.SEMI_BOLD}
            color="rgba(255,255,255,0.55)"
            style={{ display: 'block', marginBottom: 6 }}
          >
            Bank
          </Typography>
          <select value={bank} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBank(e.target.value)} style={inputStyle}>
            <option value="">Any Bank</option>
            {Object.entries(BANK_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField>
          <Typography
            as="label"
            fontType={FontType.BODY}
            fontSize={12}
            fontWeight={FontWeights.SEMI_BOLD}
            color="rgba(255,255,255,0.55)"
            style={{ display: 'block', marginBottom: 6 }}
          >
            Category
          </Typography>
          <select
            value={category}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
            style={inputStyle}
          >
            <option value="">None</option>
            {OFFER_CATEGORIES.map(({ slug, label }) => (
              <option key={slug} value={slug}>
                {label}
              </option>
            ))}
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
            if (!title.trim()) return;
            onCreate({
              title: title.trim(),
              description: description.trim() || undefined,
              bank: bank || undefined,
              category: category || undefined,
            });
          }}
        >
          Create
        </Button>
      </div>
    </>
  );
}
