import { useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer, toast } from '@/components/Toast';
import { SetupWizard } from '@/pages/SetupWizard';
import { Dashboard } from '@/pages/Dashboard';
import { Cards } from '@/pages/Cards';
import { Statements } from '@/pages/Statements';
import { Transactions } from '@/pages/Transactions';
import { Analytics } from '@/pages/Analytics';
import { Customize } from '@/pages/Customize';
import { Offers } from '@/pages/Offers';
import { Milestones } from '@/pages/Milestones';
import { FilterProvider } from '@/contexts/FilterContext';
import { useSettings, useProcessingLogPoller } from '@/hooks/useApi';

function RootRedirect() {
  const { settings, loading } = useSettings();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0D0D0D',
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        Loading...
      </div>
    );
  }

  if (settings?.configured) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/setup" replace />;
}

function ProcessingLogWatcher() {
  const handleLog = useCallback(
    (log: { status: string; fileName: string; message: string | null; transactionCount: number }) => {
      if (log.status === 'success') {
        toast.success(
          `Imported ${log.transactionCount} transactions from ${log.fileName}`,
        );
      } else if (log.status === 'duplicate') {
        toast.info(`${log.fileName} was already imported`);
      } else if (log.status === 'card_not_found') {
        toast.warning(
          log.message ?? `${log.fileName} belongs to a card that has not been added yet. Add the card to process it.`,
        );
      } else if (log.status === 'parse_error') {
        toast.warning(
          log.message ?? `Could not extract transactions from ${log.fileName}. The PDF format may not be supported.`,
        );
      } else {
        toast.error(
          `Failed to process ${log.fileName}: ${log.message || 'Unknown error'}`,
        );
      }
    },
    [],
  );

  useProcessingLogPoller(handleLog, 60_000);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <FilterProvider>
      <ToastContainer />
      <ProcessingLogWatcher />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/cards" element={<Cards />} />
        <Route path="/statements" element={<Statements />} />
        <Route path="/bank-statements" element={<Navigate to="/statements" replace />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/customize" element={<Customize />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/milestones" element={<Milestones />} />
      </Routes>
      </FilterProvider>
    </BrowserRouter>
  );
}
