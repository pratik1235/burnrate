import { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { StatUpload } from '@/components/StatUpload';
import { FilterModal, type BankStatementFilterValues } from '@/components/FilterModal';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import { SelectDropdown } from '@/components/SelectDropdown';
import { useFilters } from '@/contexts/FilterContext';
import { useCards } from '@/hooks/useApi';
import { getBankAccountKeys } from '@/lib/api';
import { Button, Typography, InputField, Row, Column, SearchBar } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import {
  getStatements,
  type GetStatementsParams,
  deleteStatement,
  reparseStatement,
  openStatementFile,
  uploadStatement,
  uploadStatementsBulk,
  retryWithPassword,
  patchStatementNote,
} from '@/lib/api';
import type { Statement } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/components/Toast';
import { notifyBulkUploadToasts, syntheticBulkUploadFailure } from '@/lib/bulkUploadSummary';
import { Trash2, RefreshCw, AlertTriangle, Lock, SlidersHorizontal, ChevronLeft, ChevronRight, ExternalLink, ChevronDown, StickyNote } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CloseButton } from '@/components/CloseButton';
import { paginateBounds } from '@/lib/pagination';
import { getStatementsScrollY, setStatementsScrollY } from '@/lib/statementsScrollMemory';
import styled from 'styled-components';
import { SelectableElevatedCard, DEFAULT_ELEVATED_CARD_EDGE_COLORS } from '@/components/SelectableElevatedCard';

const PageLayout = styled.div`
  min-height: 100dvh;
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
  alignItems: 'center',
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

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const CompactSearchWrapper = styled.div`
  flex: 1;
  min-width: 200px;
  max-width: 400px;

  input {
    padding: 6px 12px !important;
    height: 0.2em !important;
    font-size: 13px !important;
  }
  > div {
    min-height: 0 !important;
  }
`;

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: '500', label: '500' },
];

/** Lift + soft shadow on hover for clickable (successfully parsed) statement rows. */
const ClickableCardWrapper = styled.div`
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
`;

const statementCardStyle: CSSProperties = {
  padding: '14px 16px',
  width: '100%',
  maxWidth: 'none',
  maxHeight: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  backgroundColor: colorPalette.black[100],
};

const warnEdgeColors = { bottom: colorPalette.warning[500], right: 'rgba(229,161,0,0.45)' };
const successEdgeColors = DEFAULT_ELEVATED_CARD_EDGE_COLORS;

/** Sort keys for the statement list sort control. */
type StatementSortKey = 'default' | 'amount_due_desc' | 'amount_due_asc' | 'due_date_asc' | 'due_date_desc' | 'txn_count_desc' | 'txn_count_asc';

const SORT_OPTIONS: { value: StatementSortKey; label: string }[] = [
  { value: 'default',         label: 'Default' },
  { value: 'amount_due_desc', label: 'Amount Due \u2193' },
  { value: 'amount_due_asc',  label: 'Amount Due \u2191' },
  { value: 'due_date_asc',    label: 'Payment Due Date \u2191' },
  { value: 'due_date_desc',   label: 'Payment Due Date \u2193' },
  { value: 'txn_count_desc',  label: 'Transaction Count \u2193' },
  { value: 'txn_count_asc',   label: 'Transaction Count \u2191' },
];

const SortBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const IconPageBtn = styled.button<{ $disabled?: boolean }>`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: ${(p) => (p.$disabled ? 0.35 : 1)};
  transition: opacity 0.15s ease, border-color 0.15s ease;
  &:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.45);
  }
