import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Button } from '@cred/neopop-web/lib/components';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import { Upload, Plus, RefreshCw } from 'lucide-react';

const elevationDirectionOptions = [
  'bottom-right',
  'top-right',
  'bottom-left',
  'top-left',
  'bottom-center',
  'top-center',
  'right-center',
  'left-center',
] as const;

const meta = {
  title: 'NeoPOP/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    children: { control: 'text' },
    variant: { control: 'select', options: ['primary', 'secondary'] },
    kind: { control: 'select', options: ['elevated', 'flat', 'link'] },
    size: { control: 'select', options: ['big', 'medium', 'small'] },
    colorMode: { control: 'select', options: ['dark', 'light'] },
    disabled: { control: 'boolean' },
    showArrow: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
    elevationDirection: { control: 'select', options: [...elevationDirectionOptions] },
    colorConfig: { control: 'object', description: 'Override NeoPOP button colors' },
    textStyle: { control: 'object', description: 'Typography props (fontType, fontSize, fontWeight, …)' },
    spacingConfig: { control: 'object', description: 'padding, height, iconHeight' },
    style: { control: 'object' },
    className: { control: 'text' },
    type: { control: 'select', options: ['button', 'submit', 'reset'] },
    title: { control: 'text' },
    icon: { control: 'text', description: 'NeoPOP icon key (elevated/flat buttons)' },
    onClick: { action: 'clicked' },
  },
  args: {
    onClick: fn(),
    type: 'button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PrimaryElevated: Story = {
  args: {
    children: 'Save & Continue',
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
    colorMode: 'dark',
  },
};

export const SecondaryFlat: Story = {
  args: {
    children: 'Cancel',
    variant: 'secondary',
    kind: 'flat',
    size: 'medium',
    colorMode: 'dark',
  },
};

export const PrimaryFlat: Story = {
  args: {
    children: 'Upload Statement',
    variant: 'primary',
    kind: 'flat',
    size: 'big',
    colorMode: 'dark',
  },
};

export const Small: Story = {
  args: {
    children: 'This Month',
    variant: 'secondary',
    kind: 'elevated',
    size: 'small',
    colorMode: 'dark',
  },
};

export const WithArrow: Story = {
  args: {
    children: 'Continue',
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
    colorMode: 'dark',
    showArrow: true,
  },
};

export const Disabled: Story = {
  args: {
    children: 'Processing...',
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
    colorMode: 'dark',
    disabled: true,
  },
};

const spinKeyframes = (
  <style>{`@keyframes storybook-button-spin { to { transform: rotate(360deg); } }`}</style>
);

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {spinKeyframes}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="primary" kind="elevated" size="big" colorMode="dark" onClick={() => {}}>
          Primary Elevated
        </Button>
        <Button variant="secondary" kind="elevated" size="big" colorMode="dark" onClick={() => {}}>
          Secondary Elevated
        </Button>
        <Button variant="primary" kind="flat" size="big" colorMode="dark" onClick={() => {}}>
          Primary Flat
        </Button>
        <Button variant="secondary" kind="flat" size="big" colorMode="dark" onClick={() => {}}>
          Secondary Flat
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="primary" kind="elevated" size="small" colorMode="dark" onClick={() => {}}>
          Small
        </Button>
        <Button variant="primary" kind="elevated" size="medium" colorMode="dark" onClick={() => {}}>
          Medium
        </Button>
        <Button variant="primary" kind="elevated" size="big" colorMode="dark" onClick={() => {}}>
          Big
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <ButtonWithIcon
          icon={Upload}
          variant="primary"
          kind="elevated"
          size="medium"
          colorMode="dark"
          iconSize={16}
          onClick={() => {}}
        >
          Upload PDF
        </ButtonWithIcon>
        <ButtonWithIcon
          icon={Plus}
          variant="secondary"
          kind="elevated"
          size="medium"
          colorMode="dark"
          iconSize={16}
          onClick={() => {}}
        >
          Add Card
        </ButtonWithIcon>
        <ButtonWithIcon
          icon={RefreshCw}
          variant="primary"
          kind="elevated"
          size="small"
          colorMode="dark"
          iconProps={{
            style: { animation: 'storybook-button-spin 1s linear infinite' },
          }}
          onClick={() => {}}
        >
          Syncing
        </ButtonWithIcon>
      </div>
    </div>
  ),
};

