import type { Meta, StoryObj } from '@storybook/react';
import { CardComparison } from '@/components/CardComparison';

const sampleData = [
  { bank: 'hdfc' as const, last4: '4521', amount: 72000 },
  { bank: 'icici' as const, last4: '7890', amount: 35000 },
  { bank: 'axis' as const, last4: '3344', amount: 17500 },
];

const meta = {
  title: 'NeoPOP/CardComparison',
  component: CardComparison,
  parameters: { layout: 'centered' },
  argTypes: {
    data: { control: 'object' },
    period: { control: 'text' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof CardComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: sampleData,
    period: 'Feb 2024',
  },
};

export const TwoCards: Story = {
  args: {
    data: sampleData.slice(0, 2),
    period: 'This month',
  },
};
