import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { StatUpload } from '@/components/StatUpload';
import { Button, Typography, ElevatedCard, Tag, InputField, Row, Column } from '@cred/neopop-web/lib/components';
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
  uploadStatement,
  uploadStatementsBulk,
} from '@/lib/api';
import type { Statement } from '@/lib/types';
import type { CategoryResponse, TagDefinitionResponse } from '@/lib/api';
import { toast } from '@/components/Toast';
import { RefreshCw, Palette, X, Trash2, Tag as TagIcon, Plus, AlertTriangle, MessageSquarePlus, CreditCard, Landmark, Lock } from 'lucide-react';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
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
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
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
                  <Button
                    type="button"
                    variant="secondary"
                    kind="flat"
                    size="small"
                    colorMode="dark"
                    onClick={() => handleDelete(t.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: colorPalette.black[50],
                      padding: 2,
                      minWidth: 'auto',
                    }}
                    aria-label={`Delete ${t.name}`}
                  >
                    <X size={14} />
                  </Button>
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
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          maxHeight: '80vh',
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
          <Button
            variant="secondary"
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={handleReparseAll}
            disabled={reparseAllRunning || loading || statements.length === 0}
            style={{ marginBottom: 20 }}
          >
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            {reparseAllRunning ? 'Reparsing...' : 'Reparse All'}
          </Button>

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
                              <Button variant="primary" kind="elevated" size="small" colorMode="dark" onClick={() => handleReparse(s.id)} disabled={!!actioning} style={{ minWidth: 'auto', marginRight: 10 }}>
                                <Row gap={4} alignItems="center" justifyContent="center">
                                  <RefreshCw size={14} style={{ marginRight: 5 }} />
                                  {isError ? 'Retry' : 'Refresh'}
                                </Row>
                              </Button>
                            )}
                            <Button variant="secondary" kind="elevated" size="small" colorMode="dark" onClick={() => handleRemove(s.id)} disabled={!!actioning} style={{ minWidth: 'auto', color: mainColors.red, borderColor: 'rgba(238,77,55,0.4)' }}>
                              <Row gap={4} alignItems="center" justifyContent="center">
                                <Trash2 size={14} style={{ marginRight: 4 }} />
                                Remove
                              </Row>
                            </Button>
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

function ColorPickerPopover({
  selectedColor,
  onSelect,
  onClose,
}: {
  selectedColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: '-100%',
          right: 50,
          marginTop: 4,
          marginRight: 50,
          zIndex: 201,
          background: colorPalette.black[100],
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 8,
          width: 'max-content',
        }}
      >
        {CATEGORY_COLORS.map((c) => (
          <Button
            key={c.value}
            type="button"
            variant="secondary"
            kind="flat"
            size="small"
            colorMode="dark"
            onClick={() => {
              onSelect(c.value);
              onClose();
            }}
            title={c.name}
            style={{
              width: 24,
              height: 24,
              minWidth: 24,
              borderRadius: '50%',
              backgroundColor: c.value,
              border: selectedColor === c.value
                ? `2px solid ${mainColors.white}`
                : '2px solid transparent',
              padding: 0,
            }}
          />
        ))}
      </div>
    </>
  );
}

