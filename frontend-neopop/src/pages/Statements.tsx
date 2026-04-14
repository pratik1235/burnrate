import { useState, useEffect, useCallback, type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { StatUpload } from '@/components/StatUpload';
import { FilterModal, type BankStatementFilterValues } from '@/components/FilterModal';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import { useFilters } from '@/contexts/FilterContext';
import { useCards } from '@/hooks/useApi';
import { getBankAccountKeys } from '@/lib/api';
import { Button, Typography, InputField, Row, Column } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import {
  getStatements,
  type GetStatementsParams,
  deleteStatement,
  reparseStatement,
  uploadStatement,
  uploadStatementsBulk,
  retryWithPassword,
} from '@/lib/api';
import type { Statement } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';
import { toast } from '@/components/Toast';
import { notifyBulkUploadToasts, syntheticBulkUploadFailure } from '@/lib/bulkUploadSummary';
import { Trash2, RefreshCw, AlertTriangle, Lock, SlidersHorizontal } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import styled, { css } from 'styled-components';

const PageLayout = styled.div`
  min-height: 100vh;
  background-color: ${mainColors.black};
`;

const Content = styled.main`
  padding: 32px 24px;
  max-width: 900px;
  margin: 0 auto;
`;

/** Main statement layout: left column (details) vs right column (actions + optional manual source path). */
const statementBodyRowStyle: CSSProperties = {
  width: '100%',
  flexWrap: 'wrap',
  justifyContent: 'space-around',
  alignItems: 'flex-start',
  gap: 24,
  boxSizing: 'border-box',
};

const statementLeftColStyle: CSSProperties = {
  flex: '1 1 260px',
  minWidth: 0,
  gap: 6,
  padding: '6px 10px',
  boxSizing: 'border-box',
};

const statementRightColStyle: CSSProperties = {
  alignItems: 'flex-end',
  justifyContent: 'space-around',
  gap: 14,
  flexShrink: 0,
  padding: '12px 14px',
  boxSizing: 'border-box',
};

const statementRightColPasswordStyle: CSSProperties = {
  ...statementRightColStyle,
  alignItems: 'center',
  justifyContent: 'space-around',
  minWidth: 160,
};

const statementButtonRowStyle: CSSProperties = {
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'space-around',
  width: '100%',
};

const statementTitleRowStyle: CSSProperties = {
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
};

const UploadRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

/**
 * Matches Dashboard `ClickableSpend` around SpendSummary: lift + soft shadow on hover.
 * Applied only to successfully parsed rows (`$warn` is false).
 */
const StatementListRow = styled.div<{ $warn: boolean }>`
  padding: 14px 16px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  border: ${(p) =>
    p.$warn ? '1px solid rgba(229,161,0,0.4)' : '1px solid rgba(255,255,255,0.08)'};
  background: ${(p) => (p.$warn ? 'rgba(229,161,0,0.04)' : 'transparent')};

  ${(p) =>
    !p.$warn &&
    css`
      cursor: pointer;
      transition:
        transform 0.25s ease,
        box-shadow 0.25s ease;
      &:hover {
        transform: translateY(-3px) scale(1.01);
        box-shadow: 0 8px 24px rgba(255, 255, 255, 0.06);
      }
      &:active {
        transform: translateY(0) scale(0.99);
        box-shadow: none;
      }
    `}
`;

const PathDisplay = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  word-break: break-all;
  line-height: 1.4;
  text-align: right;
  display: block;
  max-width: 340px;
  cursor: default;

  .path-full {
    display: none;
  }
  .path-short {
    display: inline;
  }

  &:hover {
    .path-full {
      display: inline;
    }
    .path-short {
      display: none;
    }
  }
`;

/** Matches server-side manual upload filename: `{uuid32}_{basename}` in data/uploads. */
const UUID_STORED_FILENAME_PREFIX = /^[0-9a-f]{32}_/i;

function statementStoredBasename(s: Statement): string {
  const fn = (s.fileName ?? '').trim();
  if (fn) return fn;
  const fp = (s.filePath ?? '').trim();
  if (!fp) return '';
  const parts = fp.split(/[/\\]/);
  return parts[parts.length - 1] ?? '';
}

function isPersistedManualUpload(s: Statement): boolean {
  return UUID_STORED_FILENAME_PREFIX.test(statementStoredBasename(s));
}

function looksLikeBurnrateDataUploadsPath(p: string): boolean {
  return p.replace(/\\/g, '/').toLowerCase().includes('/data/uploads');
}

/** Resolve the original filesystem path for any statement type; never the internal data/uploads copy. */
function statementDisplayPathForRow(s: Statement): string | null {
  if (isPersistedManualUpload(s)) {
    const fp = (s.filePath ?? '').trim();
    const candidates = [(s.originalUploadPath ?? '').trim(), (s.displayPath ?? '').trim()].filter(Boolean);
    for (const c of candidates) {
      if (fp && c === fp) continue;
      if (looksLikeBurnrateDataUploadsPath(c)) continue;
      return c;
    }
    return null;
  }
  const fp = (s.filePath ?? '').trim();
  if (!fp) return (s.displayPath ?? '').trim() || null;
  if (looksLikeBurnrateDataUploadsPath(fp)) return (s.displayPath ?? '').trim() || null;
  return fp;
}

function truncatedPathDisplay(fullPath: string): string {
  const sep = fullPath.includes('/') ? '/' : fullPath.includes('\\') ? '\\' : null;
  if (!sep) return fullPath;
  const parts = fullPath.split(sep);
  const filename = parts[parts.length - 1];
  return `.../${filename}`;
}

function statementPathLine(s: Statement) {
  const fullPath = statementDisplayPathForRow(s);
  if (!fullPath) return null;
  const short = truncatedPathDisplay(fullPath);
  return (
    <PathDisplay aria-label={`Original file path: ${fullPath}`}>
      <span className="path-short">{short}</span>
      <span className="path-full">{fullPath}</span>
    </PathDisplay>
  );
}

function statementSortPriority(s: Statement): number {
  if (s.status === 'password_needed') return 0;
  if (s.status === 'parse_error') return 1;
  return 2;
}

function bankRowMeta(s: Statement) {
  const cfg = (BANK_CONFIG as Record<string, { name: string; color: string }>)[s.bank] ?? {
    name: s.bank.toUpperCase(),
    color: '#6B7280',
  };
  return cfg;
}

export function Statements() {
  const navigate = useNavigate();
  const { setFilters } = useFilters();
  const { cards } = useCards();
  const [bankAccounts, setBankAccounts] = useState<{ id: string; bank: string; last4: string }[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});
  const [stmtFilters, setStmtFilters] = useState<BankStatementFilterValues>({ banks: [] });
  const [filterOpen, setFilterOpen] = useState(false);
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);

  const refreshBankSlugs = useCallback(async () => {
    try {
      const rows = await getStatements();
      const slugs = [...new Set(rows.map((r) => r.bank.toLowerCase()))].sort();
      setAvailableBanks(slugs);
    } catch {
      setAvailableBanks([]);
    }
  }, []);

  const fetchStatements = useCallback(async () => {
    setLoading(true);
    try {
      const params: GetStatementsParams = {};
      if (stmtFilters.banks.length > 0) params.banks = stmtFilters.banks.join(',');
      if (stmtFilters.from) params.from = stmtFilters.from;
      if (stmtFilters.to) params.to = stmtFilters.to;
      if (stmtFilters.source) params.source = stmtFilters.source;
      const data = await getStatements(params);
      setStatements(data);
    } catch {
      toast.error('Failed to load statements');
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, [stmtFilters]);

  useEffect(() => {
    refreshBankSlugs();
  }, [refreshBankSlugs]);

  useEffect(() => {
    fetchStatements();
  }, [fetchStatements]);

  useEffect(() => {
    getBankAccountKeys()
      .then(setBankAccounts)
      .catch(() => setBankAccounts([]));
  }, []);

  const openTransactionsForStatement = useCallback(
    (s: Statement) => {
      const from = s.periodStart || undefined;
      const to = s.periodEnd || undefined;
      const safeCardList = Array.isArray(cards) ? cards : [];
      if (s.source === 'BANK') {
        const nb = s.bank.toLowerCase();
        const match = bankAccounts.find((a) => a.bank.toLowerCase() === nb && a.last4 === s.cardLast4);
        setFilters({
          dateRange: { from, to },
          selectedCards: [],
          selectedBankAccounts: match ? [match.id] : [],
          source: 'BANK',
        });
      } else {
        const matchingCard = safeCardList.find((c) => c.bank === s.bank && c.last4 === s.cardLast4);
        setFilters({
          dateRange: { from, to },
          selectedCards: matchingCard ? [matchingCard.id] : [],
          selectedBankAccounts: [],
          source: 'CC',
        });
      }
      navigate('/transactions');
    },
    [bankAccounts, cards, navigate, setFilters],
  );

  const fmt = (d: string) => {
    if (!d) return '—';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const afterAnyUpload = async () => {
    await refreshBankSlugs();
    await fetchStatements();
  };

  const handleCCUpload = async (file: File, password?: string) => {
    const loadingId = toast.loading('Processing card statement...');
    try {
      const result = await uploadStatement(file, undefined, password, 'CC');
      toast.dismiss(loadingId);
      if (result.status === 'success') {
        toast.success(
          `${result.count ?? 0} transactions imported from ${(result.bank ?? '').toUpperCase()} statement`
        );
        await afterAnyUpload();
      } else if (result.status === 'duplicate') {
        toast.info(result.message ?? 'Statement already imported');
      } else if (result.status === 'parse_error') {
        toast.warning(result.message ?? 'Could not extract transactions from this statement.');
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

  const handleCCBulkUpload = async (files: File[]) => {
    const loadingId = toast.loading(`Processing ${files.length} card statements...`);
    try {
      const result = await uploadStatementsBulk(files, undefined, undefined, 'CC');
      toast.dismiss(loadingId);
      notifyBulkUploadToasts(result, toast);
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      const message = err instanceof Error ? err.message : 'Bulk upload failed';
      toast.error(message);
      return syntheticBulkUploadFailure(files.length);
    }
  };

  const handleBankUpload = async (file: File, password?: string) => {
    const loadingId = toast.loading('Processing bank statement...');
    try {
      const result = await uploadStatement(file, undefined, password, 'BANK');
      toast.dismiss(loadingId);
      if (result.status === 'success') {
        toast.success(
          `${result.count ?? 0} transactions imported from ${(result.bank ?? '').toUpperCase()} bank statement`
        );
        await afterAnyUpload();
      } else if (result.status === 'duplicate') {
        toast.info(result.message ?? 'Statement already imported');
      } else if (result.status === 'parse_error') {
        toast.warning(result.message ?? 'Could not extract transactions from this statement.');
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

  const handleBankBulkUpload = async (files: File[]) => {
    const loadingId = toast.loading(`Processing ${files.length} bank statements...`);
    try {
      const result = await uploadStatementsBulk(files, undefined, undefined, 'BANK');
      toast.dismiss(loadingId);
      notifyBulkUploadToasts(result, toast);
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      const message = err instanceof Error ? err.message : 'Bulk upload failed';
      toast.error(message);
      return syntheticBulkUploadFailure(files.length);
    }
  };

  const handleReparse = async (id: string) => {
    setActioning(id);
    try {
      const result = await reparseStatement(id);
      if (result.status === 'success') {
        toast.success(`Reparsed ${result.count ?? 0} transactions`);
        await fetchStatements();
      } else {
        toast.error('Reparse failed');
      }
    } catch {
      toast.error('Reparse failed');
    } finally {
      setActioning(null);
    }
  };

  const executeRemove = async () => {
    if (!confirmDeleteId) return;
    setActioning(confirmDeleteId);
    try {
      await deleteStatement(confirmDeleteId);
      toast.success('Statement deleted');
      setStatements((prev) => prev.filter((s) => s.id !== confirmDeleteId));
    } catch {
      toast.error('Delete failed');
    } finally {
      setActioning(null);
      setConfirmDeleteId(null);
    }
  };

  /** Deletes without confirmation — used for unparsed / error rows (parse_error, password_needed). */
  const removeStatementWithoutConfirm = async (id: string) => {
    setActioning(id);
    try {
      await deleteStatement(id);
      toast.success('Statement deleted');
      setStatements((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error('Delete failed');
    } finally {
      setActioning(null);
    }
  };

  const handlePasswordSubmit = async (stmtId: string) => {
    const pwd = (passwordInputs[stmtId] ?? '').trim();
    if (!pwd) return;
    setActioning(stmtId);
    try {
      const result = await retryWithPassword(stmtId, pwd);
      if (result.status === 'success') {
        toast.success(`Unlocked and imported ${result.count ?? 0} transactions`);
        setPasswordInputs((prev) => {
          const next = { ...prev };
          delete next[stmtId];
          return next;
        });
        await fetchStatements();
      } else {
        toast.error(result.message ?? 'Could not unlock with this password');
      }
    } catch {
      toast.error('Failed to unlock statement');
    } finally {
      setActioning(null);
    }
  };

  const periodLine = (s: Statement) => (
    <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
      {s.periodStart && s.periodEnd ? `${fmt(s.periodStart)} – ${fmt(s.periodEnd)}` : '—'}
    </Typography>
  );

  const transactionCountLine = (count: number) => (
    <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
      {count === 1 ? '1 transaction' : `${count} transactions`}
    </Typography>
  );

  const sortedStatements = [...statements].sort((a, b) => statementSortPriority(a) - statementSortPriority(b));

  return (
    <PageLayout>
      <Navbar activeTab="statements" onTabChange={(tab) => navigate(`/${tab}`)} />
      <Content>
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 24 }}>
          <ButtonWithIcon
            icon={SlidersHorizontal}
            variant={
              stmtFilters.banks.length > 0 || stmtFilters.from || stmtFilters.to || stmtFilters.source
                ? 'secondary'
                : 'primary'
            }
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={() => setFilterOpen(true)}
            justifyContent="center"
            gap={6}
          >
            Filters
            {(stmtFilters.banks.length > 0 || stmtFilters.from || stmtFilters.to || stmtFilters.source) &&
              ` (${stmtFilters.banks.length + (stmtFilters.from ? 1 : 0) + (stmtFilters.to ? 1 : 0) + (stmtFilters.source ? 1 : 0)})`}
          </ButtonWithIcon>
        </div>

        <UploadRow>
          <div>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.SEMI_BOLD} color="rgba(255,255,255,0.7)" style={{ marginBottom: 8 }}>
              Credit card (PDF)
            </Typography>
            <StatUpload
              onUpload={handleCCUpload}
              onBulkUpload={handleCCBulkUpload}
              onBulkUploadSummaryDismissed={(result) => {
                if (result.success > 0) {
                  void afterAnyUpload();
                }
              }}
              acceptTypes={{ 'application/pdf': ['.pdf'] }}
              idleText="Drop statement PDFs here, or click to browse"
              subtitleText="PDF — same import as Customize"
            />
          </div>
          <div>
            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.SEMI_BOLD} color="rgba(255,255,255,0.7)" style={{ marginBottom: 8 }}>
              Bank account (CSV)
            </Typography>
            <StatUpload
              onUpload={handleBankUpload}
              onBulkUpload={handleBankBulkUpload}
              onBulkUploadSummaryDismissed={(result) => {
                if (result.success > 0) {
                  void afterAnyUpload();
                }
              }}
              acceptTypes={{ 'text/csv': ['.csv'] }}
              idleText="Drop bank statement CSVs here, or click to browse"
              subtitleText="CSV files only — drop multiple for bulk import"
            />
          </div>
        </UploadRow>

        {loading ? (
          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            Loading...
          </Typography>
        ) : statements.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              No statements yet. Upload PDFs or CSVs above to get started.
            </Typography>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedStatements.map((s) => {
              const isError = s.status === 'parse_error';
              const needsPassword = s.status === 'password_needed';
              const sourceLabel = s.source === 'BANK' ? 'BANK' : 'CC';
              const bankConfig = bankRowMeta(s);

              const warnBorder = isError || needsPassword;

              return (
                <StatementListRow key={s.id} $warn={warnBorder}>
                  {needsPassword ? (
                    <Row style={statementBodyRowStyle}>
                      <Column style={statementLeftColStyle}>
                        <Row style={statementTitleRowStyle}>
                          <Typography
                            as="span"
                            fontType={FontType.BODY}
                            fontSize={10}
                            fontWeight={FontWeights.BOLD}
                            color={sourceLabel === 'BANK' ? colorPalette.info[500] : colorPalette.rss[500]}
                            style={{
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: sourceLabel === 'BANK' ? 'rgba(59,130,246,0.15)' : 'rgba(255,135,68,0.15)',
                            }}
                          >
                            {sourceLabel}
                          </Typography>
                          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                            {bankConfig.name}
                            {s.cardLast4 ? ` …${s.cardLast4}` : ''}
                          </Typography>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'rgba(255,135,68,0.15)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Lock size={11} />
                            <Typography
                              as="span"
                              fontType={FontType.BODY}
                              fontSize={11}
                              fontWeight={FontWeights.SEMI_BOLD}
                              color={colorPalette.rss[500]}
                            >
                              Password required
                            </Typography>
                          </span>
                        </Row>
                        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color={colorPalette.rss[500]}>
                          Enter password for this statement to be processed
                        </Typography>
                        <InputField
                          colorMode="dark"
                          type="password"
                          placeholder="Statement password"
                          value={passwordInputs[s.id] ?? ''}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setPasswordInputs((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
                            e.key === 'Enter' && handlePasswordSubmit(s.id)
                          }
                          style={{
                            width: '70%',
                            maxWidth: 420,
                            backgroundColor: colorPalette.black[100],
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 0,
                            padding: '6px 12px',
                            fontSize: 14,
                            color: '#ffffff',
                          }}
                        />
                      </Column>
                      <Column style={statementRightColPasswordStyle}>
                        <Row style={statementButtonRowStyle}>
                          <ButtonWithIcon
                            icon={Trash2}
                            variant="secondary"
                            kind="elevated"
                            size="small"
                            colorMode="dark"
                            onClick={() => void removeStatementWithoutConfirm(s.id)}
                            disabled={!!actioning}
                            justifyContent="center"
                            gap={4}
                            style={{ color: mainColors.red, borderColor: 'rgba(238,77,55,0.4)' }}
                          >
                            Remove
                          </ButtonWithIcon>
                          <Button
                            variant="primary"
                            kind="elevated"
                            size="small"
                            colorMode="dark"
                            onClick={() => handlePasswordSubmit(s.id)}
                            disabled={!!actioning || !(passwordInputs[s.id] ?? '').trim()}
                          >
                            Unlock
                          </Button>
                        </Row>
                        {statementPathLine(s)}
                      </Column>
                    </Row>
                  ) : isError ? (
                    <Row style={statementBodyRowStyle}>
                      <Column style={statementLeftColStyle}>
                        <Row style={statementTitleRowStyle}>
                          <Typography
                            as="span"
                            fontType={FontType.BODY}
                            fontSize={10}
                            fontWeight={FontWeights.BOLD}
                            color={sourceLabel === 'BANK' ? colorPalette.info[500] : colorPalette.rss[500]}
                            style={{
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: sourceLabel === 'BANK' ? 'rgba(59,130,246,0.15)' : 'rgba(255,135,68,0.15)',
                            }}
                          >
                            {sourceLabel}
                          </Typography>
                          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                            {bankConfig.name}
                            {s.cardLast4 ? ` …${s.cardLast4}` : ''}
                          </Typography>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'rgba(229,161,0,0.15)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <AlertTriangle size={11} />
                            <Typography
                              as="span"
                              fontType={FontType.BODY}
                              fontSize={11}
                              fontWeight={FontWeights.SEMI_BOLD}
                              color={colorPalette.warning[500]}
                            >
                              Parse error
                            </Typography>
                          </span>
                        </Row>
                        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(229,161,0,0.85)">
                          {s.statusMessage?.trim() ||
                            'Could not extract data from this file. Try reparsing or remove and re-upload.'}
                        </Typography>
                      </Column>
                      <Column style={statementRightColStyle}>
                        <Row style={statementButtonRowStyle}>
                          <ButtonWithIcon
                            icon={RefreshCw}
                            variant="primary"
                            kind="elevated"
                            size="small"
                            colorMode="dark"
                            onClick={() => handleReparse(s.id)}
                            disabled={!!actioning}
                            justifyContent="center"
                            gap={4}
                          >
                            Retry
                          </ButtonWithIcon>
                          <ButtonWithIcon
                            icon={Trash2}
                            variant="secondary"
                            kind="elevated"
                            size="small"
                            colorMode="dark"
                            onClick={() => void removeStatementWithoutConfirm(s.id)}
                            disabled={!!actioning}
                            justifyContent="center"
                            gap={4}
                            style={{ color: mainColors.red, borderColor: 'rgba(238,77,55,0.4)' }}
                          >
                            Remove
                          </ButtonWithIcon>
                        </Row>
                        {statementPathLine(s)}
                      </Column>
                    </Row>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        openTransactionsForStatement(s);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        if ((e.target as HTMLElement).closest('button')) return;
                        e.preventDefault();
                        openTransactionsForStatement(s);
                      }}
                      style={{ cursor: 'pointer', borderRadius: 12 }}
                    >
                      <Row style={statementBodyRowStyle}>
                        <Column style={statementLeftColStyle}>
                          <Row style={statementTitleRowStyle}>
                            <Typography
                              as="span"
                              fontType={FontType.BODY}
                              fontSize={10}
                              fontWeight={FontWeights.BOLD}
                              color={sourceLabel === 'BANK' ? colorPalette.info[500] : colorPalette.rss[500]}
                              style={{
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: sourceLabel === 'BANK' ? 'rgba(59,130,246,0.15)' : 'rgba(255,135,68,0.15)',
                              }}
                            >
                              {sourceLabel}
                            </Typography>
                            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                              {bankConfig.name}
                              {s.cardLast4 ? ` …${s.cardLast4}` : ''}
                            </Typography>
                          </Row>
                          {periodLine(s)}
                          {transactionCountLine(s.transactionCount)}
                        </Column>
                        <Column style={statementRightColStyle}>
                          <Row style={statementButtonRowStyle}>
                            <ButtonWithIcon
                              icon={RefreshCw}
                              variant="primary"
                              kind="elevated"
                              size="small"
                              colorMode="dark"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleReparse(s.id);
                              }}
                              disabled={!!actioning}
                              justifyContent="center"
                              gap={4}
                            >
                              Refresh statement
                            </ButtonWithIcon>
                            <ButtonWithIcon
                              icon={Trash2}
                              variant="secondary"
                              kind="elevated"
                              size="small"
                              colorMode="dark"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(s.id);
                              }}
                              disabled={!!actioning}
                              justifyContent="center"
                              gap={4}
                              style={{ color: mainColors.red, borderColor: 'rgba(238,77,55,0.4)' }}
                            >
                              Remove
                            </ButtonWithIcon>
                          </Row>
                          {statementPathLine(s)}
                        </Column>
                      </Row>
                    </div>
                  )}
                </StatementListRow>
              );
            })}
          </div>
        )}
      </Content>
      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Delete Statement"
        message="Delete this statement and all its transactions? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={executeRemove}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        variant="bankStatements"
        availableBanks={availableBanks}
        bankStatementFilters={stmtFilters}
        onApplyBankStatements={(f) => setStmtFilters(f)}
      />
    </PageLayout>
  );
}
