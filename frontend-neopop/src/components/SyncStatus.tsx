import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { getGmailStatus, triggerGmailSync, type GmailStatusResponse } from '@/lib/api';

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function SyncStatus() {
  const [status, setStatus] = useState<GmailStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getGmailStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!status?.configured) return;
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, [load, status?.configured]);

  const onManualSync = async () => {
    setSyncing(true);
    try {
      await triggerGmailSync();
      await load();
    } catch {
      // Errors surface via axios; keep UI quiet
    } finally {
      setSyncing(false);
    }
  };

  if (loading || !status?.configured) return null;

  const label = !status.connected
    ? 'Gmail: not connected'
    : status.last_sync
      ? `Last sync ${formatRelative(status.last_sync)}`
      : 'Gmail connected';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        title="Sync Gmail now"
        onClick={() => void onManualSync()}
        disabled={!status.connected || syncing}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 8,
          border: 'none',
          cursor: status.connected && !syncing ? 'pointer' : 'not-allowed',
          background: 'rgba(255,255,255,0.06)',
          color: status.connected ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
        }}
      >
        <RefreshCw size={16} style={{ animation: syncing ? 'spin 0.8s linear infinite' : undefined }} />
      </button>
      <Typography
        fontType={FontType.BODY}
        fontSize={11}
        fontWeight={FontWeights.MEDIUM}
        color="rgba(255,255,255,0.55)"
        style={{ whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {label}
      </Typography>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
