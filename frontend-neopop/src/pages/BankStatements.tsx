import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { StatUpload } from '@/components/StatUpload';
import { Button, Typography, InputField } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import {
  getStatements,
  deleteStatement,
  reparseStatement,
  uploadStatement,
  uploadStatementsBulk,
  retryWithPassword,
} from '@/lib/api';
import type { Statement } from '@/lib/types';
import { BANK_CONFIG } from '@/lib/types';
import { toast } from '@/components/Toast';
import { Trash2, RefreshCw, AlertTriangle, Lock, Landmark } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import styled from 'styled-components';

const PageLayout = styled.div`
  min-height: 100vh;
  background-color: ${mainColors.black};
`;

const Content = styled.main`
  padding: 32px 24px;
  max-width: 900px;
  margin: 0 auto;
`;

export function BankStatements() {
  const navigate = useNavigate();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});

  const fetchStatements = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStatements('BANK');
      setStatements(data);
    } catch {
      toast.error('Failed to load bank statements');
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatements();
  }, [fetchStatements]);

  const fmt = (d: string) => {
    if (!d) return '—';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleUpload = async (file: File, password?: string) => {
    const loadingId = toast.loading('Processing bank statement...');
    try {
      const result = await uploadStatement(file, undefined, password, 'BANK');
      toast.dismiss(loadingId);

      if (result.status === 'success') {
        toast.success(
          `${result.count ?? 0} transactions imported from ${(result.bank ?? '').toUpperCase()} bank statement`
        );
        await fetchStatements();
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

  const handleBulkUpload = async (files: File[]) => {
    const loadingId = toast.loading(`Processing ${files.length} bank statements...`);
    try {
      const result = await uploadStatementsBulk(files, undefined, undefined, 'BANK');
      toast.dismiss(loadingId);

      if (result.success > 0) {
        toast.success(`${result.success} of ${result.total} bank statements imported`);
        await fetchStatements();
      }
      if (result.success === 0) {
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

  return (
    <PageLayout>
      <Navbar activeTab="bank-statements" onTabChange={(tab) => navigate(`/${tab}`)} />
      <Content>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Landmark size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={22} fontWeight={FontWeights.BOLD} color={mainColors.white}>
              Bank Statements
            </Typography>
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <StatUpload
            onUpload={handleUpload}
            onBulkUpload={handleBulkUpload}
            acceptTypes={{ 'text/csv': ['.csv'] }}
            idleText="Drop bank statement CSVs here, or click to browse"
            subtitleText="CSV files only — drop multiple files for bulk import"
          />
        </div>

        {loading ? (
          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
            Loading...
          </Typography>
        ) : statements.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.6)">
              No bank statements imported yet. Drop your CSV files above to get started.
            </Typography>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {statements.map((s) => {
              const isError = s.status === 'parse_error';
              const needsPassword = s.status === 'password_needed';
              const bankConfig = BANK_CONFIG[s.bank] ?? { name: s.bank.toUpperCase(), color: '#6B7280' };

              return (
                <div
                  key={s.id}
                  style={{
                    padding: '14px 16px',
                    border: isError || needsPassword
                      ? '1px solid rgba(229,161,0,0.4)'
                      : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    background: isError || needsPassword ? 'rgba(229,161,0,0.04)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            backgroundColor: `${bankConfig.color}30`,
                            fontSize: 13,
                            fontWeight: 700,
                            color: bankConfig.color,
                          }}
                        >
                          {bankConfig.name.charAt(0)}
                        </span>
                        <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                          {bankConfig.name}
                          {s.cardLast4 ? ` ...${s.cardLast4}` : ''}
                        </Typography>
                        {isError && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(229,161,0,0.15)' }}>
                            <AlertTriangle size={11} />
                            <Typography as="span" fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.SEMI_BOLD} color={colorPalette.warning[500]}>
                              Parse Error
                            </Typography>
                          </span>
                        )}
                        {needsPassword && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,135,68,0.15)' }}>
                            <Lock size={11} />
                            <Typography as="span" fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.SEMI_BOLD} color={colorPalette.rss[500]}>
                              Password Required
                            </Typography>
                          </span>
                        )}
                      </div>
                      {needsPassword ? (
                        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color={colorPalette.rss[500]}>
                          Enter password for this statement to be processed
                        </Typography>
                      ) : isError ? (
                        <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(229,161,0,0.7)">
                          Could not extract data. Try reparsing.
                        </Typography>
                      ) : (
                        <>
                          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                            Period: {fmt(s.periodStart)} – {fmt(s.periodEnd)}
                          </Typography>
                          <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                            {s.transactionCount} transactions
                          </Typography>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {!needsPassword && (
                        <Button variant="primary" kind="elevated" size="small" colorMode="dark" onClick={() => handleReparse(s.id)} disabled={!!actioning}>
                          <RefreshCw size={14} style={{ marginRight: 4 }} />
                          {isError ? 'Retry' : 'Refresh'}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        kind="elevated"
                        size="small"
                        colorMode="dark"
                        onClick={() => setConfirmDeleteId(s.id)}
                        disabled={!!actioning}
                        style={{ color: mainColors.red, borderColor: 'rgba(238,77,55,0.4)' }}
                      >
                        <Trash2 size={14} style={{ marginRight: 4 }} />
                        Remove
                      </Button>
                    </div>
                  </div>
                  {needsPassword && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <InputField
                        colorMode="dark"
                        type="password"
                        placeholder="Statement password"
                        value={passwordInputs[s.id] ?? ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setPasswordInputs((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) =>
                          e.key === 'Enter' && handlePasswordSubmit(s.id)
                        }
                        style={{
                          flex: 1,
                          backgroundColor: colorPalette.black[100],
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 0,
                          padding: '6px 12px',
                          fontSize: 14,
                          color: '#ffffff',
                        }}
                      />
                      <Button variant="primary" kind="elevated" size="small" colorMode="dark" onClick={() => handlePasswordSubmit(s.id)} disabled={!!actioning || !(passwordInputs[s.id] ?? '').trim()}>
                        Unlock
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Content>
      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Delete Statement"
        message="Delete this bank statement and all its transactions? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={executeRemove}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </PageLayout>
  );
}
