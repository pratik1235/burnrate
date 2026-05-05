import styled, { keyframes } from 'styled-components';
import type { ToolCallInfo } from '@/hooks/useInsights';

const TOOL_LABELS: Record<string, string> = {
  query_transactions: 'Queried transactions',
  get_spend_summary: 'Fetched spend summary',
  get_category_breakdown: 'Fetched category breakdown',
  get_monthly_trends: 'Fetched monthly trends',
  get_top_merchants: 'Fetched top merchants',
  list_cards: 'Fetched cards',
  get_categories: 'Fetched categories',
  get_statement_periods: 'Fetched statement periods',
};

const TOOL_LOADING_LABELS: Record<string, string> = {
  query_transactions: 'Querying transactions',
  get_spend_summary: 'Fetching spend summary',
  get_category_breakdown: 'Fetching category breakdown',
  get_monthly_trends: 'Fetching monthly trends',
  get_top_merchants: 'Fetching top merchants',
  list_cards: 'Fetching cards',
  get_categories: 'Fetching categories',
  get_statement_periods: 'Fetching statement periods',
};

const pulse = keyframes`
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
`;

const Badge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
`;

const Dots = styled.span`
  & > span {
    animation: ${pulse} 1.4s infinite;
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
`;

export function InsightsToolCallBadge({ toolCall }: { toolCall: ToolCallInfo }) {
  const label = toolCall.loading
    ? TOOL_LOADING_LABELS[toolCall.name] || toolCall.name
    : TOOL_LABELS[toolCall.name] || toolCall.name;

  const summary = !toolCall.loading && toolCall.summary ? ` — ${toolCall.summary}` : '';

  return (
    <Badge>
      <span style={{ fontSize: 10 }}>{toolCall.loading ? '▸' : '▸'}</span>
      {label}
      {summary}
      {toolCall.loading && (
        <Dots>
          <span>.</span><span>.</span><span>.</span>
        </Dots>
      )}
    </Badge>
  );
}
