import { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle2, AlertCircle, Loader2, Lock, Files } from 'lucide-react';
import { Button, Typography, InputField } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error' | 'password_needed';

export interface UploadResult {
  status: string;
  message?: string;
  count?: number;
  bank?: string;
}

export interface BulkUploadResult {
  status: string;
  total: number;
  success: number;
  failed: number;
  duplicate: number;
  skipped: number;
}

interface StatUploadProps {
  onUpload?: (file: File, password?: string) => Promise<UploadResult>;
  onBulkUpload?: (files: File[]) => Promise<BulkUploadResult>;
  className?: string;
  compact?: boolean;
  acceptTypes?: Record<string, string[]>;
  idleText?: string;
  subtitleText?: string;
}

export function StatUpload({ onUpload, onBulkUpload, className, compact = false, acceptTypes, idleText, subtitleText }: StatUploadProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [resultMessage, setResultMessage] = useState<string>('');
  const [password, setPassword] = useState('');
  const pendingFile = useRef<File | null>(null);

  const doUpload = useCallback(
    async (file: File, pwd?: string) => {
      if (!onUpload) return;
      setStatus('uploading');
      setResultMessage('');

      try {
        const result = await onUpload(file, pwd);

        if (result.status === 'success') {
          setStatus('success');
          setResultMessage(
            `${result.count ?? 0} transactions imported${result.bank ? ` (${result.bank.toUpperCase()})` : ''}`
          );
          pendingFile.current = null;
          setTimeout(() => setStatus('idle'), 5000);
        } else if (result.status === 'duplicate') {
          setStatus('error');
          setResultMessage(result.message ?? 'Statement already imported');
          pendingFile.current = null;
          setTimeout(() => setStatus('idle'), 4000);
        } else if (
          result.message?.toLowerCase().includes('unlock') ||
          result.message?.toLowerCase().includes('password')
        ) {
          setStatus('password_needed');
          setResultMessage('PDF is password-protected. Enter the statement password:');
          pendingFile.current = file;
        } else {
          setStatus('error');
          setResultMessage(result.message ?? 'Processing failed');
          pendingFile.current = null;
          setTimeout(() => setStatus('idle'), 5000);
        }
      } catch {
        setStatus('error');
        setResultMessage('Upload failed — check backend connection');
        pendingFile.current = null;
        setTimeout(() => setStatus('idle'), 5000);
      }
    },
    [onUpload]
  );

  const doBulkUpload = useCallback(
    async (files: File[]) => {
      if (!onBulkUpload) return;
      setStatus('uploading');
      setResultMessage('');
      setFileName(`${files.length} files`);

      try {
        const result = await onBulkUpload(files);
        const parts: string[] = [];
        if (result.success > 0) parts.push(`${result.success} imported`);
        if (result.duplicate > 0) parts.push(`${result.duplicate} duplicates`);
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        if (result.skipped > 0) parts.push(`${result.skipped} skipped`);

        if (result.success > 0) {
          setStatus('success');
          setResultMessage(parts.join(', '));
          setTimeout(() => setStatus('idle'), 5000);
        } else if (result.duplicate > 0 && result.failed === 0) {
          setStatus('error');
          setResultMessage('All statements already imported');
          setTimeout(() => setStatus('idle'), 4000);
        } else {
          setStatus('error');
          setResultMessage(parts.join(', ') || 'Processing failed');
          setTimeout(() => setStatus('idle'), 5000);
        }
      } catch {
        setStatus('error');
        setResultMessage('Bulk upload failed — check backend connection');
        setTimeout(() => setStatus('idle'), 5000);
      }
    },
    [onBulkUpload]
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length === 0) return;
      setPassword('');
      pendingFile.current = null;

      if (accepted.length > 1 && onBulkUpload) {
        doBulkUpload(accepted);
      } else {
        const file = accepted[0];
        setFileName(file.name);
        doUpload(file);
      }
    },
    [doUpload, doBulkUpload, onBulkUpload]
  );

  const handlePasswordRetry = useCallback(() => {
    if (pendingFile.current && password.trim()) {
      doUpload(pendingFile.current, password.trim());
    }
  }, [doUpload, password]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptTypes ?? { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: status === 'uploading' || status === 'password_needed',
  });

  if (status === 'password_needed') {
    return (
      <div
        style={{
          border: '1px solid rgba(255,135,68,0.4)',
          borderRadius: 12,
          padding: compact ? 16 : 24,
          backgroundColor: 'rgba(255,135,68,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        className={className}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={18} color={colorPalette.rss[500]} />
          <Typography fontType={FontType.BODY} fontSize={14} color={colorPalette.rss[500]}>
            {resultMessage}
          </Typography>
        </div>
        <Typography fontType={FontType.BODY} fontSize={12} color="rgba(255,255,255,0.5)">
          {fileName}
        </Typography>
        <InputField
          colorMode="dark"
          type="password"
          placeholder="e.g. PRAT1508 or DDMMYYYY"
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handlePasswordRetry()}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            kind="elevated"
            colorMode="dark"
            size="small"
            onClick={handlePasswordRetry}
          >
            Unlock & Process
          </Button>
          <Button
            variant="secondary"
            kind="elevated"
            colorMode="dark"
            size="small"
            onClick={() => {
              setStatus('idle');
              pendingFile.current = null;
              setPassword('');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const statusConfig = {
    idle: {
      icon: onBulkUpload ? Files : Upload,
      text: idleText ?? (compact
        ? 'Drop Statement PDFs'
        : 'Drop your statement PDFs here, or click to browse'),
      color: 'rgba(255,255,255,0.6)',
    },
    uploading: {
      icon: Loader2,
      text: `Processing ${fileName}...`,
      color: colorPalette.rss[500],
    },
    success: {
      icon: CheckCircle2,
      text: resultMessage || `${fileName} uploaded successfully`,
      color: mainColors.green,
    },
    error: {
      icon: AlertCircle,
      text: resultMessage || 'Upload failed. Try again.',
      color: mainColors.red,
    },
    password_needed: {
      icon: Lock,
      text: '',
      color: colorPalette.rss[500],
    },
  };

  const current = statusConfig[status];
  const StatusIcon = current.icon;

  return (
    <div
      {...getRootProps()}
      style={{
        border: `2px dashed ${isDragActive ? colorPalette.rss[500] : 'rgba(255,255,255,0.2)'}`,
        borderRadius: 12,
        padding: compact ? 16 : 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        cursor: status === 'uploading' ? 'wait' : 'pointer',
        backgroundColor: isDragActive ? 'rgba(255,135,68,0.1)' : 'rgba(255,255,255,0.02)',
        transition: 'all 0.2s',
        minHeight: compact ? 120 : 180,
        opacity: status === 'uploading' ? 0.8 : 1,
      }}
      className={className}
    >
      <input {...getInputProps()} />
      <StatusIcon
        size={compact ? 20 : 32}
        color={current.color}
        style={{
          marginBottom: 8,
          ...(status === 'uploading' ? { animation: 'spin 1s linear infinite' } : {}),
        }}
      />
      <Typography fontType={FontType.BODY} fontSize={14} fontWeight={FontWeights.MEDIUM} color={current.color} style={{ margin: 0 }}>
        {current.text}
      </Typography>
      {status === 'idle' && onBulkUpload && (
        <Typography fontType={FontType.BODY} fontSize={compact ? 11 : 12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.4)" style={{ marginTop: 4 }}>
          {subtitleText ?? (compact ? 'drop multiple files for bulk import' : 'PDF files only — drop multiple files for bulk import')}
        </Typography>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
