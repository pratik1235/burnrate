import React, { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle2, AlertCircle, Loader2, Lock, Files, FolderOpen } from 'lucide-react';
import { Button, Typography, InputField } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { BulkUploadSummaryModal } from '@/components/BulkUploadSummaryCard';
import type { BulkUploadResult } from '@/lib/api';
import { filesFromDataTransfer } from '@/lib/filesFromDataTransfer';
import { describeAllowedFileKinds, filterFilesByAcceptTypes } from '@/lib/statUploadFilter';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error' | 'password_needed';

export interface UploadResult {
  status: string;
  message?: string;
  count?: number;
  bank?: string;
}

const DEFAULT_ACCEPT_TYPES: Record<string, string[]> = { 'application/pdf': ['.pdf'] };

interface StatUploadProps {
  onUpload?: (file: File, password?: string) => Promise<UploadResult>;
  onBulkUpload?: (files: File[]) => Promise<BulkUploadResult>;
  className?: string;
  compact?: boolean;
  acceptTypes?: Record<string, string[]>;
  idleText?: string;
  subtitleText?: string;
}

async function filesFromDropzoneEvent(event: unknown): Promise<File[]> {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return [];
  const drag = event as React.DragEvent<HTMLElement> | globalThis.DragEvent;
  const dt = 'dataTransfer' in drag ? drag.dataTransfer : null;
  if (!dt) return [];
  return filesFromDataTransfer({ dataTransfer: dt });
}

