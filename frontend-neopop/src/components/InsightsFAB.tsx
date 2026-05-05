import styled from 'styled-components';
import { Lightbulb } from 'lucide-react';
import { colorPalette } from '@cred/neopop-web/lib/primitives';

const Fab = styled.button`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: ${colorPalette.rss[500]};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
  }

  &:active {
    transform: scale(0.96);
  }
`;

export function InsightsFAB({ onClick }: { onClick: () => void }) {
  return (
    <Fab onClick={onClick} data-testid="insights-fab" aria-label="Open Insights">
      <Lightbulb size={22} />
    </Fab>
  );
}
