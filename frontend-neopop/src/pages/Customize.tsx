import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import { Navbar } from '@/components/Navbar';
import { Button, Typography, Tag, InputField, Row, Column } from '@cred/neopop-web/lib/components';
import {
  SelectableElevatedCard as ElevatedCard,
  TRANSPARENT_ELEVATED_CARD_EDGES,
} from '@/components/SelectableElevatedCard';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import {
  getStatements,
  deleteStatement,
  reparseStatement,
  reparseAllStatements,
  retryWithPassword,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategoryById,
  getTagDefinitions,
  createTagDefinition,
  deleteTagDefinition,
  getGmailStatus,
  startGmailAuth,
  disconnectGmail,
} from '@/lib/api';
import type { Statement } from '@/lib/types';
import type { CategoryResponse, TagDefinitionResponse, GmailStatusResponse } from '@/lib/api';
import { toast } from '@/components/Toast';
import { RefreshCw, Palette, Trash2, Tag as TagIcon, Check, AlertTriangle, MessageSquarePlus, Lock, Mail, Lightbulb, Calendar } from 'lucide-react';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { CloseButton } from '@/components/CloseButton';
import { TrashIconButton } from '@/components/TrashIconButton';
import { PlusIconButton } from '@/components/PlusIconButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { InsightsSettingsModal } from '@/components/InsightsSettingsModal';
import { PaymentRemindersModal } from '@/components/PaymentRemindersModal';
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

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto auto;
  gap: 24px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const FeatureCard = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.12);
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
`;

const TagsWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const TagWithDelete = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const CategoryTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  th, td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  th {
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  tbody tr {
    background: transparent;
  }

  tbody tr td input:disabled {
    opacity: 0.7;
  }
`;

const inputStyle = {
  backgroundColor: colorPalette.black[100],
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  color: '#ffffff',
  outline: 'none' as const,
  width: '100%',
  colorScheme: 'dark' as const,
};

