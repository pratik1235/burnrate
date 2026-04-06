import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mainColors } from '@cred/neopop-web/lib/primitives';
import { toast } from '@/components/Toast';
import {
  SetupForm,
  type CardEntry,
  type SetupFormData,
  type SetupFormInitialData,
} from '@/components/SetupForm';
import { submitSetup, useSettings } from '@/hooks/useApi';
import { deleteCard, updateSettings } from '@/lib/api';
import { CloseButton } from '@/components/CloseButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import styled from 'styled-components';

/**
 * Card IDs that were present when the update form loaded but are missing from the submitted list.
 * Uses stable server IDs so removal matches DELETE /api/cards/{id} (same cascade as the Cards page).
 */
export function removedCardIds(
  baseline: CardEntry[] | undefined,
  submitted: SetupFormData['cards'],
): string[] {
  const kept = new Set(submitted.map((c) => c.id).filter((id): id is string => Boolean(id)));
  return (baseline ?? [])
    .filter((c): c is CardEntry & { id: string } => typeof c.id === 'string' && c.id.length > 0)
    .filter((c) => !kept.has(c.id))
    .map((c) => c.id);
}

const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${mainColors.black};
  padding: 24px;
  position: relative;
`;

export function SetupWizard() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<SetupFormData | null>(null);
  const { settings, loading: settingsLoading } = useSettings();

  const isUpdate = !!settings?.configured;

  const initialData = useMemo<SetupFormInitialData | undefined>(() => {
    if (!settings?.configured) return undefined;
    return {
      name: settings.name,
      dobDay: settings.dobDay,
      dobMonth: settings.dobMonth,
      dobYear: settings.dobYear,
      watchFolder: settings.watchFolder,
      displayCurrency: settings.displayCurrency ?? '',
      cards: settings.cards?.map((c) => ({ id: c.id, bank: c.bank, last4: c.last4 })),
    };
  }, [settings]);

  /** Baseline card rows (with server IDs) captured once when the update form is first populated */
  const baselineCardsRef = useRef<SetupFormInitialData['cards'] | undefined>(undefined);
  useEffect(() => {
    if (!isUpdate || !initialData?.cards?.length) return;
    if (baselineCardsRef.current !== undefined) return;
    baselineCardsRef.current = initialData.cards.map((c) => ({ ...c }));
  }, [isUpdate, initialData]);

  const persistUpdate = async (data: SetupFormData) => {
    const baseline = baselineCardsRef.current ?? initialData?.cards;
    const toRemove = removedCardIds(baseline, data.cards);
    for (const id of toRemove) {
      await deleteCard(id);
    }
    await updateSettings({
      name: data.name,
      dobDay: data.dobDay,
      dobMonth: data.dobMonth,
      dobYear: data.dobYear,
      watchFolder: data.watchFolder,
      displayCurrency: data.displayCurrency || undefined,
      cards: data.cards.map(({ bank, last4 }) => ({ bank, last4 })),
    });
  };

  const handleSubmit = async (data: SetupFormData) => {
    if (isUpdate) {
      const baseline = baselineCardsRef.current ?? initialData?.cards;
      const toRemove = removedCardIds(baseline, data.cards);
      if (toRemove.length > 0) {
        setPendingSave(data);
        setConfirmSaveOpen(true);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isUpdate) {
        await persistUpdate(data);
        toast.success('Profile updated!');
      } else {
        await submitSetup({
          name: data.name,
          dobDay: data.dobDay,
          dobMonth: data.dobMonth,
          dobYear: data.dobYear,
          cards: data.cards.map((c) => ({
            bank: c.bank as 'hdfc' | 'icici' | 'axis',
            last4: c.last4,
          })),
          watchFolder: data.watchFolder,
          displayCurrency: data.displayCurrency || undefined,
        });
        toast.success('Profile saved! Redirecting to dashboard...');
      }
      navigate('/dashboard');
    } catch {
      toast.error('Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSaveRemovals = async () => {
    if (!pendingSave) return;
    setConfirmSaveOpen(false);
    setSubmitting(true);
    try {
      await persistUpdate(pendingSave);
      toast.success('Profile updated!');
      navigate('/dashboard');
    } catch {
      toast.error('Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
      setPendingSave(null);
    }
  };

  const handleCancelSaveRemovals = () => {
    setConfirmSaveOpen(false);
    setPendingSave(null);
  };

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <PageWrapper>
      {isUpdate && (
        <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 10 }}>
          <CloseButton onClick={handleClose} variant="modal" />
        </div>
      )}
      <div style={{ opacity: submitting ? 0.7 : 1, pointerEvents: submitting ? 'none' : 'auto' }}>
        {!settingsLoading && (
          <SetupForm
            onSubmit={handleSubmit}
            initialData={initialData}
            isUpdate={isUpdate}
          />
        )}
      </div>
      <ConfirmModal
        open={confirmSaveOpen}
        title="Remove Card"
        message={
          pendingSave && removedCardIds(baselineCardsRef.current ?? initialData?.cards, pendingSave.cards).length > 1
            ? 'Saving will remove these cards and all of their transactions and statements. This cannot be undone.'
            : 'Saving will remove this card and all of its transactions and statements. This cannot be undone.'
        }
        confirmLabel="Remove and save"
        variant="danger"
        onConfirm={() => void handleConfirmSaveRemovals()}
        onCancel={handleCancelSaveRemovals}
      />
    </PageWrapper>
  );
}
