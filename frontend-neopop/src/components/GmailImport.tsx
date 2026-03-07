import { useState, useCallback } from 'react';
import { Button, Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { Mail, LogOut, Loader2, CheckCircle2, AlertCircle, Shield, Download } from 'lucide-react';
import {
  signIn,
  signOut,
  isSignedIn,
  fetchStatements,
  type FetchProgress,
  type FetchedStatement,
// @ts-ignore
} from '../services/gmailService';
// @ts-ignore
import { processStatement } from '../services/statementProcessor';
// @ts-ignore
import { GOOGLE_CLIENT_ID } from '../lib/config';

type GmailState = 'idle' | 'signing_in' | 'connected' | 'fetching' | 'done' | 'error';

interface ImportResult {
  success: number;
  duplicate: number;
  failed: number;
  total: number;
}

export function GmailImport({ onImportComplete }: { onImportComplete?: () => void }) {
  const [state, setState] = useState<GmailState>(isSignedIn() ? 'connected' : 'idle');
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleConnect = useCallback(async () => {
    setState('signing_in');
    setErrorMsg('');
    try {
      await signIn();
      setState('connected');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect to Gmail');
      setState('error');
      setTimeout(() => setState('idle'), 5000);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    signOut();
    setState('idle');
    setResult(null);
    setProgress(null);
  }, []);

  const handleFetch = useCallback(async () => {
    setState('fetching');
    setResult(null);
    setErrorMsg('');

    try {
      const statements: FetchedStatement[] = await fetchStatements((p) => {
        setProgress(p);
      });

      if (statements.length === 0) {
        setResult({ success: 0, duplicate: 0, failed: 0, total: 0 });
        setState('done');
        return;
      }

      // Process each downloaded PDF through the existing statement processor
      const importResult: ImportResult = { success: 0, duplicate: 0, failed: 0, total: statements.length };

      for (const stmt of statements) {
        try {
          const r = await processStatement(stmt.file, stmt.bank);
          if (r.status === 'success') importResult.success++;
          else if (r.status === 'duplicate') importResult.duplicate++;
          else importResult.failed++;
        } catch {
          importResult.failed++;
        }
      }

      setResult(importResult);
      setState('done');
      if (importResult.success > 0) {
        onImportComplete?.();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch statements from Gmail');
      setState('error');
    }
  }, [onImportComplete]);

  // Don't render if no Client ID is configured
  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Mail size={22} color={colorPalette.rss[500]} />
        <Typography
          fontType={FontType.BODY}
          fontSize={16}
          fontWeight={FontWeights.SEMI_BOLD}
          color={mainColors.white}
        >
          Gmail Import
        </Typography>
      </div>

      <Typography
        fontType={FontType.BODY}
        fontSize={13}
        fontWeight={FontWeights.REGULAR}
        color="rgba(255,255,255,0.5)"
      >
        Import credit card statements directly from your Gmail. Searches for
        statement emails from all supported banks and downloads the PDF
        attachments.
      </Typography>

      {/* Privacy callout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: 8,
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}
      >
        <Shield size={14} color="#10B981" style={{ flexShrink: 0 }} />
        <Typography
          fontType={FontType.BODY}
          fontSize={12}
          fontWeight={FontWeights.REGULAR}
          color="#10B981"
        >
          Your data stays in your browser. Gmail is accessed directly — no
          server involved.
        </Typography>
      </div>

      {/* Action area */}
      {state === 'idle' && (
        <Button
          variant="primary"
          kind="elevated"
          size="medium"
          colorMode="dark"
          onClick={handleConnect}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'flex-start',
          }}
        >
          <Mail size={16} style={{ marginRight: 6 }} />
          Connect Gmail
        </Button>
      )}

      {state === 'signing_in' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2
            size={18}
            color={colorPalette.rss[500]}
            style={{ animation: 'spin 1s linear infinite' }}
          />
          <Typography
            fontType={FontType.BODY}
            fontSize={14}
            fontWeight={FontWeights.MEDIUM}
            color={colorPalette.rss[500]}
          >
            Waiting for Google sign-in...
          </Typography>
        </div>
      )}

      {state === 'connected' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            variant="primary"
            kind="elevated"
            size="medium"
            colorMode="dark"
            onClick={handleFetch}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Download size={16} style={{ marginRight: 6 }} />
            Fetch Statements
          </Button>
          <Button
            variant="secondary"
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={handleDisconnect}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            <LogOut size={14} />
            Disconnect
          </Button>
        </div>
      )}

      {state === 'fetching' && progress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2
              size={18}
              color={colorPalette.rss[500]}
              style={{ animation: 'spin 1s linear infinite' }}
            />
            <Typography
              fontType={FontType.BODY}
              fontSize={14}
              fontWeight={FontWeights.MEDIUM}
              color={colorPalette.rss[500]}
            >
              {progress.phase === 'searching'
                ? `Searching ${progress.bank}...`
                : `Downloading ${progress.bank} (${progress.current}/${progress.total})...`}
            </Typography>
          </div>
        </div>
      )}

      {state === 'done' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} color={mainColors.green} />
            <Typography
              fontType={FontType.BODY}
              fontSize={14}
              fontWeight={FontWeights.MEDIUM}
              color={mainColors.green}
            >
              {result.total === 0
                ? 'No new statements found in Gmail'
                : `Done! ${result.success} imported${result.duplicate ? `, ${result.duplicate} duplicates` : ''}${result.failed ? `, ${result.failed} failed` : ''}`}
            </Typography>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              kind="elevated"
              size="small"
              colorMode="dark"
              onClick={handleFetch}
            >
              Fetch Again
            </Button>
            <Button
              variant="secondary"
              kind="elevated"
              size="small"
              colorMode="dark"
              onClick={handleDisconnect}
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              <LogOut size={14} style={{ marginRight: 4 }} />
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} color={mainColors.red} />
            <Typography
              fontType={FontType.BODY}
              fontSize={14}
              fontWeight={FontWeights.MEDIUM}
              color={mainColors.red}
            >
              {errorMsg}
            </Typography>
          </div>
          <Button
            variant="primary"
            kind="elevated"
            size="small"
            colorMode="dark"
            onClick={handleConnect}
            style={{ alignSelf: 'flex-start' }}
          >
            Try Again
          </Button>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