export function StatUpload({ onUpload, onBulkUpload, className, compact = false, acceptTypes, idleText, subtitleText }: StatUploadProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [resultMessage, setResultMessage] = useState<string>('');
  const [password, setPassword] = useState('');
  const [bulkSummary, setBulkSummary] = useState<BulkUploadResult | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const pendingFile = useRef<File | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const resolvedAccept = acceptTypes ?? DEFAULT_ACCEPT_TYPES;

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
      setBulkSummary(null);
      setSummaryModalOpen(false);
      setFileName(`${files.length} files`);

      try {
        const result = await onBulkUpload(files);
        setBulkSummary(result);
        setSummaryModalOpen(true);
        const parts: string[] = [];
        if (result.success > 0) parts.push(`${result.success} imported`);
        if (result.duplicate > 0) parts.push(`${result.duplicate} duplicates`);
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        if (result.card_not_found > 0) parts.push(`${result.card_not_found} card missing`);
        if (result.parse_error > 0) parts.push(`${result.parse_error} parse errors`);
        if (result.password_needed > 0) parts.push(`${result.password_needed} need password`);
        if (result.skipped > 0) parts.push(`${result.skipped} not queued`);

        if (result.success > 0) {
          setStatus('success');
          setResultMessage(parts.join(', '));
          setTimeout(() => setStatus('idle'), 5000);
        } else if (
          result.success === 0 &&
          result.total > 0 &&
          result.duplicate === result.total &&
          result.failed === 0 &&
          result.card_not_found === 0 &&
          result.parse_error === 0 &&
          result.password_needed === 0
        ) {
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
        setBulkSummary(null);
        setSummaryModalOpen(false);
        setTimeout(() => setStatus('idle'), 5000);
      }
    },
    [onBulkUpload]
  );

  const handleFolderSideFiles = useCallback(
    (rawFiles: File[]) => {
      if (!onBulkUpload) return;
      setPassword('');
      pendingFile.current = null;
      const filtered = filterFilesByAcceptTypes(rawFiles, resolvedAccept);
      if (filtered.length === 0) {
        const kinds = describeAllowedFileKinds(resolvedAccept);
        setStatus('error');
        setResultMessage(`No ${kinds} files found in that folder`);
        setFileName('');
        setTimeout(() => setStatus('idle'), 4000);
        return;
      }
      doBulkUpload(filtered);
    },
    [doBulkUpload, onBulkUpload, resolvedAccept]
  );

  const onFileDrop = useCallback(
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

  const onFolderDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length === 0) {
        const kinds = describeAllowedFileKinds(resolvedAccept);
        setStatus('error');
        setResultMessage(`No ${kinds} files found in that folder`);
        setFileName('');
        setTimeout(() => setStatus('idle'), 4000);
        return;
      }
      handleFolderSideFiles(accepted);
    },
    [handleFolderSideFiles, resolvedAccept]
  );

  const dropDisabled = status === 'uploading' || status === 'password_needed';

  const { getRootProps: getFileRootProps, getInputProps: getFileInputProps, isDragActive: fileDragActive } = useDropzone({
    onDrop: onFileDrop,
    accept: resolvedAccept,
    multiple: true,
    disabled: dropDisabled,
  });

  const { getRootProps: getFolderRootProps, getInputProps: getFolderDropInputProps, isDragActive: folderDragActive } = useDropzone({
    onDrop: onFolderDrop,
    multiple: true,
    noClick: true,
    disabled: dropDisabled || !onBulkUpload,
    getFilesFromEvent: filesFromDropzoneEvent,
  });

  const handlePasswordRetry = useCallback(() => {
    if (pendingFile.current && password.trim()) {
      doUpload(pendingFile.current, password.trim());
    }
  }, [doUpload, password]);

  const handleChooseFolderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    folderInputRef.current?.click();
  }, []);

  const handleFolderInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      e.target.value = '';
      if (!list?.length || !onBulkUpload) return;
      handleFolderSideFiles(Array.from(list));
    },
    [handleFolderSideFiles, onBulkUpload]
  );

  const dismissSummary = useCallback(() => {
    setSummaryModalOpen(false);
    setBulkSummary(null);
  }, []);

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
  const showDualDropzones = Boolean(onBulkUpload);
  const dropzoneMinHeight = showDualDropzones ? (compact ? 140 : 200) : compact ? 120 : 180;
  const zonePadding = compact ? 12 : 24;

  const folderRootFromDropzone = getFolderRootProps();
  const folderRootHtml = folderRootFromDropzone as React.HTMLAttributes<HTMLElement>;
  const folderRootProps = {
    ...folderRootFromDropzone,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      handleChooseFolderClick(e);
      folderRootHtml.onClick?.(e);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      folderRootHtml.onKeyDown?.(e);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        folderInputRef.current?.click();
      }
    },
  };

  const renderStatusBody = () => (
    <>
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
      {status === 'idle' && subtitleText && (
        <Typography fontType={FontType.BODY} fontSize={compact ? 11 : 12} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.4)" style={{ marginTop: 4 }}>
          {subtitleText}
        </Typography>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {showDualDropzones && status === 'idle' ? (
        <div
          style={{
            border: `2px dashed ${fileDragActive || folderDragActive ? colorPalette.rss[500] : 'rgba(255,255,255,0.2)'}`,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            width: '100%',
            minHeight: dropzoneMinHeight,
            backgroundColor: fileDragActive || folderDragActive ? 'rgba(255,135,68,0.1)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
            overflow: 'hidden',
          }}
        >
          <div
            {...getFileRootProps()}
            style={{
              flex: 1,
              minWidth: 0,
              padding: zonePadding,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              cursor: dropDisabled ? 'wait' : 'pointer',
              borderRight: '1px solid rgba(255,255,255,0.12)',
              backgroundColor: fileDragActive ? 'rgba(255,135,68,0.08)' : 'transparent',
            }}
            aria-label="Upload statement files"
          >
            <input {...getFileInputProps()} />
            <Files size={compact ? 22 : 28} color="rgba(255,255,255,0.5)" style={{ marginBottom: 8 }} />
            <Typography fontType={FontType.BODY} fontSize={compact ? 12 : 13} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.75)" style={{ margin: 0 }}>
              {compact ? 'Files' : 'Drop files or click to browse'}
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={compact ? 10 : 11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.38)" style={{ marginTop: 4 }}>
              One or more {describeAllowedFileKinds(resolvedAccept)} files
            </Typography>
          </div>
          <div
            {...folderRootProps}
            style={{
              flex: 1,
              minWidth: 0,
              padding: zonePadding,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              cursor: dropDisabled ? 'not-allowed' : 'pointer',
              backgroundColor: folderDragActive ? 'rgba(255,135,68,0.08)' : 'transparent',
            }}
            role="button"
            tabIndex={dropDisabled ? -1 : 0}
            aria-label="Upload statements from a folder"
          >
            <input {...getFolderDropInputProps()} tabIndex={-1} style={{ display: 'none' }} />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFolderInputChange}
              tabIndex={-1}
              aria-hidden
              {...({
                webkitdirectory: '',
                directory: '',
              } as Record<string, string>)}
            />
            <FolderOpen size={compact ? 22 : 28} color="rgba(255,255,255,0.5)" style={{ marginBottom: 8 }} />
            <Typography fontType={FontType.BODY} fontSize={compact ? 12 : 13} fontWeight={FontWeights.MEDIUM} color="rgba(255,255,255,0.75)" style={{ margin: 0 }}>
              {compact ? 'Folder' : 'Drop a folder or click to choose'}
            </Typography>
            <Typography fontType={FontType.BODY} fontSize={compact ? 10 : 11} fontWeight={FontWeights.REGULAR} color="rgba(255,255,255,0.38)" style={{ marginTop: 4 }}>
              Scans subfolders for {describeAllowedFileKinds(resolvedAccept)}
            </Typography>
          </div>
        </div>
      ) : (
        <div
          {...getFileRootProps()}
          style={{
            border: `2px dashed ${fileDragActive ? colorPalette.rss[500] : 'rgba(255,255,255,0.2)'}`,
            borderRadius: 12,
            padding: compact ? 16 : 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            cursor: status === 'uploading' ? 'wait' : 'pointer',
            backgroundColor: fileDragActive ? 'rgba(255,135,68,0.1)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
            minHeight: dropzoneMinHeight,
            opacity: status === 'uploading' ? 0.8 : 1,
          }}
        >
          <input {...getFileInputProps()} />
          {renderStatusBody()}
        </div>
      )}

      <BulkUploadSummaryModal open={summaryModalOpen} result={bulkSummary} onDismiss={dismissSummary} />
    </div>
  );
}
