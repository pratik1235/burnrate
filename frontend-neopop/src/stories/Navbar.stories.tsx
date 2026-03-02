import type { Meta, StoryObj } from '@storybook/react';
import { Navbar } from '@/components/Navbar';

const meta = {
  title: 'NeoPOP/Navbar',
  component: Navbar,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Navbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    activeTab: 'dashboard',
    onTabChange: (tab) => console.log('Tab:', tab),
  },
};

export const TransactionsActive: Story = {
  args: {
    activeTab: 'transactions',
    onTabChange: (tab) => console.log('Tab:', tab),
  },
};
