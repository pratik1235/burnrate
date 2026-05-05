import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { List, Send, Trash2, X, Lightbulb } from 'lucide-react';
import { Typography } from '@cred/neopop-web/lib/components';
import { mainColors, colorPalette } from '@cred/neopop-web/lib/primitives';
import { useInsights } from '@/hooks/useInsights';
import { InsightsMessageBubble } from './InsightsMessage';
import { InsightsSessionList } from './InsightsSessionList';

const Overlay = styled.div<{ $open: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  z-index: 200;
  pointer-events: ${(p) => (p.$open ? 'auto' : 'none')};
`;

const Panel = styled.div<{ $open: boolean }>`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  background: #111111;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  transform: translateX(${(p) => (p.$open ? '0' : '100%')});
  transition: transform 0.2s ease;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
`;

const HeaderTitle = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const IconBtn = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  padding: 6px;
  display: flex;
  border-radius: 6px;
  &:hover { color: ${mainColors.white}; background: rgba(255, 255, 255, 0.06); }
`;

const MessageArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 40px 24px;
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SuggestedGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 0 16px 16px;
`;

const SuggestedCard = styled.button`
  text-align: left;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
  }
`;

const InputArea = styled.div`
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 8px;
  flex-shrink: 0;
`;

const Input = styled.input`
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px 14px;
  color: ${mainColors.white};
  font-size: 14px;
  outline: none;
  &::placeholder { color: rgba(255, 255, 255, 0.3); }
  &:focus { border-color: rgba(255, 255, 255, 0.15); }
`;

const SendBtn = styled.button<{ $active: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: ${(p) => (p.$active ? colorPalette.rss[500] : 'rgba(255,255,255,0.06)')};
  color: ${(p) => (p.$active ? '#fff' : 'rgba(255,255,255,0.3)')};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${(p) => (p.$active ? 'pointer' : 'default')};
  flex-shrink: 0;
  transition: background 0.15s;
`;

const ErrorBar = styled.div`
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.1);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
  font-size: 13px;
`;

const SUGGESTED_QUERIES = [
  'How much did I spend this month?',
  'What are my top merchants?',
  'Compare this month vs last month',
  'Which category has the highest spend?',
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InsightsPanel({ open, onClose }: Props) {
  const {
    messages,
    isStreaming,
    sessions,
    error,
    sendMessage,
    loadSession,
    newSession,
    deleteSession,
    refreshSessions,
  } = useInsights();

  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    sendMessage(trimmed);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggested = useCallback(
    (q: string) => {
      sendMessage(q);
    },
    [sendMessage],
  );

  const handleSessionSelect = useCallback(
    (id: string) => {
      loadSession(id);
      setShowSessions(false);
    },
    [loadSession],
  );

  const handleNewSession = useCallback(() => {
    newSession();
    setShowSessions(false);
  }, [newSession]);

  const handleShowSessions = useCallback(() => {
    refreshSessions();
    setShowSessions(true);
  }, [refreshSessions]);

  if (!open) return null;

  const portal = (
    <Overlay $open={open} data-testid="insights-panel">
      <Panel $open={open}>
        {showSessions ? (
          <InsightsSessionList
            sessions={sessions}
            onSelect={handleSessionSelect}
            onDelete={deleteSession}
            onNew={handleNewSession}
            onClose={() => setShowSessions(false)}
          />
        ) : (
          <>
            <PanelHeader>
              <HeaderTitle>
                <Lightbulb size={18} color={colorPalette.rss[500]} />
                <Typography color={mainColors.white} fontSize={16} fontWeight={600}>
                  Insights
                </Typography>
              </HeaderTitle>
              <IconBtn onClick={handleShowSessions} aria-label="Session list">
                <List size={18} />
              </IconBtn>
              {messages.length > 0 && (
                <IconBtn onClick={newSession} aria-label="New conversation">
                  <Trash2 size={16} />
                </IconBtn>
              )}
              <IconBtn onClick={onClose} data-testid="insights-close" aria-label="Close">
                <X size={18} />
              </IconBtn>
            </PanelHeader>

            {error && <ErrorBar>{error}</ErrorBar>}

            {messages.length === 0 ? (
              <>
                <EmptyState>
                  <EmptyIcon>
                    <Lightbulb size={28} color={colorPalette.rss[500]} />
                  </EmptyIcon>
                  <div style={{ textAlign: 'center' }}>
                    <Typography color={mainColors.white} fontSize={16} fontWeight={600}>
                      Insights
                    </Typography>
                    <Typography color="rgba(255,255,255,0.4)" fontSize={14}>
                      Ask anything about your spending
                    </Typography>
                  </div>
                </EmptyState>
                <SuggestedGrid>
                  {SUGGESTED_QUERIES.map((q) => (
                    <SuggestedCard key={q} onClick={() => handleSuggested(q)}>
                      {q}
                    </SuggestedCard>
                  ))}
                </SuggestedGrid>
              </>
            ) : (
              <MessageArea>
                {messages.map((m) => (
                  <InsightsMessageBubble key={m.id} message={m} />
                ))}
                <div ref={messageEndRef} />
              </MessageArea>
            )}

            <InputArea>
              <Input
                data-testid="insights-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={messages.length > 0 ? 'Ask a follow-up...' : 'Ask about your spending...'}
                disabled={isStreaming}
              />
              <SendBtn $active={!!input.trim() && !isStreaming} onClick={handleSend}>
                <Send size={18} />
              </SendBtn>
            </InputArea>
          </>
        )}
      </Panel>
    </Overlay>
  );

  return createPortal(portal, document.body);
}