export function DefineTagsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tags, setTags] = useState<TagDefinitionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getTagDefinitions()
      .then((data) => {
        if (!cancelled) setTags(data);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load tags');
          setTags([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const handleAdd = async () => {
    const trimmed = newTagName.trim().slice(0, 12);
    if (!trimmed) {
      toast.error('Tag name is required');
      return;
    }
    if (tags.length >= 20) {
      toast.error('Maximum 20 tags allowed');
      return;
    }
    try {
      const tag = await createTagDefinition(trimmed);
      setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName('');
      toast.success('Tag added');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add tag';
      toast.error(msg);
    }
  };

  const handleDelete = async (tagId: string) => {
    try {
      await deleteTagDefinition(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      toast.success('Tag removed');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete tag';
      toast.error(msg);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay>
      <ModalBackdrop onClick={onClose} />
      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        edgeColors={TRANSPARENT_ELEVATED_CARD_EDGES}
        style={{
          padding: 0,
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'block',
          backgroundColor: 'transparent',
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
            Define Tags
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>

        <div style={{ padding: 20 }}>
          <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.7)" style={{ marginBottom: 16 }}>
            Define up to 20 tags. Each tag can be at most 12 characters long. A transaction can have at most 3 tags.
          </Typography>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <InputField
              colorMode="dark"
              value={newTagName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTagName(e.target.value.slice(0, 12))}
              placeholder="Tag name (max 12 chars)"
              style={{ flex: 1, ...inputStyle, borderRadius: 0, padding: '0px 0px 0px 10px', fontSize: 16, fontWeight: FontWeights.MEDIUM, backgroundColor: colorPalette.black[100] }}
            />
            <Button
              variant="secondary"
              kind="flat"
              size="small"
              colorMode="dark"
              onClick={handleAdd}
              disabled={tags.length >= 20 || !newTagName.trim()}
            >
              Add Tag
            </Button>
          </div>

          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white} style={{ marginBottom: 12 }}>
            Tags ({tags.length}/20)
          </Typography>

          {loading ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Loading...
            </Typography>
          ) : (
            <TagsWrap>
              {tags.map((t) => (
                <TagWithDelete key={t.id}>
                  <Tag colorMode="dark" type="warning">
                    {t.name}
                  </Tag>
                  <TrashIconButton aria-label={`Remove tag ${t.name}`} onClick={() => handleDelete(t.id)} />
                </TagWithDelete>
              ))}
            </TagsWrap>
          )}
        </div>
      </ElevatedCard>
    </ModalOverlay>
  );
}

export function ReparseRemoveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [reparseAllRunning, setReparseAllRunning] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getStatements()
      .then((data) => {
        if (!cancelled) setStatements(data);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load statements');
          setStatements([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const fmt = (d: string) => {
    if (!d) return '—';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const extractErrorMsg = (e: unknown, fallback: string): string => {
    if (e && typeof e === 'object' && 'response' in e) {
      const resp = (e as { response?: { data?: { detail?: string } } }).response;
      if (resp?.data?.detail) return resp.data.detail;
    }
    if (e instanceof Error) return e.message;
    return fallback;
  };

  const handleReparseAll = async () => {
    setReparseAllRunning(true);
    try {
      const result = await reparseAllStatements();
      toast.success(`Reparse complete: ${result.success} succeeded, ${result.failed} failed, ${result.skipped} skipped`);
      const list = await getStatements();
      setStatements(list);
    } catch (e) {
      toast.error(extractErrorMsg(e, 'Reparse all failed'));
    } finally {
      setReparseAllRunning(false);
    }
  };

  const handleReparse = async (id: string) => {
    setActioning(id);
    try {
      const result = await reparseStatement(id);
      if (result.status === 'success') {
        toast.success(`Reparsed ${result.count ?? 0} transactions`);
        const list = await getStatements();
        setStatements(list);
      } else {
        toast.error('Reparse failed');
      }
    } catch (e) {
      toast.error(extractErrorMsg(e, 'Reparse failed'));
    } finally {
      setActioning(null);
    }
  };

  const handleRemove = async (id: string) => {
    setConfirmDeleteId(id);
  };

  const executeRemove = async () => {
    if (!confirmDeleteId) return;
    setActioning(confirmDeleteId);
    try {
      await deleteStatement(confirmDeleteId);
      toast.success('Statement deleted');
      setStatements((prev) => prev.filter((s) => s.id !== confirmDeleteId));
    } catch (e) {
      toast.error(extractErrorMsg(e, 'Delete failed'));
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
        setPasswordInputs((prev) => { const next = { ...prev }; delete next[stmtId]; return next; });
        const list = await getStatements();
        setStatements(list);
      } else {
        toast.error(result.message ?? 'Could not unlock with this password');
      }
    } catch {
      toast.error('Failed to unlock statement');
    } finally {
      setActioning(null);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay>
      <ModalBackdrop onClick={onClose} />
      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        edgeColors={TRANSPARENT_ELEVATED_CARD_EDGES}
        style={{
          padding: 0,
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          maxHeight: '80vh',
          display: 'block',
          backgroundColor: 'transparent',
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
            Reparse / Remove Statements
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>

        <div style={{ padding: 20 }}>
          <ButtonWithIcon
            icon={RefreshCw}
            variant="secondary"
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={handleReparseAll}
            disabled={reparseAllRunning || loading || statements.length === 0}
            style={{ marginBottom: 20 }}
            gap={6}
            justifyContent="center"
            iconProps={{ className: reparseAllRunning ? 'animate-spin' : undefined }}
          >
            {reparseAllRunning ? 'Reparsing...' : 'Reparse All'}
          </ButtonWithIcon>

          {loading ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Loading...
            </Typography>
          ) : statements.length === 0 ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              No statements imported yet.
            </Typography>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...statements]
                .sort((a, b) => {
                  const priority = (s: Statement) => s.status === 'password_needed' ? 0 : s.status === 'parse_error' ? 1 : 2;
                  return priority(a) - priority(b);
                })
                .map((s) => {
                  const isError = s.status === 'parse_error';
                  const needsPassword = s.status === 'password_needed';
                  const sourceLabel = s.source === 'BANK' ? 'BANK' : 'CC';
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
                        <Column alignItems="stretch" gap={5}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Typography as="span" fontType={FontType.BODY} fontSize={10} fontWeight={FontWeights.BOLD} color={sourceLabel === 'BANK' ? colorPalette.info[500] : colorPalette.rss[500]} style={{ padding: '1px 6px', borderRadius: 4, background: sourceLabel === 'BANK' ? 'rgba(59,130,246,0.15)' : 'rgba(255,135,68,0.15)' }}>
                              {sourceLabel}
                            </Typography>
                            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                              {s.bank.toUpperCase()} {s.cardLast4 ? `...${s.cardLast4}` : ''}
                            </Typography>
                            {isError && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(229,161,0,0.15)', whiteSpace: 'nowrap' }}>
                                <AlertTriangle size={11} />
                                <Typography as="span" fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.SEMI_BOLD} color={colorPalette.warning[500]}>
                                  Parse Error
                                </Typography>
                              </span>
                            )}
                            {needsPassword && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,135,68,0.15)', whiteSpace: 'nowrap' }}>
                                <Lock size={11} />
                                <Typography as="span" fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.SEMI_BOLD} color={colorPalette.rss[500]}>
                                  Password Required
                                </Typography>
                              </span>
                            )}
                          </div>
                          {needsPassword ? (
                            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color={colorPalette.rss[500]} style={{ marginTop: 2 }}>
                              Enter password for this statement to be processed
                            </Typography>
                          ) : isError ? (
                            <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(229,161,0,0.7)" style={{ marginTop: 2 }}>
                              Could not extract data from this PDF. Try reparsing.
                            </Typography>
                          ) : (
                            <>
                              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginTop: 2 }}>
                                Period: {fmt(s.periodStart)} – {fmt(s.periodEnd)}
                              </Typography>
                              <Typography fontType={FontType.BODY} fontSize={12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)" style={{ marginTop: 2 }}>
                                {s.transactionCount} transactions
                              </Typography>
                            </>
                          )}
                        </Column>
                        <Column alignItems="center" gap={2}>
                          <Row alignItems='center' justifyContent="space-evenly" gap={20}>
                            {!needsPassword && (
                              <ButtonWithIcon
                                icon={RefreshCw}
                                variant="primary"
                                kind="elevated"
                                size="small"
                                colorMode="dark"
                                onClick={() => handleReparse(s.id)}
                                disabled={!!actioning}
                                gap={4}
                                justifyContent="center"
                                style={{ minWidth: 'auto', marginRight: 10 }}
                              >
                                {isError ? 'Retry' : 'Refresh'}
                              </ButtonWithIcon>
                            )}
                            <ButtonWithIcon
                              icon={Trash2}
                              variant="secondary"
                              kind="elevated"
                              size="small"
                              colorMode="dark"
                              onClick={() => handleRemove(s.id)}
                              disabled={!!actioning}
                              gap={4}
                              justifyContent="center"
                              style={{ minWidth: 'auto', color: mainColors.red, borderColor: 'rgba(238,77,55,0.4)' }}
                            >
                              Remove
                            </ButtonWithIcon>
                          </Row>
                        </Column>
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
                            style={{ flex: 1, backgroundColor: colorPalette.black[100], border: '1px solid rgba(255,255,255,0.2)', borderRadius: 0, padding: '6px 12px', fontSize: 14, color: '#ffffff' }}
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
        </div>
      </ElevatedCard>
      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Delete Statement"
        message="Delete this statement and all its transactions? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={executeRemove}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </ModalOverlay>
  );
}

const CATEGORY_COLORS = [
  { name: 'Orange', value: colorPalette.rss[500] },
  { name: 'Purple', value: colorPalette.poliPurple[500] },
  { name: 'Pink', value: colorPalette.pinkPong[500] },
  { name: 'Yellow', value: colorPalette.mannna[500] },
  { name: 'Lime', value: colorPalette.neoPaccha[500] },
  { name: 'Violet', value: colorPalette.yoyo[500] },
  { name: 'Red', value: mainColors.red },
  { name: 'Green', value: mainColors.green },
  { name: 'Blue', value: colorPalette.info[500] },
  { name: 'Warn', value: colorPalette.warning[500] },
  { name: 'Gray', value: colorPalette.black[50] },
  { name: 'Teal', value: colorPalette.success[300] },
  { name: 'Coral', value: '#FF6B6B' },
  { name: 'Seafoam', value: '#4ECDC4' },
  { name: 'Sky', value: '#45B7D1' },
  { name: 'Sage', value: '#96CEB4' },
  { name: 'Butter', value: '#FFEAA7' },
  { name: 'Plum', value: '#DDA0DD' },
  { name: 'Hot Pink', value: '#FF9FF3' },
  { name: 'Cornflower', value: '#54A0FF' },
  { name: 'Deep Purple', value: '#5F27CD' },
  { name: 'Dark Teal', value: '#01A3A4' },
  { name: 'Mulberry', value: '#C44569' },
  { name: 'Terra Cotta', value: '#E17055' },
  { name: 'Emerald', value: '#00B894' },
  { name: 'Iris', value: '#6C5CE7' },
  { name: 'Gold', value: '#FDCB6E' },
  { name: 'Fuchsia', value: '#E84393' },
  { name: 'Ocean', value: '#0984E3' },
  { name: 'Graphite', value: '#636E72' },
];

function normalizeHexInput(raw: string): string | null {
  const s = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/i.test(s)) return `#${s.toUpperCase()}`;
  return null;
}

/** Same stops as the design color wheel; CSS conic-gradient (SVG has no native conicGradient). */
const HUE_WHEEL_CONIC =
  'conic-gradient(from 0deg, #FF0000, #FF7F00, #FFFF00, #7FFF00, #00FF00, #00FF7F, #00FFFF, #007FFF, #0000FF, #7F00FF, #FF00FF, #FF007F, #FF0000)';

function parseHexToRgb(hex: string): [number, number, number] | null {
  const n = normalizeHexInput(hex.startsWith('#') ? hex : `#${hex}`);
  if (!n) return null;
  const v = parseInt(n.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  h *= 360;
  const s = max < 1e-6 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hexToHsv(hex: string, preserveHue = 0): { h: number; s: number; v: number } {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return { h: preserveHue, s: 1, v: 1 };
  const { h, s, v } = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  if (s < 1e-4) return { h: preserveHue, s: 0, v };
  return { h, s, v };
}

/** Safe CSS color for category swatches (hex from API or edits). */
function displayHexColor(raw: string): string {
  const n = normalizeHexInput(raw.startsWith('#') ? raw : `#${raw}`);
  return n ?? '#888888';
}

const COLOR_PICKER_POPOVER_WIDTH = 292;
const COLOR_PICKER_LAYER_Z = 11000;

const WHEEL_SIZE = 168;
const WHEEL_OUTER = WHEEL_SIZE / 2;
const WHEEL_INNER = 48;
const HUE_RING_MID = (WHEEL_OUTER + WHEEL_INNER) / 2;

function ColorPickerPopover({
  selectedColor,
  onSelect,
  onClose,
  anchorRef,
}: {
  selectedColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const hueRef = useRef(24);
  const [hsv, setHsv] = useState(() => hexToHsv(selectedColor, hueRef.current));
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const [hexDraft, setHexDraft] = useState(selectedColor);
  const wheelWrapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const popoverPanelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'hue' | 'sv' | null>(null);
  const [fixedPos, setFixedPos] = useState({ top: 0, left: 0 });

  const updateFixedPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panel = popoverPanelRef.current;
    const pad = 8;
    const h = panel?.offsetHeight ?? Math.min(640, window.innerHeight - 24);
    let left = rect.left;
    let top = rect.bottom + pad;
    if (left + COLOR_PICKER_POPOVER_WIDTH > window.innerWidth - pad) {
      left = window.innerWidth - COLOR_PICKER_POPOVER_WIDTH - pad;
    }
    if (left < pad) left = pad;
    if (top + h > window.innerHeight - pad) {
      top = rect.top - h - pad;
    }
    if (top < pad) top = pad;
    setFixedPos({ top, left });
  }, [anchorRef]);

  useLayoutEffect(() => {
    updateFixedPosition();
    const raf = requestAnimationFrame(() => updateFixedPosition());
    const panel = popoverPanelRef.current;
    const ro =
      panel && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateFixedPosition())
        : null;
    ro?.observe(panel!);
    window.addEventListener('resize', updateFixedPosition);
    window.addEventListener('scroll', updateFixedPosition, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', updateFixedPosition);
      window.removeEventListener('scroll', updateFixedPosition, true);
    };
  }, [updateFixedPosition]);

  useEffect(() => {
    const next = hexToHsv(selectedColor, hueRef.current);
    if (next.s > 1e-4) hueRef.current = next.h;
    setHsv(next);
    setHexDraft(selectedColor);
  }, [selectedColor]);

  const liveHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const chromaRgb = hsvToRgb(hsv.h, 1, 1);
  const chromaHex = rgbToHex(chromaRgb.r, chromaRgb.g, chromaRgb.b);

  const pushHsv = useCallback(
    (next: { h: number; s: number; v: number }) => {
      if (next.s > 1e-4) hueRef.current = next.h;
      setHsv(next);
      const hex = hsvToHex(next.h, next.s, next.v);
      setHexDraft(hex);
      onSelect(hex);
    },
    [onSelect],
  );

  const readHueFromWheelClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < WHEEL_INNER || dist > WHEEL_OUTER + 4) return;
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const h = (deg + 360) % 360;
      const { s, v } = hsvRef.current;
      pushHsv({ h, s, v });
    },
    [pushHsv],
  );

  const readSvFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
      const s = x;
      const v = 1 - y;
      const { h } = hsvRef.current;
      pushHsv({ h, s, v });
    },
    [pushHsv],
  );

  useEffect(() => {
    const stop = () => {
      dragRef.current = null;
    };
    const move = (e: PointerEvent) => {
      if (dragRef.current === 'hue') readHueFromWheelClient(e.clientX, e.clientY);
      else if (dragRef.current === 'sv') readSvFromClient(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [readHueFromWheelClient, readSvFromClient]);

  const onWheelPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = 'hue';
    readHueFromWheelClient(e.clientX, e.clientY);
  };

  const onSvPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = 'sv';
    readSvFromClient(e.clientX, e.clientY);
  };

  const applyHex = () => {
    const parsed = normalizeHexInput(hexDraft);
    if (parsed) {
      const next = hexToHsv(parsed, hueRef.current);
      if (next.s > 1e-4) hueRef.current = next.h;
      setHsv(next);
      onSelect(parsed);
      onClose();
    }
  };

  const hueRad = (hsv.h * Math.PI) / 180;
  const dotX = WHEEL_SIZE / 2 + HUE_RING_MID * Math.sin(hueRad);
  const dotY = WHEEL_SIZE / 2 - HUE_RING_MID * Math.cos(hueRad);

  const portalContent = (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: COLOR_PICKER_LAYER_Z - 1 }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={popoverPanelRef}
        style={{
          position: 'fixed',
          top: fixedPos.top,
          left: fixedPos.left,
          zIndex: COLOR_PICKER_LAYER_Z,
          width: COLOR_PICKER_POPOVER_WIDTH,
          maxHeight: 'calc(100vh - 16px)',
          height: 'fit-content',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'linear-gradient(165deg, rgba(38,38,42,0.98) 0%, rgba(22,22,26,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.SEMI_BOLD} color="rgba(255,255,255,0.5)" style={{ marginBottom: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Custom color
        </Typography>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
          <div
            ref={wheelWrapRef}
            onPointerDown={onWheelPointerDown}
            style={{
              position: 'relative',
              width: WHEEL_SIZE,
              height: WHEEL_SIZE,
              flexShrink: 0,
              borderRadius: '50%',
              cursor: 'crosshair',
              touchAction: 'none',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
            }}
            aria-label="Hue ring — drag to choose hue"
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: HUE_WHEEL_CONIC,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: WHEEL_INNER * 2,
                height: WHEEL_INNER * 2,
                borderRadius: '50%',
                background: colorPalette.black[90],
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35) inset',
                pointerEvents: 'auto',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <div
              style={{
                position: 'absolute',
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -8,
                left: dotX,
                top: dotY,
                borderRadius: '50%',
                background: '#fff',
                border: '2px solid rgba(0,0,0,0.35)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                width: '100%',
                height: 44,
                borderRadius: 12,
                background: liveHex,
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
              aria-hidden
            />
            <div>
              <InputField
                colorMode="dark"
                placeholder="#RRGGBB"
                value={hexDraft}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHexDraft(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && applyHex()}
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 10,
                  width: '100%',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={applyHex}
                  aria-label="Apply hex color"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                    margin: 0,
                    border: 'solid 1px rgba(255,255,255,0.14)',
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.85)',
                    cursor: 'pointer',
                    transition: 'color 0.15s ease',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = mainColors.white;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 135, 68, 0.55)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Check size={22} strokeWidth={2.5} aria-hidden focusable={false} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.SEMI_BOLD} color="rgba(255,255,255,0.45)" style={{ marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Saturation & brightness
        </Typography>
        <div
          ref={svRef}
          onPointerDown={onSvPointerDown}
          style={{
            position: 'relative',
            height: 96,
            width: '100%',
            borderRadius: 14,
            overflow: 'hidden',
            cursor: 'crosshair',
            touchAction: 'none',
            marginBottom: 18,
            backgroundColor: chromaHex,
            backgroundImage: 'linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, transparent)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08) inset',
          }}
          aria-label="Saturation and brightness — drag to adjust"
        >
          <div
            style={{
              position: 'absolute',
              width: 18,
              height: 18,
              marginLeft: -9,
              marginTop: -9,
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
            }}
          />
        </div>

        <Typography fontType={FontType.BODY} fontSize={11} fontWeight={FontWeights.SEMI_BOLD} color="rgba(255,255,255,0.45)" style={{ marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Palette
        </Typography>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 10,
          }}
        >
          {CATEGORY_COLORS.map((c, idx) => {
            const selected = selectedColor.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={`${c.value}-${idx}`}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={selected}
                onClick={() => {
                  onSelect(c.value);
                  onClose();
                }}
                style={{
                  aspectRatio: '1',
                  minWidth: 0,
                  borderRadius: 12,
                  padding: 0,
                  border: selected ? '2px solid rgba(255,255,255,0.95)' : '2px solid rgba(255,255,255,0.1)',
                  background: c.value,
                  cursor: 'pointer',
                  boxShadow: selected
                    ? `0 0 0 2px rgba(0,0,0,0.4), 0 6px 20px ${c.value}55, 0 4px 12px rgba(0,0,0,0.45)`
                    : '0 4px 14px rgba(0,0,0,0.35)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!selected) {
                    e.currentTarget.style.transform = 'scale(1.06)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                  if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
              />
            );
          })}
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(portalContent, document.body);
}

function ColorPickerButton({
  color,
  onSelect,
}: {
  color: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const fill = displayHexColor(color);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose category color"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          padding: 0,
          border: '1px solid rgba(255,255,255,0.22)',
          backgroundColor: fill,
          cursor: 'pointer',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      />
      {open && (
        <ColorPickerPopover
          anchorRef={anchorRef}
          selectedColor={color}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type PendingNewCategory = {
  id: string;
  name: string;
  keywords: string;
  color: string;
};

function newPendingCategoryRow(): PendingNewCategory {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { id, name: '', keywords: '', color: colorPalette.rss[500] };
}

export function DefineCategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, { name?: string; keywords?: string; color?: string }>>({});
  const [pendingNewRows, setPendingNewRows] = useState<PendingNewCategory[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getAllCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load categories');
          setCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const customCount = categories.filter((c) => !c.is_prebuilt).length;

  useEffect(() => {
    if (!open) return;
    setEdits({});
    setPendingNewRows([]);
  }, [open]);

  useEffect(() => {
    if (!open || loading) return;
    setPendingNewRows((prev) => {
      if (customCount >= 20) return [];
      if (prev.length === 0) return [newPendingCategoryRow()];
      const maxRows = 20 - customCount;
      if (prev.length > maxRows) return prev.slice(0, maxRows);
      return prev;
    });
  }, [open, loading, customCount]);

  const handleUpdate = async (cat: CategoryResponse) => {
    const payload = edits[cat.id] ?? {};
    if (cat.is_prebuilt) {
      if (payload.color === undefined && payload.keywords === undefined) return;
      try {
        const updated = await updateCategory(cat.id, {
          color: payload.color,
          keywords: payload.keywords,
        });
        setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
        setEdits((e) => {
          const next = { ...e };
          delete next[cat.id];
          return next;
        });
        toast.success('Category updated');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Update failed');
      }
      return;
    }
    try {
      const updated = await updateCategory(cat.id, {
        name: payload.name ?? cat.name,
        keywords: payload.keywords ?? cat.keywords,
        color: payload.color ?? cat.color,
      });
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
      setEdits((e) => {
        const next = { ...e };
        delete next[cat.id];
        return next;
      });
      toast.success('Category updated. Recategorizing transactions...');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const maxPendingNewRows = Math.max(0, 20 - customCount);
  const canAddPendingRow = pendingNewRows.length < maxPendingNewRows;

  const setPendingField = (id: string, field: keyof Omit<PendingNewCategory, 'id'>, value: string) => {
    setPendingNewRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addPendingRowAfter = (index: number) => {
    if (!canAddPendingRow) return;
    setPendingNewRows((rows) => {
      const row = rows[index];
      if (!row || !row.name.trim() || !row.keywords.trim()) return rows;
      const next = [...rows];
      next.splice(index + 1, 0, newPendingCategoryRow());
      return next;
    });
  };

  const removePendingRow = (index: number) => {
    if (pendingNewRows.length <= 1) return;
    setPendingNewRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleDelete = async (cat: CategoryResponse) => {
    if (cat.is_prebuilt) return;
    try {
      await deleteCategoryById(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      toast.success('Category removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const setEdit = (id: string, field: 'name' | 'keywords' | 'color', value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const hasEdit = (cat: CategoryResponse) => {
    const e = edits[cat.id];
    if (!e) return false;
    if (cat.is_prebuilt) return (e.color !== undefined && e.color !== cat.color) || (e.keywords !== undefined && e.keywords !== cat.keywords);
    return (e.name !== undefined && e.name !== cat.name) || (e.keywords !== undefined && e.keywords !== cat.keywords) || (e.color !== undefined && e.color !== cat.color);
  };

  const hasAnyEdits = categories.some((cat) => hasEdit(cat));
  const hasPendingCreates = pendingNewRows.some((r) => r.name.trim());

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const pendingCreates = pendingNewRows.filter((r) => r.name.trim());
      if (pendingCreates.length > 0) {
        if (customCount + pendingCreates.length > 20) {
          toast.error('Maximum 20 custom categories allowed');
          return;
        }
        try {
          const created: CategoryResponse[] = [];
          for (const row of pendingCreates) {
            const cat = await createCategory({
              name: row.name.trim(),
              keywords: row.keywords.trim(),
              color: row.color,
            });
            created.push(cat);
          }
          setCategories((prev) =>
            [...prev, ...created].sort(
              (a, b) =>
                (a.is_prebuilt === b.is_prebuilt ? 0 : a.is_prebuilt ? 1 : -1) || a.name.localeCompare(b.name),
            ),
          );
          const newCustomCount = customCount + created.length;
          setPendingNewRows(newCustomCount >= 20 ? [] : [newPendingCategoryRow()]);
          toast.success(
            created.length === 1
              ? 'Category added. Recategorizing transactions...'
              : `${created.length} categories added. Recategorizing transactions...`,
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to add category');
          return;
        }
      }

      const editedCats = categories.filter((cat) => hasEdit(cat));
      for (const cat of editedCats) {
        await handleUpdate(cat);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEdits({});
    setPendingNewRows(customCount >= 20 ? [] : [newPendingCategoryRow()]);
    onClose();
  };

  if (!open) return null;

  return (
    <ModalOverlay>
      <ModalBackdrop onClick={onClose} />
      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        edgeColors={TRANSPARENT_ELEVATED_CARD_EDGES}
        style={{
          padding: 0,
          position: 'relative',
          width: '100%',
          maxWidth: 720,
          maxHeight: '85vh',
          display: 'block',
          backgroundColor: 'transparent',
          overflow: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Typography fontType={FontType.BODY} fontSize={18} fontWeight={FontWeights.BOLD} color={mainColors.white}>
            Customize Categories
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>

        <div style={{ padding: 20, backgroundColor: colorPalette.black[90] }}>
          <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.7)" style={{ marginBottom: 8 }}>
            Transactions which don&apos;t belong to your custom categories would fall back to pre-built categories.
          </Typography>
          <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color={colorPalette.rss[500]} style={{ marginBottom: 20 }}>
            Do not create custom categories for credit card bill payments.
          </Typography>

          <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white} style={{ marginBottom: 12 }}>
            Categories ({categories.length} total, {customCount} custom / 20 max)
          </Typography>

          {loading ? (
            <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Loading...
            </Typography>
          ) : (
            <CategoryTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Keywords</th>
                  <th>Color</th>
                  <th style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td>
                      <InputField
                        colorMode="dark"
                        placeholder="Name"
                        style={{ fontWeight: FontWeights.SEMI_BOLD, fontSize: 16 }}
                        value={edits[cat.id]?.name ?? cat.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEdit(cat.id, 'name', e.target.value)}
                        disabled={cat.is_prebuilt}
                      />
                    </td>
                    <td>
                      <InputField
                        colorMode="dark"
                        placeholder="Keywords (comma-separated)"
                        style={{ fontWeight: FontWeights.MEDIUM, fontSize: 14, minWidth: 250 }}
                        value={edits[cat.id]?.keywords ?? cat.keywords}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEdit(cat.id, 'keywords', e.target.value)}
                      />
                    </td>

                    <td>
                      <ColorPickerButton
                        color={edits[cat.id]?.color ?? cat.color}
                        onSelect={(c) => setEdit(cat.id, 'color', c)}
                      />
                    </td>
                    <td>
                      {!cat.is_prebuilt && (
                        <TrashIconButton
                          aria-label={`Remove category ${cat.name}`}
                          onClick={() => handleDelete(cat)}
                          style={{ marginRight: 10, marginLeft: -20 }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {customCount < 20 &&
                  pendingNewRows.map((row, index) => (
                    <tr key={row.id}>
                      <td>
                        <InputField
                          colorMode="dark"
                          placeholder="New category name"
                          value={row.name}
                          style={{ fontWeight: FontWeights.SEMI_BOLD, fontSize: 16 }}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPendingField(row.id, 'name', e.target.value.slice(0, 50))
                          }
                        />
                      </td>
                      <td>
                        <InputField
                          colorMode="dark"
                          style={{ fontWeight: FontWeights.SEMI_BOLD, fontSize: 14 }}
                          placeholder="Keywords (comma-separated)"
                          value={row.keywords}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setPendingField(row.id, 'keywords', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <ColorPickerButton color={row.color} onSelect={(c) => setPendingField(row.id, 'color', c)} />
                      </td>
                      <td>
                        <Row alignItems="center" gap={6} style={{ marginRight: 10, marginLeft: -20 }}>
                          {pendingNewRows.length > 1 && (
                            <TrashIconButton
                              aria-label="Remove this new category row"
                              onClick={() => removePendingRow(index)}
                            />
                          )}
                          {index === pendingNewRows.length - 1 && (
                            <PlusIconButton
                              aria-label="Add another category row below"
                              onClick={() => addPendingRowAfter(index)}
                              disabled={
                                !canAddPendingRow || !row.name.trim() || !row.keywords.trim()
                              }
                            />
                          )}
                        </Row>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </CategoryTable>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              padding: '20px 20px 0px 20px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Button variant="secondary" kind="elevated" size="small" colorMode="dark" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              kind="elevated"
              size="small"
              colorMode="dark"
              onClick={handleSaveAll}
              disabled={loading || (!hasAnyEdits && !hasPendingCreates) || saving}
            >
              {saving ? 'Saving...' : 'Update All'}
            </Button>
          </div>
        </div>
      </ElevatedCard>
    </ModalOverlay>
  );
}

function GmailAutosyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<GmailStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getGmailStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleConnect = async () => {
    try {
      const { auth_url: authUrl } = await startGmailAuth();
      window.location.href = authUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start Gmail sign-in');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectGmail();
      toast.success('Gmail disconnected');
      setStatus(await getGmailStatus());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay>
      <ModalBackdrop onClick={onClose} />
      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        edgeColors={TRANSPARENT_ELEVATED_CARD_EDGES}
        style={{
          padding: 0,
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'block',
          backgroundColor: 'transparent',
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
            Autosync statements
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>
        <div style={{ padding: 20 }}>
          <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.7)" style={{ marginBottom: 16 }}>
            Optional: connect Gmail with read-only access. Burnrate searches for statement-like attachments and saves them to your watch folder (or uploads), then runs the same import pipeline as manual drops. You can disconnect anytime.
          </Typography>
          {loading && (
            <Typography fontType={FontType.BODY} fontSize={13} color="rgba(255,255,255,0.5)">
              Loading…
            </Typography>
          )}
          {!loading && status && !status.configured && (
            <Typography fontType={FontType.BODY} fontSize={13} color={colorPalette.rss[400]}>
              Gmail autosync is not enabled on this server (missing <code style={{ fontSize: 12 }}>GOOGLE_OAUTH_CLIENT_ID</code>).
            </Typography>
          )}
          {!loading && status?.configured && (
            <Row style={{ gap: 12, marginTop: 8 }}>
              {status.connected ? (
                <Button kind="primary" colorMode="dark" onClick={() => void handleDisconnect()}>
                  Disconnect Gmail
                </Button>
              ) : (
                <Button kind="primary" colorMode="dark" onClick={() => void handleConnect()}>
                  Connect Gmail
                </Button>
              )}
            </Row>
          )}
        </div>
      </ElevatedCard>
    </ModalOverlay>
  );
}

/** Hide entry point only; `ReparseRemoveModal` code path stays in the bundle. */
const SHOW_REPARSE_REMOVE_FEATURE_CARD = false;

export function Customize() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [reparseModalOpen, setReparseModalOpen] = useState(false);
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [insightsModalOpen, setInsightsModalOpen] = useState(false);
  const [paymentRemindersModalOpen, setPaymentRemindersModalOpen] = useState(false);

  useEffect(() => {
    const g = searchParams.get('gmail');
    if (g === 'connected') {
      toast.success('Gmail connected');
      setSearchParams({}, { replace: true });
    } else if (g === 'error') {
      toast.error('Gmail connection failed');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <PageLayout>
      <Navbar activeTab="customize" onTabChange={(tab) => navigate(`/${tab}`)} />
      <Content>
        <CardsGrid>
          <FeatureCard onClick={() => setGmailModalOpen(true)}>
            <Mail size={24} color={colorPalette.info[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Autosync statements
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Optional Gmail import for statement attachments (read-only OAuth).
            </Typography>
          </FeatureCard>

          <FeatureCard onClick={() => setTagsModalOpen(true)}>
            <TagIcon size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Define Tags
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Create tags to label transactions.
            </Typography>
          </FeatureCard>

          {SHOW_REPARSE_REMOVE_FEATURE_CARD && (
            <FeatureCard onClick={() => setReparseModalOpen(true)}>
              <RefreshCw size={24} color={colorPalette.rss[500]} />
              <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                Reparse/Remove Statements
              </Typography>
              <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
                Re-import or delete imported statements.
              </Typography>
            </FeatureCard>
          )}

          <FeatureCard onClick={() => setCategoriesModalOpen(true)}>
            <Palette size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Customize Categories
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Create and edit categories for transaction categorization.
            </Typography>
          </FeatureCard>

          <FeatureCard onClick={() => setInsightsModalOpen(true)}>
            <Lightbulb size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              LLM Insights
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Ask questions about your spending in natural language.
            </Typography>
          </FeatureCard>

          <FeatureCard onClick={() => setPaymentRemindersModalOpen(true)}>
            <Calendar size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Payment reminders
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Due dates from statements · mark bills paid without leaving this screen.
            </Typography>
          </FeatureCard>

          <FeatureCard onClick={() => window.open('https://github.com/pratik1235/burnrate/issues/new', '_blank')}>
            <MessageSquarePlus size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Feedback / Bugs / Feature Request
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Report a bug or suggest a feature on GitHub.
            </Typography>
          </FeatureCard>
        </CardsGrid>

        <GmailAutosyncModal open={gmailModalOpen} onClose={() => setGmailModalOpen(false)} />
        <DefineTagsModal open={tagsModalOpen} onClose={() => setTagsModalOpen(false)} />
        <ReparseRemoveModal open={reparseModalOpen} onClose={() => setReparseModalOpen(false)} />
        <DefineCategoriesModal open={categoriesModalOpen} onClose={() => setCategoriesModalOpen(false)} />
        <InsightsSettingsModal open={insightsModalOpen} onClose={() => setInsightsModalOpen(false)} />
        <PaymentRemindersModal open={paymentRemindersModalOpen} onClose={() => setPaymentRemindersModalOpen(false)} />
      </Content>
    </PageLayout>
  );
}
