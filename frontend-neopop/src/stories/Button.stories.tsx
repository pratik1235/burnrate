import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@cred/neopop-web/lib/components';
import { ButtonWithIcon } from '@/components/ButtonWithIcon';
import { Upload, Plus, RefreshCw } from 'lucide-react';

const meta = {
  title: 'NeoPOP/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary'] },
    kind: { control: 'select', options: ['elevated', 'flat', 'link'] },
    size: { control: 'select', options: ['big', 'medium', 'small'] },
    colorMode: { control: 'select', options: ['dark', 'light'] },
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
    onClick: () => {},
  },
};

export const SecondaryFlat: Story = {
  args: {
    children: 'Cancel',
    variant: 'secondary',
    kind: 'flat',
    size: 'medium',
    colorMode: 'dark',
    onClick: () => {},
  },
};

export const PrimaryFlat: Story = {
  args: {
    children: 'Upload Statement',
    variant: 'primary',
    kind: 'flat',
    size: 'big',
    colorMode: 'dark',
    onClick: () => {},
  },
};

export const Small: Story = {
  args: {
    children: 'This Month',
    variant: 'secondary',
    kind: 'elevated',
    size: 'small',
    colorMode: 'dark',
    onClick: () => {},
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
    onClick: () => {},
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
    onClick: () => {},
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

const buttonStoryDefaults = {
  variant: 'primary' as const,
  kind: 'elevated' as const,
  size: 'big' as const,
  colorMode: 'dark' as const,
  onClick: () => {},
};

/** Icon + label via `ButtonWithIcon` (NeoPOP `Button` + `Row` + `Typography`). */
export const ButtonWithIconPrimary: Story = {
  name: 'ButtonWithIcon — Primary',
  render: () => (
    <ButtonWithIcon icon={Upload} {...buttonStoryDefaults}>
      Upload PDF
    </ButtonWithIcon>
  ),
  args: {
    children: 'Upload PDF',
    ...buttonStoryDefaults,
  },
};

export const ButtonWithIconSecondarySmall: Story = {
  name: 'ButtonWithIcon — Secondary small',
  render: () => (
    <ButtonWithIcon
      icon={Plus}
      variant="secondary"
      kind="elevated"
      size="small"
      colorMode="dark"
      onClick={() => {}}
    >
      Add offer
    </ButtonWithIcon>
  ),
  args: {
    children: 'Add offer',
    variant: 'secondary',
    kind: 'elevated',
    size: 'small',
    colorMode: 'dark',
    onClick: () => {},
  },
};

export const ButtonWithIconAnimatedIcon: Story = {
  name: 'ButtonWithIcon — Icon props',
  render: () => (
    <>
      {spinKeyframes}
      <ButtonWithIcon
        icon={RefreshCw}
        variant="primary"
        kind="elevated"
        size="medium"
        colorMode="dark"
        iconProps={{
          style: { animation: 'storybook-button-spin 1s linear infinite' },
        }}
        onClick={() => {}}
      >
        Sync in progress
      </ButtonWithIcon>
    </>
  ),
  args: {
    children: 'Sync in progress',
    variant: 'primary',
    kind: 'elevated',
    size: 'medium',
    colorMode: 'dark',
    onClick: () => {},
  },
};
