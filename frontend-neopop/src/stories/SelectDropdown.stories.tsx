import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useEffect, useState } from 'react';
import { colorPalette, mainColors } from '@cred/neopop-web/lib/primitives';
import {
  SelectDropdown,
  type SelectDropdownOption,
  type SelectDropdownProps,
} from '@/components/SelectDropdown';

const SAMPLE_OPTIONS: SelectDropdownOption[] = [
  { value: 'inr', label: 'INR — Indian Rupee' },
  { value: 'usd', label: 'USD — US Dollar' },
  { value: 'eur', label: 'EUR — Euro' },
  { value: 'gbp', label: 'GBP — Pound Sterling' },
  { value: 'jpy', label: 'JPY — Japanese Yen' },
];

type StoryArgs = Omit<
  SelectDropdownProps,
  'colorConfig' | 'margin' | 'padding' | 'menuEdgeColors'
> & {
  /** Maps to NeoPOP `Dropdown` `colorConfig.border` (trigger outline). */
  triggerBorderColor?: string;
  /** Maps to NeoPOP `Dropdown` `colorConfig.text` (trigger label). */
  triggerTextColor?: string;
  /**
   * Maps to NeoPOP `Dropdown` `colorConfig.chevron` (NeoPOP chevron glyph color).
   * The shape is fixed by NeoPOP `Chevron`; only color is configurable.
   */
  triggerChevronColor?: string;
  /** CSS `margin` string for the outer wrapper (e.g. `12px`, `8px 0`). */
  marginCss?: string;
  /** CSS `padding` string for the outer wrapper. */
  paddingCss?: string;
  /** ElevatedCard menu edge — bottom highlight. */
  menuEdgeBottom?: string;
  /** ElevatedCard menu edge — right highlight. */
  menuEdgeRight?: string;
};

/** Mirrors Storybook `value` control while still updating the trigger after in-canvas picks. */
function StatefulSelectDropdown(props: SelectDropdownProps) {
  const [value, setValue] = useState(props.value);
  useEffect(() => {
    setValue(props.value);
  }, [props.value]);

  return (
    <SelectDropdown
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        props.onChange?.(v);
      }}
    />
  );
}

function buildStoryProps(args: StoryArgs): SelectDropdownProps {
  const {
    triggerBorderColor,
    triggerTextColor,
    triggerChevronColor,
    marginCss,
    paddingCss,
    menuEdgeBottom,
    menuEdgeRight,
    ...rest
  } = args;

  const colorConfig =
    triggerBorderColor || triggerTextColor || triggerChevronColor
      ? {
          ...(triggerBorderColor ? { border: triggerBorderColor } : {}),
          ...(triggerTextColor ? { text: triggerTextColor } : {}),
          ...(triggerChevronColor ? { chevron: triggerChevronColor } : {}),
        }
      : undefined;

  const menuEdgeColors =
    menuEdgeBottom != null && menuEdgeBottom !== '' && menuEdgeRight != null && menuEdgeRight !== ''
      ? { bottom: menuEdgeBottom, right: menuEdgeRight }
      : undefined;

  return {
    ...rest,
    margin: marginCss === '' ? undefined : marginCss,
    padding: paddingCss === '' ? undefined : paddingCss,
    colorConfig,
    menuEdgeColors,
  };
}

const meta = {
  title: 'NeoPOP/SelectDropdown',
  component: SelectDropdown,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'NeoPOP `Dropdown` trigger plus `ElevatedCard` menu. Trigger border, label, and chevron colors map to NeoPOP `colorConfig`; chevron geometry comes from NeoPOP `Chevron` (not swappable for a Lucide icon without replacing the trigger primitive).',
      },
    },
  },
  argTypes: {
    options: { control: 'object', description: 'Menu entries `{ value, label }[]`' },
    value: { control: 'text' },
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    colorMode: { control: 'select', options: ['dark', 'light'] },
    triggerBorderColor: { control: 'color' },
    triggerTextColor: { control: 'color' },
    triggerChevronColor: { control: 'color' },
    marginCss: {
      control: 'text',
      description: 'Outer wrapper CSS margin (e.g. `16px`, `8px 12px`)',
    },
    paddingCss: {
      control: 'text',
      description: 'Outer wrapper CSS padding',
    },
    wrapperStyle: { control: 'object', description: 'Forwarded as `style` on outer wrapper (after margin/padding)' },
    className: { control: 'text' },
    menuOffset: { control: { type: 'number', min: 0, max: 32, step: 1 } },
    menuBackgroundColor: { control: 'color' },
    menuEdgeBottom: { control: 'color' },
    menuEdgeRight: { control: 'color' },
    menuMinWidth: {
      control: { type: 'number', min: 120, max: 480, step: 4 },
      description: 'Optional min-width (px); leave 0 to use full trigger width only',
    },
    menuMaxHeight: {
      control: { type: 'number', min: 120, max: 400, step: 4 },
      description: 'Max height (px) before scroll',
    },
    onChange: { action: 'change' },
  },
  args: {
    options: SAMPLE_OPTIONS,
    value: undefined,
    placeholder: 'Currency',
    disabled: false,
    colorMode: 'dark',
    triggerBorderColor: 'rgba(255,255,255,0.2)',
    triggerTextColor: mainColors.white,
    triggerChevronColor: 'rgba(255,255,255,0.5)',
    marginCss: '',
    paddingCss: '',
    wrapperStyle: {},
    className: undefined,
    menuOffset: 6,
    menuBackgroundColor: colorPalette.popBlack[200],
    menuEdgeBottom: colorPalette.rss[700],
    menuEdgeRight: colorPalette.rss[800],
    menuMinWidth: 0,
    menuMaxHeight: 280,
    onChange: fn(),
  },
  render: (args: StoryArgs) => {
    const props = buildStoryProps(args);
    const rawMin = args.menuMinWidth;
    const menuMinWidth =
      typeof rawMin === 'number' && rawMin > 0 ? rawMin : undefined;
    return <StatefulSelectDropdown {...props} menuMinWidth={menuMinWidth} />;
  },
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  name: 'Playground',
};

export const WithValue: Story = {
  name: 'With selection',
  args: {
    value: 'eur',
  },
};

export const Disabled: Story = {
  args: {
    value: 'inr',
    disabled: true,
  },
};

export const LightTrigger: Story = {
  name: 'Light color mode',
  args: {
    colorMode: 'light',
    value: 'usd',
  },
};

export const PaddedLayout: Story = {
  name: 'Margin & padding',
  args: {
    marginCss: '24px',
    paddingCss: '16px',
    wrapperStyle: {
      background: colorPalette.popBlack[400],
      borderRadius: 8,
    },
  },
};

export const TallMenu: Story = {
  name: 'Scrollable menu',
  args: {
    menuMaxHeight: 140,
    options: [
      ...SAMPLE_OPTIONS,
      { value: 'chf', label: 'CHF — Swiss Franc' },
      { value: 'aud', label: 'AUD — Australian Dollar' },
      { value: 'cad', label: 'CAD — Canadian Dollar' },
      { value: 'sek', label: 'SEK — Swedish Krona' },
    ],
  },
};
