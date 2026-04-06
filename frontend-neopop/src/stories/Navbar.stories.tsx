import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Navbar } from '@/components/Navbar';

const NAV_TAB_IDS = [
  'dashboard',
  'cards',
  'transactions',
  'analytics',
  'statements',
  'offers',
  'milestones',
  'customize',
  'setup',
] as const;

const meta = {
  title: 'NeoPOP/Navbar',
  component: Navbar,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    activeTab: { control: 'select', options: [...NAV_TAB_IDS] },
    className: { control: 'text' },
    onTabChange: { action: 'tabChange' },
  },
  args: {
    onTabChange: fn(),
  },
} satisfies Meta<typeof Navbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    activeTab: 'dashboard',
  },
};

export const TransactionsActive: Story = {
  args: {
    activeTab: 'transactions',
  },
};
