import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from '@/components/Toast';
import { SetupWizard } from '@/pages/SetupWizard';
import { Dashboard } from '@/pages/Dashboard';
import { Cards } from '@/pages/Cards';
import { Transactions } from '@/pages/Transactions';
import { Analytics } from '@/pages/Analytics';
import { Customize } from '@/pages/Customize';
import { FilterProvider } from '@/contexts/FilterContext';
import { useSettings } from '@/hooks/useApi';
// @ts-ignore
import { initDb } from '@/lib/db';

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

function DbInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initDb().catch((err: unknown) => console.error('Failed to initialize database:', err));
  }, []);
  return <>{children}</>;
}

export default function App() {
  return (
    <DbInitializer>
      <HashRouter>
        <FilterProvider>
        <ToastContainer />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/customize" element={<Customize />} />
        </Routes>
        </FilterProvider>
      </HashRouter>
    </DbInitializer>
  );
}
