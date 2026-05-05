import styled from 'styled-components';
import { Plus, Trash2, X } from 'lucide-react';
import { Typography } from '@cred/neopop-web/lib/components';
import { mainColors, colorPalette } from '@cred/neopop-web/lib/primitives';
import type { ChatSessionSummary } from '@/lib/insightsApi';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
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

const NewBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  margin: 12px 16px;
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  background: transparent;
  color: ${colorPalette.rss[500]};
  font-size: 14px;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, 0.04); }
`;

const SessionsList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
`;

const DateGroup = styled.div`
  margin-top: 16px;
`;

const DateLabel = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-left: 4px;
`;

const SessionCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
  &:hover { background: rgba(255, 255, 255, 0.04); }
`;

const SessionInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const SessionTitle = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SessionMeta = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 2px;
`;

const DeleteBtn = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.2);
  cursor: pointer;
  padding: 4px;
  flex-shrink: 0;
  &:hover { color: #ef4444; }
`;

function groupByDate(sessions: ChatSessionSummary[]) {
  const groups: { label: string; items: ChatSessionSummary[] }[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const map = new Map<string, ChatSessionSummary[]>();

  for (const s of sessions) {
    const d = new Date(s.updated_at).toDateString();
    let label: string;
    if (d === today) label = 'Today';
    else if (d === yesterday) label = 'Yesterday';
    else label = new Date(s.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(s);
  }

  for (const [label, items] of map) {
    groups.push({ label, items });
  }
  return groups;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface Props {
  sessions: ChatSessionSummary[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}

export function InsightsSessionList({ sessions, onSelect, onDelete, onNew, onClose }: Props) {
  const groups = groupByDate(sessions);

  return (
    <Container>
      <Header>
        <Typography color={mainColors.white} fontSize={16} fontWeight={600}>
          Sessions
        </Typography>
        <CloseBtn onClick={onClose}><X size={18} /></CloseBtn>
      </Header>

      <NewBtn onClick={onNew}>
        <Plus size={16} />
        New conversation
      </NewBtn>

      <SessionsList>
        {groups.map((g) => (
          <DateGroup key={g.label}>
            <DateLabel>{g.label}</DateLabel>
            {g.items.map((s) => (
              <SessionCard key={s.id} onClick={() => onSelect(s.id)}>
                <SessionInfo>
                  <SessionTitle>{s.title || 'Untitled'}</SessionTitle>
                  <SessionMeta>
                    {s.message_count} messages &middot; {formatTime(s.updated_at)}
                  </SessionMeta>
                </SessionInfo>
                <DeleteBtn
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  aria-label="Delete session"
                >
                  <Trash2 size={14} />
                </DeleteBtn>
              </SessionCard>
            ))}
          </DateGroup>
        ))}
        {sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
            No conversations yet
          </div>
        )}
      </SessionsList>
    </Container>
  );
}