function ColorPickerButton({
  color,
  onSelect,
}: {
  color: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <Button
        type="button"
        variant="secondary"
        kind="flat"
        size="small"
        colorMode="dark"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '6px 10px',
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: color,
            display: 'inline-block',
            flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        />
        <Palette size={14} color="rgba(255,255,255,0.5)" />
      </Button>
      {open && (
        <ColorPickerPopover
          selectedColor={color}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function DefineCategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, { name?: string; keywords?: string; color?: string }>>({});
  const [newRow, setNewRow] = useState({ name: '', keywords: '', color: colorPalette.rss[500] });

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

  const handleAdd = async () => {
    const name = newRow.name.trim();
    if (!name) {
      toast.error('Category name is required');
      return;
    }
    if (customCount >= 20) {
      toast.error('Maximum 20 custom categories allowed');
      return;
    }
    try {
      toast.success('Category added. Recategorizing transactions...');
      const cat = await createCategory({
        name,
        keywords: newRow.keywords.trim(),
        color: newRow.color,
      });
      setCategories((prev) => [...prev, cat].sort((a, b) => (a.is_prebuilt === b.is_prebuilt ? 0 : a.is_prebuilt ? 1 : -1) || a.name.localeCompare(b.name)));
      setNewRow({ name: '', keywords: '', color: colorPalette.rss[500] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add category');
    }
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

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      if (newRow.name.trim()) {
        await handleAdd();
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
    setNewRow({ name: '', keywords: '', color: colorPalette.rss[500] });
    onClose();
  };

  if (!open) return null;

  return (
    <ModalOverlay>
      <ModalBackdrop onClick={onClose} />
      <ElevatedCard
        backgroundColor={colorPalette.black[90]}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 720,
          maxHeight: '85vh',
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
                      <div style={{ minWidth: 20 }}></div>
                      <div style={{ marginRight: 100 }}></div>
                      <ColorPickerButton
                        color={edits[cat.id]?.color ?? cat.color}
                        onSelect={(c) => setEdit(cat.id, 'color', c)}
                      />
                    </td>
                    <td>
                      {!cat.is_prebuilt && (
                        <Button
                          type="button"
                          variant="secondary"
                          kind="flat"
                          size="small"
                          colorMode="dark"
                          onClick={() => handleDelete(cat)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: mainColors.red,
                            padding: 4,
                            minWidth: 'auto',
                            marginRight: 10,
                            marginLeft: -20,
                          }}
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <InputField
                      colorMode="dark"
                      placeholder="New category name"
                      value={newRow.name}
                      style={{ fontWeight: FontWeights.SEMI_BOLD, fontSize: 16 }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRow((r) => ({ ...r, name: e.target.value.slice(0, 50) }))}
                    />
                  </td>
                  <td>
                    <InputField
                      colorMode="dark"
                      style={{ fontWeight: FontWeights.SEMI_BOLD, fontSize: 14 }}
                      placeholder="Keywords (comma-separated)"
                      value={newRow.keywords}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRow((r) => ({ ...r, keywords: e.target.value }))}
                    />
                  </td>
                  <td>
                    <ColorPickerButton
                      color={newRow.color}
                      onSelect={(c) => setNewRow((r) => ({ ...r, color: c }))}
                    />
                  </td>
                  <td>
                    <Button
                      variant="primary"
                      kind="elevated"
                      size="small"
                      colorMode="dark"
                      onClick={handleAdd}
                      disabled={customCount >= 20 || !newRow.name.trim()}
                      style={{ minWidth: 'auto', marginRight: 10, marginLeft: -40 }}
                    >
                      <Plus size={16} />
                    </Button>
                  </td>
                </tr>
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
              disabled={loading || (!hasAnyEdits && !newRow.name.trim()) || saving}
            >
              {saving ? 'Saving...' : 'Update All'}
            </Button>
          </div>
        </div>
      </ElevatedCard>
    </ModalOverlay>
  );
}

export function Customize() {
  const navigate = useNavigate();
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [reparseModalOpen, setReparseModalOpen] = useState(false);
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);

  const handleCCUpload = async (file: File, password?: string) => {
    const loadingId = toast.loading('Processing card statement...');
    try {
      const result = await uploadStatement(file, undefined, password, 'CC');
      toast.dismiss(loadingId);
      if (result.status === 'success') {
        toast.success(`${result.count ?? 0} transactions imported from ${(result.bank ?? '').toUpperCase()} statement`);
      } else if (result.status === 'duplicate') {
        toast.info(result.message ?? 'Statement already imported');
      } else {
        toast.error(result.message ?? 'Processing failed');
      }
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      return { status: 'error', message: 'Upload failed', count: 0 };
    }
  };

  const handleCCBulkUpload = async (files: File[]) => {
    const loadingId = toast.loading(`Processing ${files.length} card statements...`);
    try {
      const result = await uploadStatementsBulk(files, undefined, undefined, 'CC');
      toast.dismiss(loadingId);
      if (result.success > 0) toast.success(`${result.success} of ${result.total} statements imported`);
      else if (result.duplicate > 0) toast.info('All statements already imported');
      else if (result.failed > 0) toast.error(`${result.failed} of ${result.total} statements failed`);
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      toast.error(err instanceof Error ? err.message : 'Bulk upload failed');
      return { status: 'error', total: files.length, success: 0, failed: files.length, duplicate: 0, skipped: 0 };
    }
  };

  const handleBankUpload = async (file: File, password?: string) => {
    const loadingId = toast.loading('Processing bank statement...');
    try {
      const result = await uploadStatement(file, undefined, password, 'BANK');
      toast.dismiss(loadingId);
      if (result.status === 'success') {
        toast.success(`${result.count ?? 0} transactions imported from ${(result.bank ?? '').toUpperCase()} bank statement`);
      } else if (result.status === 'duplicate') {
        toast.info(result.message ?? 'Statement already imported');
      } else {
        toast.error(result.message ?? 'Processing failed');
      }
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      return { status: 'error', message: 'Upload failed', count: 0 };
    }
  };

  const handleBankBulkUpload = async (files: File[]) => {
    const loadingId = toast.loading(`Processing ${files.length} bank statements...`);
    try {
      const result = await uploadStatementsBulk(files, undefined, undefined, 'BANK');
      toast.dismiss(loadingId);
      if (result.success > 0) toast.success(`${result.success} of ${result.total} bank statements imported`);
      else if (result.duplicate > 0) toast.info('All statements already imported');
      else if (result.failed > 0) toast.error(`${result.failed} of ${result.total} statements failed`);
      return result;
    } catch (err) {
      toast.dismiss(loadingId);
      toast.error(err instanceof Error ? err.message : 'Bulk upload failed');
      return { status: 'error', total: files.length, success: 0, failed: files.length, duplicate: 0, skipped: 0 };
    }
  };

  return (
    <PageLayout>
      <Navbar activeTab="customize" onTabChange={(tab) => navigate(`/${tab}`)} />
      <Content>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <CreditCard size={18} color={colorPalette.rss[500]} />
              <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                Drop Card Statement PDFs
              </Typography>
            </div>
            <StatUpload onUpload={handleCCUpload} onBulkUpload={handleCCBulkUpload} compact />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Landmark size={18} color={colorPalette.info[500]} />
              <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
                Drop Bank Statement CSVs
              </Typography>
            </div>
            <StatUpload
              onUpload={handleBankUpload}
              onBulkUpload={handleBankBulkUpload}
              compact
              acceptTypes={{ 'text/csv': ['.csv'] }}
              idleText="Drop Bank Statement CSVs"
              subtitleText="CSV files — drop multiple for bulk import"
            />
          </div>
        </div>

        <CardsGrid>
          <FeatureCard onClick={() => setTagsModalOpen(true)}>
            <TagIcon size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Define Tags
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Create tags to label transactions.
            </Typography>
          </FeatureCard>

          <FeatureCard onClick={() => setReparseModalOpen(true)}>
            <RefreshCw size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Reparse/Remove Statements
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Re-import or delete imported statements.
            </Typography>
          </FeatureCard>

          <FeatureCard onClick={() => setCategoriesModalOpen(true)}>
            <Palette size={24} color={colorPalette.rss[500]} />
            <Typography fontType={FontType.BODY} fontSize={16} fontWeight={FontWeights.SEMI_BOLD} color={mainColors.white}>
              Customize Categories
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={13} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.5)">
              Create and edit categories for transaction categorization.
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

        <DefineTagsModal open={tagsModalOpen} onClose={() => setTagsModalOpen(false)} />
        <ReparseRemoveModal open={reparseModalOpen} onClose={() => setReparseModalOpen(false)} />
        <DefineCategoriesModal open={categoriesModalOpen} onClose={() => setCategoriesModalOpen(false)} />
      </Content>
    </PageLayout>
  );
}
