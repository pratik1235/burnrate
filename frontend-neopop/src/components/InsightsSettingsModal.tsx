import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { AlertTriangle, X, Check, Loader2 } from 'lucide-react';
import { Typography } from '@cred/neopop-web/lib/components';
import { mainColors, colorPalette } from '@cred/neopop-web/lib/primitives';
import { api } from '@/lib/api';
import {
  getInsightsModels,
  getInsightsStatus,
  testInsightsConnection,
  saveApiKey,
  deleteApiKey,
  getApiKeyStatus,
  saveAwsCredentials,
  deleteAwsCredentials,
  getAwsCredentialsStatus,
} from '@/lib/insightsApi';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  width: 480px;
  max-height: 80vh;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 4px;
  display: flex;
  &:hover { color: ${mainColors.white}; }
`;

const Body = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Label = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
`;

const ProviderGrid = styled.div`
  display: flex;
  gap: 10px;
`;

const ProviderCard = styled.button<{ $selected: boolean; $disabled?: boolean }>`
  flex: 1;
  padding: 14px 12px;
  border-radius: 10px;
  border: 1px solid ${(p) => (p.$selected ? colorPalette.rss[500] : 'rgba(255,255,255,0.08)')};
  background: ${(p) => (p.$selected ? 'rgba(249,115,22,0.08)' : 'transparent')};
  color: ${(p) => (p.$disabled ? 'rgba(255,255,255,0.25)' : mainColors.white)};
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  text-align: center;
  font-size: 14px;
  transition: border-color 0.15s, background 0.15s;
  &:hover:not(:disabled) {
    background: ${(p) => (!p.$disabled && !p.$selected ? 'rgba(255,255,255,0.04)' : undefined)};
  }
`;

const ProviderLabel = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 4px;
`;

const InputField = styled.input`
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  color: ${mainColors.white};
  font-size: 14px;
  outline: none;
  &:focus { border-color: rgba(255, 255, 255, 0.15); }
  &::placeholder { color: rgba(255, 255, 255, 0.3); }
`;

const Select = styled.select`
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  color: ${mainColors.white};
  font-size: 14px;
  outline: none;
  &:focus { border-color: rgba(255, 255, 255, 0.15); }
  option { background: #1a1a1a; color: ${mainColors.white}; }
`;

const StatusLine = styled.div<{ $ok: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${(p) => (p.$ok ? '#10b981' : '#ef4444')};
`;

const Dot = styled.span<{ $ok: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p) => (p.$ok ? '#10b981' : '#ef4444')};
`;

const WarningBox = styled.div`
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid ${colorPalette.rss[500]};
  background: rgba(249, 115, 22, 0.06);
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

