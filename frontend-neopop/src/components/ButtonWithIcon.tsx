import { Button, Row, Typography } from '@cred/neopop-web/lib/components';
import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
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

type NeoPopRowProps = ComponentPropsWithoutRef<typeof Row>;

export type ButtonWithIconProps = NeoPopButtonPassthrough & {
  /** Lucide icon component rendered to the left of the label. */
  icon: LucideIcon;
  /** Icon width/height in pixels. */
  iconSize?: number;
  /** Extra attributes for the icon (e.g. `className` for animation). */
  iconProps?: Omit<React.ComponentPropsWithoutRef<LucideIcon>, 'size'>;
  /** Horizontal gap between icon and label (NeoPOP `Row` `gap`). */
  gap?: number;
  /** Flex alignment for the icon + label row (`Row.alignItems`). */
  alignItems?: NeoPopRowProps['alignItems'];
  /** Main-axis distribution for the icon + label row (`Row.justifyContent`). */
  justifyContent?: NeoPopRowProps['justifyContent'];
  /** Whether the icon + label row may wrap (`Row.flexWrap`). */
  flexWrap?: NeoPopRowProps['flexWrap'];
  /** Additional props for the inner NeoPOP `Row` (e.g. `style`, `className`). Applied after the props above; can override `gap` / alignment. */
  rowProps?: Omit<NeoPopRowProps, 'children'>;
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
  alignItems = 'center',
  justifyContent = 'space-around',
  flexWrap,
  rowProps,
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

  const { style: rowStyleOverride, ...rowRest } = rowProps ?? {};
  const rowStyle: CSSProperties = {
    columnGap: gap,
    rowGap: flexWrap === 'wrap' ? gap : undefined,
    ...rowStyleOverride,
  };

  return (
    <Button {...buttonProps}>
      <Row
        alignItems={alignItems}
        justifyContent={justifyContent}
        flexWrap={flexWrap}
        {...rowRest}
        style={rowStyle}
        data-bwi-gap={gap}
      >
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
