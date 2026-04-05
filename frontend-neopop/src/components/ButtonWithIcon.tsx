import { Button, Row, Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import type { LucideIcon } from 'lucide-react';

/**
 * Public props for NeoPOP `Button` (aligned with `@cred/neopop-web` Button types).
 * Used here because the app shim types `Button` as `ComponentType<any>`.
 */
type NeoPopButtonPassthrough = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  variant?: 'primary' | 'secondary';
  kind?: 'flat' | 'elevated' | 'link';
  size?: 'big' | 'medium' | 'small';
  colorMode?: 'dark' | 'light';
  showArrow?: boolean;
  fullWidth?: boolean;
};

type LabelTypographyOverrides = Partial<{
  fontType: FontType;
  fontSize: number;
  fontWeight: FontWeights;
  color: string;
  style: React.CSSProperties;
  as: 'p' | 'span';
}>;

export type ButtonWithIconProps = NeoPopButtonPassthrough & {
  /** Lucide icon component rendered to the left of the label. */
  icon: LucideIcon;
  /** Icon width/height in pixels. */
  iconSize?: number;
  /** Extra attributes for the icon (e.g. `className` for animation). */
  iconProps?: Omit<React.ComponentPropsWithoutRef<LucideIcon>, 'size'>;
  /** Horizontal gap between icon and label (NeoPOP `Row` `gap`). */
  gap?: number;
  /** Button label; rendered with NeoPOP `Typography` per project UI standards. */
  children: React.ReactNode;
  /** Optional overrides for label typography. */
  labelTypographyProps?: LabelTypographyOverrides;
};

/**
 * NeoPOP primary/secondary CTA with a Lucide icon on the left and typographic label on the right.
 * Uses `Button` + `Row` + `Typography` only (no custom button primitives).
 */
export function ButtonWithIcon({
  icon: Icon,
  iconSize = 14,
  iconProps,
  gap = 6,
  children,
  labelTypographyProps,
  ...buttonProps
}: ButtonWithIconProps) {
  const {
    fontType = FontType.BODY,
    fontSize = 14,
    fontWeight = FontWeights.MEDIUM,
    color,
    style: labelStyle,
    as,
  } = labelTypographyProps ?? {};

  return (
    <Button {...buttonProps}>
      <Row alignItems="center" justifyContent="space-around" gap={gap}>
        <Icon size={iconSize} aria-hidden {...iconProps} />
        <Typography
          as={as}
          fontType={fontType}
          fontSize={fontSize}
          fontWeight={fontWeight}
          color={color ?? 'inherit'}
          style={{ lineHeight: 1.2, ...labelStyle }}
        >
          {children}
        </Typography>
      </Row>
    </Button>
  );
}
