import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
import { ButtonWithIcon, type ButtonWithIconProps } from '@/components/ButtonWithIcon';
import { Upload, Plus, RefreshCw } from 'lucide-react';
import { flexAlignItemsOptions, flexJustifyContentOptions, flexWrapOptions } from '@/stories/storyControls';

const ICON_MAP = {
  upload: Upload,
  plus: Plus,
  refresh: RefreshCw,
} as const;

type IconKey = keyof typeof ICON_MAP;

type StoryArgs = Omit<ButtonWithIconProps, 'icon' | 'children'> & {
  children: string;
  iconKey: IconKey;
  labelFontType?: FontType;
  labelFontSize?: number;
  labelFontWeight?: FontWeights;
  labelColor?: string;
  labelAs?: 'p' | 'span';
};

const fontWeightOptions = [
  FontWeights.THIN,
  FontWeights.REGULAR,
  FontWeights.MEDIUM,
  FontWeights.SEMI_BOLD,
  FontWeights.BOLD,
  FontWeights.EXTRA_BOLD,
] as const;

function renderButtonWithIcon(args: StoryArgs) {
  const {
    iconKey,
    labelFontType,
    labelFontSize,
    labelFontWeight,
    labelColor,
    labelAs,
    children,
    ...rest
  } = args;

  const fromControls: ButtonWithIconProps['labelTypographyProps'] = {
    ...(labelFontType != null ? { fontType: labelFontType } : {}),
    ...(labelFontSize != null ? { fontSize: labelFontSize } : {}),
    ...(labelFontWeight != null ? { fontWeight: labelFontWeight } : {}),
    ...(labelColor != null && labelColor !== '' ? { color: labelColor } : {}),
    ...(labelAs != null ? { as: labelAs } : {}),
  };

  const labelTypographyProps =
    Object.keys(fromControls).length > 0 || args.labelTypographyProps
      ? { ...fromControls, ...args.labelTypographyProps }
      : undefined;

  return (
    <ButtonWithIcon {...rest} icon={ICON_MAP[iconKey]} labelTypographyProps={labelTypographyProps}>
      {children}
    </ButtonWithIcon>
  );
}

const meta = {
  title: 'NeoPOP/ButtonWithIcon',
  component: ButtonWithIcon,
  parameters: { layout: 'centered' },
  argTypes: {
    iconKey: {
      control: 'select',
      options: Object.keys(ICON_MAP) as IconKey[],
      description: 'Lucide icon (story-only control)',
    },
    children: { control: 'text' },
    variant: { control: 'select', options: ['primary', 'secondary'] },
    kind: { control: 'select', options: ['elevated', 'flat', 'link'] },
    size: { control: 'select', options: ['big', 'medium', 'small'] },
    colorMode: { control: 'select', options: ['dark', 'light'] },
    showArrow: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
    disabled: { control: 'boolean' },
    gap: { control: { type: 'number', min: 0, max: 32, step: 1 } },
    iconSize: { control: { type: 'number', min: 8, max: 48, step: 1 } },
    alignItems: { control: 'select', options: flexAlignItemsOptions },
    justifyContent: { control: 'select', options: flexJustifyContentOptions },
    flexWrap: { control: 'select', options: [...flexWrapOptions] },
    rowProps: { control: 'object', description: 'Forwarded to NeoPOP `Row` (overrides gap/alignment when set)' },
    iconProps: { control: 'object' },
    labelTypographyProps: { control: 'object', description: 'Raw `labelTypographyProps` (merged with labelFont* below if both set)' },
    labelFontType: { control: 'select', options: Object.values(FontType) },
    labelFontSize: { control: { type: 'number', min: 8, max: 32, step: 1 } },
    labelFontWeight: { control: 'select', options: [...fontWeightOptions] },
    labelColor: { control: 'color' },
    labelAs: { control: 'select', options: ['p', 'span'] },
    type: { control: 'select', options: ['button', 'submit', 'reset'] },
    onClick: { action: 'clicked' },
  },
  args: {
    children: 'Upload PDF',
    iconKey: 'upload',
    gap: 6,
    iconSize: 14,
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
    colorMode: 'dark',
    alignItems: 'center',
    justifyContent: 'space-around',
    showArrow: false,
    fullWidth: false,
    disabled: false,
    type: 'button',
    onClick: fn(),
    iconProps: {},
    rowProps: {},
    labelTypographyProps: undefined,
    labelFontType: FontType.BODY,
    labelFontSize: 14,
    labelFontWeight: FontWeights.MEDIUM,
    labelColor: undefined,
    labelAs: undefined,
  },
  render: (args: StoryArgs) => renderButtonWithIcon(args),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  name: 'Playground',
};

const spinStyle = (
  <style>{`@keyframes storybook-button-with-icon-spin { to { transform: rotate(360deg); } }`}</style>
);

export const Primary: Story = {
  name: 'Primary',
  args: {
    children: 'Upload PDF',
    iconKey: 'upload',
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
  },
};

export const SecondarySmall: Story = {
  name: 'Secondary small',
  args: {
    children: 'Add offer',
    iconKey: 'plus',
    variant: 'secondary',
    kind: 'elevated',
    size: 'small',
  },
};

export const AnimatedIcon: Story = {
  name: 'Animated icon',
  render: (args: StoryArgs) => (
    <>
      {spinStyle}
      {renderButtonWithIcon({
        ...args,
        iconKey: 'refresh',
        children: 'Sync in progress',
        iconProps: {
          style: { animation: 'storybook-button-with-icon-spin 1s linear infinite' },
        },
      })}
    </>
  ),
  args: {
    children: 'Sync in progress',
    iconKey: 'refresh',
    variant: 'primary',
    kind: 'elevated',
    size: 'medium',
    iconProps: {
      style: { animation: 'storybook-button-with-icon-spin 1s linear infinite' },
    },
  },
};
