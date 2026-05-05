import styled, { keyframes } from 'styled-components';
import type { InsightsMessage as MessageType } from '@/hooks/useInsights';
import { InsightsToolCallBadge } from './InsightsToolCallBadge';

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const UserBubble = styled.div`
  align-self: flex-end;
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px 12px 2px 12px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const AssistantBubble = styled.div`
  align-self: flex-start;
  max-width: 90%;
  padding: 10px 14px;
  border-radius: 12px 12px 12px 2px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
`;

const ToolCallsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
`;

const Cursor = styled.span`
  animation: ${blink} 1s step-end infinite;
  color: rgba(255, 255, 255, 0.7);
`;

const MarkdownContent = styled.div`
  white-space: pre-wrap;

  strong { font-weight: 600; }
  em { font-style: italic; }

  code {
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 13px;
    font-family: monospace;
  }

  pre {
    background: rgba(255, 255, 255, 0.06);
    padding: 10px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 8px 0;
    code {
      background: none;
      padding: 0;
    }
  }

  ul, ol {
    padding-left: 20px;
    margin: 4px 0;
  }

  li {
    margin: 2px 0;
  }
`;

import React from 'react';

function parseInline(text: string): React.ReactNode[] {
  const regex = /(`[^`]+`|\*\*.+?\*\*|\*[^*]+\*)/g;
  const parts = text.split(regex);
  
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function SafeMarkdown({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return (
    <MarkdownContent>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const code = part.slice(3, -3).replace(/^.*\n/, '');
          return (
            <pre key={i}>
              <code>{code}</code>
            </pre>
          );
        }
        
        const lines = part.split('\n');
        const elements: React.ReactNode[] = [];
        let currentList: React.ReactNode[] = [];
        
        const flushList = () => {
          if (currentList.length > 0) {
            elements.push(<ul key={`ul-${i}-${elements.length}`}>{currentList}</ul>);
            currentList = [];
          }
        };

        lines.forEach((line, lineIndex) => {
          const listMatch = line.match(/^[-•]\s+(.+)$/);
          if (listMatch) {
            currentList.push(<li key={`li-${lineIndex}`}>{parseInline(listMatch[1])}</li>);
          } else {
            flushList();
            elements.push(
              <React.Fragment key={`line-${lineIndex}`}>
                {parseInline(line)}
                {lineIndex < lines.length - 1 ? '\n' : ''}
              </React.Fragment>
            );
          }
        });
        flushList();
        
        return <React.Fragment key={i}>{elements}</React.Fragment>;
      })}
    </MarkdownContent>
  );
}

export function InsightsMessageBubble({ message }: { message: MessageType }) {
  if (message.role === 'user') {
    return <UserBubble>{message.content}</UserBubble>;
  }

  return (
    <AssistantBubble>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <ToolCallsContainer data-testid="insights-tool-calls">
          {message.toolCalls.map((tc, i) => (
            <InsightsToolCallBadge key={i} toolCall={tc} />
          ))}
        </ToolCallsContainer>
      )}
      {message.content && <SafeMarkdown text={message.content} />}
      {message.isStreaming && <Cursor>{'█'}</Cursor>}
    </AssistantBubble>
  );
}
