import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import styled from 'styled-components';
import { Typography } from '@cred/neopop-web/lib/components';
import { FontType, FontWeights } from '@cred/neopop-web/lib/components/Typography/types';
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
  const [internal, setInternal] = useState<string | undefined>(undefined);
  const value = props.value !== undefined ? props.value : internal;

  return (
    <SelectDropdown
      {...props}
      value={value}
      onChange={(v) => {
        if (props.value === undefined) setInternal(v);
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
  args: {
    triggerBorderColor: "rgba(86, 20, 20, 0.2)",
    triggerTextColor: "#09100b",
    triggerChevronColor: "rgba(0, 0, 0, 0.5)"
  },

  name: 'Playground'
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
    triggerBorderColor: "rgba(9, 1, 1, 0.2)",
    triggerTextColor: "#000000",
    triggerChevronColor: "rgba(177, 28, 28, 0.5)"
  },
};

export const LightTrigger: Story = {
  name: 'Light color mode',
  args: {
    colorMode: 'light',
    value: 'usd',
    triggerBorderColor: "rgba(168, 31, 31, 0.2)",
    triggerTextColor: "#0f0909",
    triggerChevronColor: "rgba(17, 14, 14, 0.5)"
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

    colorMode: "light",
    triggerBorderColor: "rgba(0, 0, 0, 0.2)",
    triggerTextColor: "#000000",
    triggerChevronColor: "rgba(197, 20, 20, 0.5)"
  },
};

const TAG_OPTIONS: SelectDropdownOption[] = [
  { value: 'travel', label: 'Travel' },
  { value: 'dining', label: 'Dining' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'fuel', label: 'Fuel' },
];

function MultiWithCapDemo() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <SelectDropdown
      selectionMode="multi"
      options={TAG_OPTIONS}
      selectedValues={selected}
      onSelectedValuesChange={setSelected}
      maxSelected={3}
      staticTriggerLabel="Tag (max 3) ▾"
      placeholder="Tags"
      menuMinWidth={200}
      colorConfig={{
        border: 'rgba(255,255,255,0.2)',
        text: mainColors.white,
        chevron: 'rgba(255,255,255,0.5)',
      }}
    />
  );
}

export const MultiWithCap: StoryObj = {
  name: 'Multi select (cap 3)',
  render: () => <MultiWithCapDemo />,
};

function MultiPortalDemo() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div
      style={{
        height: 160,
        width: 320,
        overflow: 'auto',
        border: '1px solid rgba(255,255,255,0.2)',
        padding: 12,
        background: colorPalette.popBlack[400],
      }}
    >
      <Typography fontType={FontType.BODY} fontSize={12} color="rgba(255,255,255,0.6)">
        Scroll this box — portal menu should not be clipped.
      </Typography>
      <div style={{ height: 120 }} />
      <SelectDropdown
        selectionMode="multi"
        menuMount="portal"
        options={TAG_OPTIONS}
        selectedValues={selected}
        onSelectedValuesChange={setSelected}
        maxSelected={3}
        staticTriggerLabel="Portal multi ▾"
        placeholder="Tags"
        menuMinWidth={180}
        menuMaxHeight={200}
        colorConfig={{
          border: 'rgba(255,255,255,0.2)',
          text: mainColors.white,
          chevron: 'rgba(255,255,255,0.5)',
        }}
      />
      <div style={{ height: 120 }} />
    </div>
  );
}

export const MultiPortalClippedScroll: StoryObj = {
  name: 'Multi + portal (scroll parent)',
  render: () => <MultiPortalDemo />,
  parameters: { layout: 'centered' },
};

function EmptyOptionsDemo() {
  return (
    <SelectDropdown
      options={[]}
      placeholder="No tags defined"
      emptyMenuContent={
        <Typography
          fontType={FontType.BODY}
          fontSize={12}
          fontWeight={FontWeights.REGULAR}
          color="rgba(255,255,255,0.5)"
          style={{ maxWidth: 220, lineHeight: 1.4 }}
        >
          Define tags on the Customize page first.
        </Typography>
      }
      colorConfig={{
        border: 'rgba(255,255,255,0.2)',
        text: mainColors.white,
        chevron: 'rgba(255,255,255,0.5)',
      }}
    />
  );
}

export const EmptyOptions: StoryObj = {
  name: 'Empty options + emptyMenuContent',
  render: () => <EmptyOptionsDemo />,
};

const CATEGORY_OPTIONS: SelectDropdownOption[] = [
  { value: 'food',          label: 'Food & Dining' },
  { value: 'shopping',      label: 'Shopping' },
  { value: 'travel',        label: 'Travel' },
  { value: 'bills',         label: 'Bills & Utilities' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'fuel',          label: 'Fuel' },
  { value: 'health',        label: 'Health' },
  { value: 'groceries',     label: 'Groceries' },
  { value: 'cc_payment',    label: 'CC Bill Payment' },
  { value: 'cashback',      label: 'Cashback' },
  { value: 'other',         label: 'Other' },
];

const CATEGORY_COLORS: Record<string, string> = {
  food: '#F97316',
  shopping: '#8B5CF6',
  travel: '#3B82F6',
  bills: '#6B7280',
  entertainment: '#EC4899',
  fuel: '#EAB308',
  health: '#10B981',
  groceries: '#14B8A6',
  cc_payment: '#6B7280',
  cashback: '#06C270',
  other: '#9CA3AF',
};

const CategoryBadgeHover = styled.div`
  display: inline-flex;
  border-radius: 12px;
  transition: box-shadow 0.15s;
  cursor: pointer;

  &:hover {
    box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.35);
  }
`;

function CategoryBadgePillDemo() {
  const [cat, setCat] = useState('food');
  const color = CATEGORY_COLORS[cat] ?? '#9CA3AF';
  return (
    <div style={{ background: '#0d0d0d', padding: 24, borderRadius: 8 }}>
      {/* Simulated transaction row context */}
      <CategoryBadgeHover>
        <SelectDropdown
          selectionMode="single"
          options={CATEGORY_OPTIONS}
          value={cat}
          onChange={setCat}
          menuMount="portal"
          menuOffset={4}
          menuMinWidth={160}
          menuMaxHeight={240}
          menuBackgroundColor={colorPalette.popBlack[300]}
          colorConfig={{
            border: `${color}40`,
            text: color,
            chevron: 'transparent',
          }}
          wrapperStyle={{
            background: `${color}30`,
            borderRadius: 12,
            padding: '2px 8px',
          }}
          ariaLabel="Change transaction category"
          onRootMouseDown={(e) => e.stopPropagation()}
        />
      </CategoryBadgeHover>
    </div>
  );
}

export const CategoryBadgePill: StoryObj = {
  name: 'Category badge pill (TransactionRow)',
  render: () => <CategoryBadgePillDemo />,
  parameters: { layout: 'centered' },
};