const Btn = styled.button<{ $primary?: boolean }>`
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid ${(p) => (p.$primary ? colorPalette.rss[500] : 'rgba(255,255,255,0.1)')};
  background: ${(p) => (p.$primary ? colorPalette.rss[500] : 'transparent')};
  color: ${(p) => (p.$primary ? '#fff' : 'rgba(255,255,255,0.7)')};
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

type Provider = 'ollama' | 'anthropic' | 'openai' | 'bedrock';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InsightsSettingsModal({ open, onClose }: Props) {
  const [provider, setProvider] = useState<Provider>('ollama');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ provider: Provider; success: boolean; latency_ms?: number; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  // AWS Bedrock credentials
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [awsConfigured, setAwsConfigured] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const status = await getInsightsStatus();
        setProvider((status.provider as Provider) || 'ollama');
        setModel(status.model || '');
        setConnected(status.connected);
        setModels(status.available_models || []);
      } catch { /* ignore */ }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (provider === 'anthropic' || provider === 'openai') {
      getApiKeyStatus(provider).then((s) => setApiKeyConfigured(s.configured)).catch(() => {});
    } else if (provider === 'bedrock') {
      getAwsCredentialsStatus().then((s) => setAwsConfigured(s.configured)).catch(() => {});
    }
  }, [open, provider]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const testParams: any = {
        provider: provider,
        model: model || undefined,
      };

      // For cloud providers, include API key if entered but not saved
      if (provider === 'anthropic' || provider === 'openai') {
        if (apiKey) {
          testParams.api_key = apiKey;
        }
      } else if (provider === 'bedrock') {
        if (awsAccessKey && awsSecretKey) {
          testParams.aws_access_key = awsAccessKey;
          testParams.aws_secret_key = awsSecretKey;
        }
      }

      const result = await testInsightsConnection(testParams);
      setTestResult({ ...result, provider });
      if (result.success) {
        setConnected(true);
        const m = await getInsightsModels();
        setModels(m.models || []);
      }
    } catch (e) {
      setTestResult({ provider, success: false, error: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setTesting(false);
    }
  }, [provider, model, apiKey, awsAccessKey, awsSecretKey]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.put('/settings', { llm_provider: provider, llm_model: model });

      // Save API keys for Anthropic/OpenAI
      if ((provider === 'anthropic' || provider === 'openai') && apiKey) {
        await saveApiKey(provider, apiKey);
      }

      // Save AWS credentials for Bedrock
      if (provider === 'bedrock' && awsAccessKey && awsSecretKey) {
        await saveAwsCredentials(awsAccessKey, awsSecretKey, awsRegion);
      }

      onClose();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }, [provider, model, apiKey, awsAccessKey, awsSecretKey, awsRegion, onClose]);

  const handleDeleteKey = useCallback(async () => {
    try {
      if (provider === 'anthropic' || provider === 'openai') {
        await deleteApiKey(provider);
        setApiKeyConfigured(false);
        setApiKey('');
      } else if (provider === 'bedrock') {
        await deleteAwsCredentials();
        setAwsConfigured(false);
        setAwsAccessKey('');
        setAwsSecretKey('');
      }
    } catch { /* ignore */ }
  }, [provider]);

  if (!open) return null;

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setTestResult(null);
    setConnected(false);
  };

  return createPortal(
    <Backdrop onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <Typography color={mainColors.white} fontSize={18} fontWeight={600}>
            LLM Insights Settings
          </Typography>
          <CloseBtn onClick={onClose}><X size={18} /></CloseBtn>
        </ModalHeader>

        <Body>
          <div>
            <Label>Provider</Label>
            <ProviderGrid>
              <ProviderCard $selected={provider === 'ollama'} onClick={() => handleProviderChange('ollama')}>
                Ollama
                <ProviderLabel>Local</ProviderLabel>
              </ProviderCard>
              <ProviderCard $selected={provider === 'anthropic'} onClick={() => handleProviderChange('anthropic')}>
                Claude
                <ProviderLabel>Cloud</ProviderLabel>
              </ProviderCard>
              <ProviderCard $selected={provider === 'openai'} onClick={() => handleProviderChange('openai')}>
                OpenAI
                <ProviderLabel>Cloud</ProviderLabel>
              </ProviderCard>
              <ProviderCard $selected={provider === 'bedrock'} onClick={() => handleProviderChange('bedrock')}>
                AWS Bedrock
                <ProviderLabel>Cloud</ProviderLabel>
              </ProviderCard>
            </ProviderGrid>
          </div>

          {provider === 'ollama' && (
            <>
              <div>
                <Label>Model</Label>
                {models.length > 0 ? (
                  <Select value={model} onChange={(e) => setModel(e.target.value)}>
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                ) : (
                  <InputField
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="llama3.1"
                  />
                )}
              </div>

              <StatusLine $ok={connected}>
                <Dot $ok={connected} />
                {connected ? 'Connected' : 'Not connected'}
              </StatusLine>
            </>
          )}

          {(provider === 'anthropic' || provider === 'openai') && (
            <>
              <WarningBox>
                <AlertTriangle size={18} color={colorPalette.rss[500]} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Cloud providers send your transaction data (merchant names, amounts, dates) to
                  external servers for processing.
                </span>
              </WarningBox>
              <div>
                <Label>API Key {apiKeyConfigured && '(configured)'}</Label>
                <InputField
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={apiKeyConfigured ? '••••••••••••' : 'sk-...'}
                  autoComplete="off"
                />
              </div>
              {apiKeyConfigured && (
                <Btn onClick={handleDeleteKey} style={{ alignSelf: 'flex-start' }}>
                  Remove Key
                </Btn>
              )}
            </>
          )}

          {provider === 'bedrock' && (
            <>
              <WarningBox>
                <AlertTriangle size={18} color={colorPalette.rss[500]} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  AWS Bedrock processes requests in your configured AWS region. Transaction data
                  (merchant names, amounts, dates) will be sent to AWS for processing.
                </span>
              </WarningBox>
              <div>
                <Label>AWS Access Key ID {awsConfigured && '(configured)'}</Label>
                <InputField
                  type="password"
                  value={awsAccessKey}
                  onChange={(e) => setAwsAccessKey(e.target.value)}
                  placeholder={awsConfigured ? '••••••••••••' : 'AKIA...'}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>AWS Secret Access Key</Label>
                <InputField
                  type="password"
                  value={awsSecretKey}
                  onChange={(e) => setAwsSecretKey(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>AWS Region</Label>
                <InputField
                  type="text"
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  placeholder="us-east-1"
                />
              </div>
              <Typography color="rgba(255,255,255,0.6)" fontSize={12} style={{ marginTop: -8 }}>
                AWS Bedrock credentials can also be configured via AWS SSO or environment variables.
              </Typography>
              {awsConfigured && (
                <Btn onClick={handleDeleteKey} style={{ alignSelf: 'flex-start' }}>
                  Remove Credentials
                </Btn>
              )}
            </>
          )}

          {testResult && testResult.provider === provider && (
            <StatusLine $ok={testResult.success}>
              <Dot $ok={testResult.success} />
              {testResult.success
                ? `Connected (${testResult.latency_ms}ms)`
                : `Failed: ${testResult.error}`}
            </StatusLine>
          )}

          <ButtonRow>
            <Btn onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              Test Connection
            </Btn>
            <Btn $primary onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              Save
            </Btn>
          </ButtonRow>
        </Body>
      </Modal>
    </Backdrop>,
    document.body,
  );
}
