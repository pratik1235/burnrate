/* eslint-disable react-refresh/only-export-components */
import type { ComponentProps, CSSProperties } from 'react';
import styled from 'styled-components';
import { ElevatedCard as NeoElevatedCard } from '@cred/neopop-web/lib/components';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';

/**
 * NeoPOP `ElevatedCard` sets `user-select: none` on its outer shell; that value
 * inherits and blocks selecting `Typography` inside the card. This inner layer
 * restores text selection for financial copy (see CONSTITUTION §1.3 transparency).
 */
const SelectableCardBody = styled.div`
  width: 100%;
  -webkit-user-select: text;
  user-select: text;
`;

/** Default RSS plunk edges (matches bulk upload summary card). */
export const DEFAULT_ELEVATED_CARD_EDGE_COLORS = {
  bottom: colorPalette.rss[600],
  right: colorPalette.rss[800],
} as const;

/** Use with `edgeColors` to keep NeoPOP’s original transparent edges. */
export const TRANSPARENT_ELEVATED_CARD_EDGES: { bottom: string; right: string } = {
  bottom: 'transparent',
  right: 'transparent',
};

export const DEFAULT_ELEVATED_CARD_STYLE: CSSProperties = {
  padding: 16,
  width: '100%',
  maxWidth: 520,
  maxHeight: 'min(72vh, 640px)',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: mainColors.black,
};

type Props = ComponentProps<typeof NeoElevatedCard>;

export function SelectableElevatedCard({ children, edgeColors, style, ...rest }: Props) {
  const mergedEdgeColors = {
    ...DEFAULT_ELEVATED_CARD_EDGE_COLORS,
    ...(edgeColors ?? {}),
  };
  const mergedStyle: CSSProperties = {
    ...DEFAULT_ELEVATED_CARD_STYLE,
    ...style,
  };
  return (
    <NeoElevatedCard edgeColors={mergedEdgeColors} style={mergedStyle} {...rest}>
      <SelectableCardBody>{children}</SelectableCardBody>
    </NeoElevatedCard>
  );
}
