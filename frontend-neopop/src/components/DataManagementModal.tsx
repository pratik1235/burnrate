import React, { useState, useRef } from 'react';
import { Typography, Row, InputField } from '@cred/neopop-web/lib/components';
import { SelectableElevatedCard as ElevatedCard, TRANSPARENT_ELEVATED_CARD_EDGES } from '@/components/SelectableElevatedCard';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import { Download, Upload, Lock } from 'lucide-react';
import { exportData, importData } from '@/lib/api';
import { toast } from '@/components/Toast';
import { CloseButton } from '@/components/CloseButton';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import styled from 'styled-components';

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

export function DataManagementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [password, setPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportData(password);
      toast.success('Backup downloaded');
      onClose();
    } catch {
      toast.error('Failed to export backup');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a valid .zip backup file');
      return;
    }

    setImporting(true);
    try {
      await importData(file, password);
      toast.success('Data imported successfully! Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      const err = error as any;
      const msg = err.response?.data?.detail || err.message || 'Import failed';
      toast.error(`Import Error: ${msg}`);
      setImporting(false);
    }

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
          display: 'block',
          backgroundColor: 'transparent',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Typography fontType={FontType.BODY} fontSize={18} fontWeight={FontWeights.BOLD} color={mainColors.white}>
            Data Management
          </Typography>
          <CloseButton onClick={onClose} variant="modal" />
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ marginBottom: '24px' }}>
            <Row alignItems="center" gap={8} style={{ marginBottom: '8px' }}>
              <div style={{ marginTop: '0.2px' }}>
                <Lock size={14} color={colorPalette.rss[400]} />
              </div>
              <Typography fontType={FontType.BODY} fontSize={13} color="rgba(255,255,255,0.7)" style={{ marginLeft: '4px' }}>
                Optional Encryption Password
              </Typography>
            </Row>
            {/* make the input field placeholder text a little small and the text input box little darker */}
            <InputField
              colorMode="dark"
              type="password"
              placeholder="Leave blank for unencrypted"
              value={password}
              // style={{
              //   // backgroundColor: colorPalette.black[100],
              //   boxShadow: 'solid',
              //   borderRadius: '8px',
              //   borderColor: colorPalette.black[50],
              // }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>


            <ButtonWithIcon
              icon={Upload}
              iconSize={16}
              variant="primary"
              kind="elevated"
              colorMode="dark"
              onClick={handleImportClick}
              disabled={importing}
              style={{
                marginTop: 8,
                background: 'none',
                border: 'none',
                alignSelf: 'flex-start',
                maxWidth: 180,
              }}
              justifyContent="center"
              gap={8}
            >
              {importing ? 'Importing...' : 'Import Backup'}
            </ButtonWithIcon>

            <ButtonWithIcon
              icon={Download}
              iconSize={16}
              variant="secondary"
              kind="elevated"
              colorMode="dark"
              onClick={handleExport}
              disabled={importing || exporting}
              style={{
                marginTop: 8,
                background: 'none',
                border: 'none',
                alignSelf: 'flex-start',
                maxWidth: 180,
              }}
              justifyContent="center"
              gap={8}
            >
              {exporting ? 'Exporting...' : 'Export Backup'}
            </ButtonWithIcon>


            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".zip,application/zip"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </ElevatedCard>
    </ModalOverlay>
  );
}