`;

const ActionIconButton = styled.button<{ $danger?: boolean }>`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${(p) => (p.$danger ? 'rgba(238,77,55,0.2)' : 'rgba(255, 255, 255, 0.1)')};
  border-radius: 10px;
  padding: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  color: ${(p) => (p.$danger ? mainColors.red : '#ffffff')};
  
  &:hover:not(:disabled) {
    background: ${(p) => (p.$danger ? 'rgba(238,77,55,0.15)' : 'rgba(255, 255, 255, 0.15)')};
    border-color: ${(p) => (p.$danger ? 'rgba(238,77,55,0.4)' : 'rgba(255, 255, 255, 0.3)')};
  }
  
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
`;

const NoteIconButton = styled(ActionIconButton)<{ $active: boolean }>`
  opacity: ${(p) => (p.$active ? 1 : 0.42)};
  border-color: ${(p) => (p.$active ? 'rgba(255, 135, 68, 0.42)' : 'rgba(255, 255, 255, 0.09)')};
  color: ${(p) => (p.$active ? colorPalette.rss[500] : 'rgba(255, 255, 255, 0.58)')};
  &:hover:not(:disabled) {
    opacity: 1;
    border-color: ${(p) => (p.$active ? 'rgba(255, 135, 68, 0.55)' : 'rgba(255, 255, 255, 0.26)')};
  }
  &:active:not(:disabled) {
    transform: translateY(1px) scale(0.98);
  }
`;

const NotePopoverSurface = styled.div`
  position: fixed;
  z-index: 3200;
  width: min(320px, calc(100vw - 24px));
  padding: 12px 14px 14px;
  border-radius: 12px;
  background: ${colorPalette.black[100]};
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 16px 48px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(12px);
`;

const NoteTextArea = styled.textarea`
  display: block;
  width: 100%;
  min-height: 88px;
  margin: 0 0 10px;
  padding: 8px 10px;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  resize: vertical;
  outline: none;
  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
  &:focus {
    border-color: rgba(255, 135, 68, 0.55);
    box-shadow: 0 0 0 1px rgba(255, 135, 68, 0.2);
  }
