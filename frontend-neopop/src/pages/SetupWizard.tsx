import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mainColors } from '@cred/neopop-web/lib/primitives';
import { toast } from '@/components/Toast';
import { SetupForm, type SetupFormInitialData } from '@/components/SetupForm';
import { submitSetup, useSettings } from '@/hooks/useApi';
import { updateSettings } from '@/lib/api';
import { CloseButton } from '@/components/CloseButton';
import styled from 'styled-components';

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
      cards: settings.cards?.map((c) => ({ bank: c.bank, last4: c.last4 })),
    };
  }, [settings]);

  const handleSubmit = async (data: {
    name: string;
    dobDay: string;
    dobMonth: string;
    dobYear: string;
    cards: { bank: string; last4: string }[];
    watchFolder: string;
  }) => {
    setSubmitting(true);
    try {
      if (isUpdate) {
        await updateSettings({
          name: data.name,
          dobDay: data.dobDay,
          dobMonth: data.dobMonth,
          dobYear: data.dobYear,
          watchFolder: data.watchFolder,
          cards: data.cards,
        });
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
    </PageWrapper>
  );
}
