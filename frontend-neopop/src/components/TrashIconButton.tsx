import { forwardRef } from 'react';
import { Trash2 } from 'lucide-react';
import { mainColors } from '@cred/neopop-web/lib/primitives';
import styled from 'styled-components';

const Root = styled.button`
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  border: 1px solid rgba(238, 77, 55, 0.45);
  border-radius: 8px;
  background: rgba(238, 77, 55, 0.12);
  color: ${mainColors.red};
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(238, 77, 55, 0.22);
    border-color: rgba(238, 77, 55, 0.65);
    color: ${mainColors.red};
  }

  &:active:not(:disabled) {
    background: rgba(238, 77, 55, 0.28);
  }

  &:focus-visible {
    outline: 2px solid ${mainColors.red};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

export type TrashIconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & {
  'aria-label': string;
  /** Lucide icon size in px; default 16 */
  iconSize?: number;
};

export const TrashIconButton = forwardRef<HTMLButtonElement, TrashIconButtonProps>(function TrashIconButton(
  { iconSize = 16, className, style, ...rest },
  ref,
) {
  return (
    <Root ref={ref} type="button" className={className} style={style} {...rest}>
      <Trash2 size={iconSize} strokeWidth={2} aria-hidden focusable={false} />
    </Root>
  );
});