`;

const PathDisplay = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.4;
  text-align: right;
  display: block;
  max-width: 340px;
  cursor: default;
  position: relative;

  .path-full {
    display: none;
  }
  .path-short {
    display: inline;
    word-break: break-all;
  }

  &:hover {
    .path-full {
      display: block;
      position: absolute;
      right: 0;
      top: 120%;
      transform: translateY(-50%);
      white-space: normal;
      word-break: break-all;
      max-width: 50ch;
      width: max-content;
      text-align: left;
      background-color: ${colorPalette.popBlack[300]};
      padding: 4px 8px;
      border-radius: 4px;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.85);
    }
    .path-short {
      visibility: hidden;
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

function statementPathLine(s: Statement, onOpen: (s: Statement) => void) {
  const fullPath = statementDisplayPathForRow(s);
  if (!fullPath) return null;
  const short = truncatedPathDisplay(fullPath);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <PathDisplay aria-label={`Original file path: ${fullPath}`}>
        <span className="path-short">{short}</span>
        <span className="path-full">{fullPath}</span>
      </PathDisplay>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen(s);
        }}
        title="Open file on device"
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colorPalette.rss[500],
          borderRadius: 4,
          transition: 'color 0.2s, background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.backgroundColor = 'rgba(255,135,68,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = colorPalette.rss[500];
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <ExternalLink size={12} />
      </button>
    </div>
  );
}

function bankRowMeta(s: Statement) {
  const cfg = (BANK_CONFIG as Record<string, { name: string; color: string }>)[s.bank] ?? {
    name: s.bank.toUpperCase(),
    color: '#6B7280',
  };
  return cfg;
}

function statementIdCentered(id: string) {
  return (
    <Typography
      fontType={FontType.BODY}
      fontSize={11}
      fontWeight={FontWeights.MEDIUM}
      color="rgba(255,255,255,0.38)"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
        textAlign: 'center',
        letterSpacing: 0.02,
        maxWidth: 220,
        wordBreak: 'break-all',
        lineHeight: 1.3,
      }}
    >
      {id}
    </Typography>
  );
}

export function Statements() {
  const navigate = useNavigate();
  const { setFilters, filters } = useFilters();
  const { refetch: refetchCards } = useCards();
  const [, setBankAccounts] = useState<{ id: string; bank: string; last4: string }[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [totalStatements, setTotalStatements] = useState(0);
  const [totalAmountDue, setTotalAmountDue] = useState<number | null>(null);
  const [totalsByCurrency, setTotalsByCurrency] = useState<{ currency: string; amount: number }[]>([]);
  const [mixedCurrency, setMixedCurrency] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const hasRestoredScroll = useRef(false);
  const lastScrollY = useRef(0);

  // Track scroll position continuously to avoid reading clamped values on unmount
  useEffect(() => {
    const handleScroll = () => {
      lastScrollY.current = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (hasRestoredScroll.current) {
        setStatementsScrollY(lastScrollY.current);
      }
    };
  }, []);

  // Restore scroll position once loading is done
  useLayoutEffect(() => {
    if (!loading && !hasRestoredScroll.current) {
      const savedY = getStatementsScrollY();
      window.scrollTo({ top: savedY, behavior: 'auto' });
      lastScrollY.current = savedY;
      hasRestoredScroll.current = true;
    }
  }, [loading]);

  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const noteAnchorRef = useRef<HTMLButtonElement | null>(null);
  const notePopoverSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [notePopoverStatementId, setNotePopoverStatementId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [notePopoverCoords, setNotePopoverCoords] = useState({ top: 0, left: 0 });
  const [patchingNoteStatementId, setPatchingNoteStatementId] = useState<string | null>(null);
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});
  const [stmtFilters, setStmtFilters] = useState<BankStatementFilterValues>(() => {
    try {
      const saved = localStorage.getItem('statementsFilters');
      if (saved) return JSON.parse(saved) as BankStatementFilterValues;
    } catch {
      // ignore
    }
    return { banks: [] };
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return localStorage.getItem('statementsSearchQuery') || '';
    } catch {
      return '';
    }
  });
  const [searchInputValue, setSearchInputValue] = useState(() => {
    try {
      return localStorage.getItem('statementsSearchQuery') || '';
    } catch {
      return '';
    }
  });
  const [searchClearKey, setSearchClearKey] = useState(0);
  const [searchTooltipVisible, setSearchTooltipVisible] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [sortKey, setSortKey] = useState<StatementSortKey>(() => {
    try {
      const saved = localStorage.getItem('statementsSortKey');
      if (saved) return saved as StatementSortKey;
    } catch {
      // ignore
    }
    return 'default';
  });

  useEffect(() => {
    try {
      localStorage.setItem('statementsSortKey', sortKey);
    } catch {
      // ignore
    }
  }, [sortKey]);

  useEffect(() => {
    try {
      localStorage.setItem('statementsFilters', JSON.stringify(stmtFilters));
    } catch {
      // ignore
    }
  }, [stmtFilters]);

  useEffect(() => {
    try {
      localStorage.setItem('statementsSearchQuery', searchQuery);
    } catch {
      // ignore
    }
  }, [searchQuery]);

  const refreshBankSlugs = useCallback(async () => {
    try {
      const { statements: rows } = await getStatements();
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
    if (stmtFilters.statementIds && stmtFilters.statementIds.length > 0) params.statement_ids = stmtFilters.statementIds.join(',');
      if (stmtFilters.banks.length > 0) params.banks = stmtFilters.banks.join(',');
      if (stmtFilters.from) params.from = stmtFilters.from;
      if (stmtFilters.to) params.to = stmtFilters.to;
      if (stmtFilters.source) params.source = stmtFilters.source;
      if (stmtFilters.parseFailuresOnly) params.parseFailuresOnly = true;
      if (stmtFilters.nonZeroTxnCount) params.nonZeroTxnCount = true;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      
      params.limit = filters.pageSize;
      params.offset = pageIndex * filters.pageSize;
      
      if (sortKey === 'amount_due_desc') {
        params.sortBy = 'amount_due'; params.sortOrder = 'desc';
      } else if (sortKey === 'amount_due_asc') {
        params.sortBy = 'amount_due'; params.sortOrder = 'asc';
      } else if (sortKey === 'due_date_desc') {
        params.sortBy = 'due_date'; params.sortOrder = 'desc';
      } else if (sortKey === 'due_date_asc') {
        params.sortBy = 'due_date'; params.sortOrder = 'asc';
      } else if (sortKey === 'txn_count_desc') {
        params.sortBy = 'txn_count'; params.sortOrder = 'desc';
      } else if (sortKey === 'txn_count_asc') {
        params.sortBy = 'txn_count'; params.sortOrder = 'asc';
      } else {
        params.sortBy = 'default'; params.sortOrder = 'desc';
      }

      const res = await getStatements(params);
      setStatements(res.statements);
      setTotalStatements(res.total);
      setTotalAmountDue(res.totalAmountDue ?? null);
      setTotalsByCurrency(res.totalsByCurrency ?? []);
      setMixedCurrency(res.mixedCurrency ?? false);
    } catch {
      toast.error('Failed to load statements');
      setStatements([]);
      setTotalStatements(0);
      setTotalAmountDue(null);
      setTotalsByCurrency([]);
      setMixedCurrency(false);
    } finally {
      setLoading(false);
    }
  }, [stmtFilters, sortKey, pageIndex, searchQuery, filters.pageSize]);

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
      setFilters({
        statementIds: [s.id],
        selectedCards: [],
        selectedBankAccounts: [],
        selectedCategories: [],
        selectedTags: [],
        dateRange: {},
        amountRange: {},
        direction: 'all',
        source: 'all',
      });
      navigate('/transactions');
    },
    [navigate, setFilters],
  );

  const fmt = (d: string) => {
    if (!d) return '—';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const afterAnyUpload = async () => {
    await refreshBankSlugs();
    await fetchStatements();
    await refetchCards();
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
        await refetchCards();
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
        await refetchCards();
      } else {
        toast.error(result.message ?? 'Could not unlock with this password');
      }
    } catch {
      toast.error('Failed to unlock statement');
    } finally {
      setActioning(null);
    }
  };

  const handleOpenFile = async (s: Statement) => {
    try {
      await openStatementFile(s.id);
    } catch {
      toast.error('Failed to open file');
    }
  };

  const closeNotePopover = useCallback(() => {
    setNotePopoverStatementId(null);
    setNoteDraft('');
  }, []);

  const updateNotePopoverPosition = useCallback(() => {
    const el = noteAnchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelHalf = Math.min(160, (Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 24 : 320)) / 2);
    let left = r.left + r.width / 2;
    const margin = 12;
    left = Math.max(panelHalf + margin, Math.min(left, (typeof window !== 'undefined' ? window.innerWidth : left) - panelHalf - margin));
    setNotePopoverCoords({ top: r.bottom + 8, left });
  }, []);

  useLayoutEffect(() => {
    if (!notePopoverStatementId) return;
    updateNotePopoverPosition();
  }, [notePopoverStatementId, updateNotePopoverPosition]);

  useEffect(() => {
    if (!notePopoverStatementId) return;
    const onResize = () => updateNotePopoverPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [notePopoverStatementId, updateNotePopoverPosition]);

  useEffect(() => {
    if (!notePopoverStatementId) return;
    const onPointerDown = (ev: globalThis.MouseEvent) => {
      const t = ev.target as Node;
      if (notePopoverSurfaceRef.current?.contains(t)) return;
      if (noteAnchorRef.current?.contains(t)) return;
      closeNotePopover();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [notePopoverStatementId, closeNotePopover]);

  useEffect(() => {
    if (!notePopoverStatementId) return;
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') closeNotePopover();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [notePopoverStatementId, closeNotePopover]);

  const openStatementNotePopover = useCallback((e: MouseEvent, s: Statement) => {
    e.stopPropagation();
    setNotePopoverStatementId(s.id);
    setNoteDraft(s.note ?? '');
  }, []);

  const handleSaveStatementNote = useCallback(async () => {
    if (!notePopoverStatementId) return;
    const id = notePopoverStatementId;
    setPatchingNoteStatementId(id);
    try {
      const { note } = await patchStatementNote(id, noteDraft);
      setStatements((prev) => prev.map((x) => (x.id === id ? { ...x, note } : x)));
      toast.success('Note saved');
      closeNotePopover();
    } catch {
      toast.error('Could not save note');
    } finally {
      setPatchingNoteStatementId(null);
    }
  }, [notePopoverStatementId, noteDraft, closeNotePopover]);

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

  const pagination = useMemo(
    () => paginateBounds(pageIndex, totalStatements, filters.pageSize),
    [pageIndex, totalStatements, filters.pageSize],
  );

  const pageStatements = statements;
  const totalFiltered = totalStatements;

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery, sortKey, stmtFilters.banks, stmtFilters.from, stmtFilters.to, stmtFilters.source, stmtFilters.parseFailuresOnly, stmtFilters.nonZeroTxnCount]);

  useEffect(() => {
    if (pagination.displayPageIndex !== pageIndex) {
      setPageIndex(pagination.displayPageIndex);
    }
  }, [pagination.displayPageIndex, pageIndex]);

  const filterActiveCount =
    (stmtFilters.statementIds?.length ?? 0) +
    stmtFilters.banks.length +
    (stmtFilters.from ? 1 : 0) +
    (stmtFilters.to ? 1 : 0) +
    (stmtFilters.source ? 1 : 0) +
    (stmtFilters.parseFailuresOnly ? 1 : 0) +
    (stmtFilters.nonZeroTxnCount ? 1 : 0);

  return (
    <PageLayout>
      <Navbar activeTab="statements" onTabChange={(tab) => navigate(`/${tab}`)} />
      <Content>
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

        <ActionBar>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ButtonWithIcon
              icon={SlidersHorizontal}
              variant={
                stmtFilters.banks.length > 0 ||
                stmtFilters.from ||
                stmtFilters.to ||
                stmtFilters.source ||
                stmtFilters.parseFailuresOnly
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
              {filterActiveCount > 0 ? ` (${filterActiveCount})` : ''}
            </ButtonWithIcon>
            {filterActiveCount > 0 && (
              <CloseButton onClick={() => setStmtFilters({ banks: [] })} variant="inline" />
            )}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginLeft: 'auto',
              flex: '1 1 240px',
              justifyContent: 'flex-end',
              maxWidth: 480,
              position: 'relative',
            }}
            onMouseEnter={() => setSearchTooltipVisible(true)}
            onMouseLeave={() => setSearchTooltipVisible(false)}
          >
            {searchTooltipVisible && !searchQuery.trim() && (
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
                  maxWidth: 280,
                }}
              >
                <Typography
                  fontType={FontType.BODY}
                  fontSize={11}
                  fontWeight={FontWeights.REGULAR}
                  color="rgba(255,255,255,0.65)"
                >
                  Search by bank, card digits, period, file name, or path
                </Typography>
              </div>
            )}
            <CompactSearchWrapper>
              <SearchBar
                key={searchClearKey}
                placeholder="Search statements..."
                colorMode={searchQuery.trim() ? 'light' : 'dark'}
                handleSearchInput={(value: string) => setSearchInputValue(value)}
                onSubmit={() => setSearchQuery(searchInputValue)}
                colorConfig={{
                  border: 'rgba(255,255,255,0.2)',
                  activeBorder: '#ffffff',
                  backgroundColor: searchQuery.trim() ? mainColors.white : 'rgba(255,255,255,0.05)',
                  closeIcon: colorPalette.rss[500],
                }}
              />
            </CompactSearchWrapper>
            {searchQuery.trim() ? (
              <CloseButton
                onClick={() => {
                  setSearchQuery('');
                  setSearchInputValue('');
                  setSearchClearKey((k) => k + 1);
                }}
                variant="inline"
              />
            ) : null}
          </div>
        </ActionBar>

        {loading ? (
          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            Loading...
          </Typography>
        ) : statements.length === 0 && filterActiveCount === 0 && !searchQuery.trim() ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              No statements yet. Upload PDFs or CSVs above to get started.
            </Typography>
          </div>
        ) : statements.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Typography
              fontType={FontType.BODY}
              fontSize={16}
              fontWeight={FontWeights.REGULAR}
              color="rgba(255,255,255,0.6)"
              style={{ marginBottom: 16 }}
            >
              No statements match your search or filters. Try adjusting them or clear the search.
            </Typography>
            <Button
              variant="secondary"
              kind="elevated"
              size="small"
              colorMode="dark"
              onClick={() => {
                setSearchQuery('');
                setSearchInputValue('');
                setSearchClearKey((k) => k + 1);
                setStmtFilters({ banks: [] });
              }}
            >
              Clear filters and search
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Header>
              <div>
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                  {totalFiltered} statement{totalFiltered !== 1 ? 's' : ''}
                </Typography>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {mixedCurrency && totalsByCurrency.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
                      <Typography fontType={FontType.BODY} fontSize={20} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                        {totalsByCurrency.map(t => formatCurrency(t.amount, t.currency)).join(' · ')}
                      </Typography>
                      <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.55)">
                        total due (multiple currencies)
                      </Typography>
                    </div>
                  ) : (
                    <Typography fontType={FontType.BODY} fontSize={20} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                      {formatCurrency(totalAmountDue ?? 0)} total due
                    </Typography>
                  )}
                </div>
              </div>
            </Header>
            <SortBar>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.45)">
                  Sort by
                </Typography>
                <SelectDropdown
                  options={SORT_OPTIONS}
                  value={sortKey}
                  onChange={(v) => setSortKey(v as StatementSortKey)}
                  colorMode="dark"
                  menuMount="portal"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.45)">
                  Page {pagination.displayPageIndex + 1} of {pagination.pageCount}
                  {' · '}
                </Typography>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <SelectDropdown
                    options={PAGE_SIZE_OPTIONS}
                    value={String(filters.pageSize)}
                    onChange={(v) => {
                      setFilters({ pageSize: Number(v) });
                      setPageIndex(0);
                    }}
                    colorMode="dark"
                    menuMount="portal"
                    customTrigger={
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          cursor: 'pointer',
                        }}
                      >
                        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.MEDIUM} color="#ffffff">
                          {filters.pageSize}
                        </Typography>
                        <ChevronDown size={12} color="rgba(255, 255, 255, 0.5)" />
                      </div>
                    }
                  />
                  <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.45)">
                    statements on this page
                  </Typography>
                </div>
                <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.45)">
                  {' · '}
                  {totalFiltered === 1 ? '1 total' : `${totalFiltered} total`}
                </Typography>
                <IconPageBtn
                  $disabled={pagination.displayPageIndex <= 0}
                  disabled={pagination.displayPageIndex <= 0}
                  aria-label="Previous page"
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={15} color="#ffffff" />
                </IconPageBtn>
                <IconPageBtn
                  $disabled={pagination.displayPageIndex >= pagination.pageCount - 1}
                  disabled={pagination.displayPageIndex >= pagination.pageCount - 1}
                  aria-label="Next page"
                  onClick={() => setPageIndex((p) => Math.min(pagination.pageCount - 1, p + 1))}
                >
                  <ChevronRight size={15} color="#ffffff" />
                </IconPageBtn>
              </div>
            </SortBar>
            {pageStatements.map((s) => {
              const isError = s.status === 'parse_error';
              const needsPassword = s.status === 'password_needed';
              const sourceLabel = s.source === 'BANK' ? 'BANK' : 'CC';
              const bankConfig = bankRowMeta(s);

              const warnBorder = isError || needsPassword;
              const cardEdge = warnBorder ? warnEdgeColors : successEdgeColors;

              const card = (
                <SelectableElevatedCard key={warnBorder ? s.id : undefined} edgeColors={cardEdge} style={statementCardStyle}>
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
                          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) =>
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
                        <Column style={{ alignItems: 'center', gap: 6, width: '100%' }}>
                          {statementIdCentered(s.id)}
                          <Row style={{ ...statementButtonRowStyle, justifyContent: 'center', gap: 10 }}>
                            <NoteIconButton
                              type="button"
                              aria-label={
                                (s.note ?? '').trim()
                                  ? 'Edit statement note'
                                  : 'Add a note to this statement'
                              }
                              title={(s.note ?? '').trim() ? 'Edit note' : 'Add a note'}
                              $active={(s.note ?? '').trim().length > 0}
                              disabled={!!actioning}
                              ref={notePopoverStatementId === s.id ? noteAnchorRef : undefined}
                              onClick={(e: MouseEvent) => openStatementNotePopover(e, s)}
                            >
                              <StickyNote size={14} strokeWidth={2} aria-hidden />
                            </NoteIconButton>
                            <ActionIconButton
                              onClick={() => void removeStatementWithoutConfirm(s.id)}
                              disabled={!!actioning}
                              $danger
                              title="Remove"
                            >
                              <Trash2 size={14} />
                            </ActionIconButton>
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
                        </Column>
                        {statementPathLine(s, handleOpenFile)}
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
                      <Column style={{ alignItems: 'center', gap: 6, padding: '12px 14px' }}>
                        {statementIdCentered(s.id)}
                        <Row style={{ gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <NoteIconButton
                            type="button"
                            aria-label={
                              (s.note ?? '').trim()
                                ? 'Edit statement note'
                                : 'Add a note to this statement'
                            }
                            title={(s.note ?? '').trim() ? 'Edit note' : 'Add a note'}
                            $active={(s.note ?? '').trim().length > 0}
                            disabled={!!actioning}
                            ref={notePopoverStatementId === s.id ? noteAnchorRef : undefined}
                            onClick={(e: MouseEvent) => openStatementNotePopover(e, s)}
                          >
                            <StickyNote size={14} strokeWidth={2} aria-hidden />
                          </NoteIconButton>
                          <ActionIconButton
                            onClick={(e: MouseEvent) => {
                              e.stopPropagation();
                              void handleReparse(s.id);
                            }}
                            disabled={!!actioning}
                            title="Retry"
                          >
                            <RefreshCw size={14} />
                          </ActionIconButton>
                          <ActionIconButton
                            onClick={(e: MouseEvent) => {
                              e.stopPropagation();
                              void removeStatementWithoutConfirm(s.id);
                            }}
                            disabled={!!actioning}
                            $danger
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </ActionIconButton>
                        </Row>
                      </Column>
                      <Column style={{ ...statementRightColStyle, alignItems: 'flex-end', justifyContent: 'flex-end', flex: '1 1 260px', minWidth: 120 }}>
                        {statementPathLine(s, handleOpenFile)}
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
                      <Row style={{ ...statementBodyRowStyle, pointerEvents: 'none' }}>
                        <Column style={statementLeftColStyle}>
                          <div style={{ pointerEvents: 'auto', cursor: 'text', width: 'fit-content' }} onClick={(e) => e.stopPropagation()}>
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
                          </div>
                          <div style={{ pointerEvents: 'auto', cursor: 'text', width: 'fit-content' }} onClick={(e) => e.stopPropagation()}>
                            {periodLine(s)}
                          </div>
                          <div style={{ pointerEvents: 'auto', cursor: 'text', width: 'fit-content' }} onClick={(e) => e.stopPropagation()}>
                            {transactionCountLine(s.transactionCount)}
                          </div>
                        </Column>
                        <Column style={{ alignItems: 'center', gap: 6, padding: '12px 14px', pointerEvents: 'auto' }}>
                          {statementIdCentered(s.id)}
                          <Row style={{ gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                            <NoteIconButton
                              type="button"
                              aria-label={
                                (s.note ?? '').trim()
                                  ? 'Edit statement note'
                                  : 'Add a note to this statement'
                              }
                              title={(s.note ?? '').trim() ? 'Edit note' : 'Add a note'}
                              $active={(s.note ?? '').trim().length > 0}
                              disabled={!!actioning}
                              ref={notePopoverStatementId === s.id ? noteAnchorRef : undefined}
                              onClick={(e: MouseEvent) => openStatementNotePopover(e, s)}
                            >
                              <StickyNote size={14} strokeWidth={2} aria-hidden />
                            </NoteIconButton>
                            <ActionIconButton
                              onClick={(e: MouseEvent) => {
                                e.stopPropagation();
                                void handleReparse(s.id);
                              }}
                              disabled={!!actioning}
                              title="Refresh statement"
                            >
                              <RefreshCw size={14} />
                            </ActionIconButton>
                            <ActionIconButton
                              onClick={(e: MouseEvent) => {
                                e.stopPropagation();
                                setConfirmDeleteId(s.id);
                              }}
                              disabled={!!actioning}
                              $danger
                              title="Remove statement"
                            >
                              <Trash2 size={14} />
                            </ActionIconButton>
                          </Row>
                        </Column>
                        <Column style={{ ...statementRightColStyle, alignItems: 'flex-end', justifyContent: 'flex-start', flex: '1 1 260px', minWidth: 120 }}>
                          {s.totalAmountDue != null && (
                            <div style={{ textAlign: 'right', marginTop: -9, pointerEvents: 'auto', cursor: 'text' }} onClick={(e) => e.stopPropagation()}>
                              <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.5)">
                                Amount Due
                              </Typography>
                              <Typography fontType={FontType.BODY} fontSize={15} fontWeight={FontWeights.BOLD} color={colorPalette.rss[500]}>
                                {formatCurrency(s.totalAmountDue, s.currency ?? 'INR')}
                              </Typography>
                            </div>
                          )}
                          <div style={{ pointerEvents: 'auto', cursor: 'text' }} onClick={(e) => e.stopPropagation()}>
                            {statementPathLine(s, handleOpenFile)}
                          </div>
                        </Column>
                      </Row>
                    </div>
                  )}
                </SelectableElevatedCard>
              );

              return warnBorder ? (
                <div key={s.id}>{card}</div>
              ) : (
                <ClickableCardWrapper key={s.id}>{card}</ClickableCardWrapper>
              );
            })}
          </div>
        )}
      </Content>
      {notePopoverStatementId !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <NotePopoverSurface
            ref={notePopoverSurfaceRef}
            role="dialog"
            aria-label="Statement note"
            style={{
              top: notePopoverCoords.top,
              left: notePopoverCoords.left,
              transform: 'translateX(-50%)',
            }}
          >
            <Typography
              fontType={FontType.BODY}
              fontSize={11}
              fontWeight={FontWeights.SEMI_BOLD}
              color="rgba(255,255,255,0.55)"
              style={{ marginBottom: 8, display: 'block' }}
            >
              Statement note
            </Typography>
            <NoteTextArea
              placeholder="Add a note to this statement"
              value={noteDraft}
              maxLength={10_000}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNoteDraft(e.target.value)}
              aria-label="Add a note to this statement"
            />
            <Row style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => closeNotePopover()}
                disabled={patchingNoteStatementId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                kind="elevated"
                size="small"
                colorMode="dark"
                onClick={() => void handleSaveStatementNote()}
                disabled={patchingNoteStatementId !== null}
              >
                Save
              </Button>
            </Row>
          </NotePopoverSurface>,
          document.body,
        )}
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
