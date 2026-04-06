import type { Meta, StoryObj } from '@storybook/react';
import { SpendSummary } from '@/components/SpendSummary';

const sparklineData = [
  { value: 42 },
  { value: 58 },
  { value: 45 },
  { value: 72 },
  { value: 89 },
  { value: 95 },
  { value: 100 },
];

const meta = {
  title: 'NeoPOP/SpendSummary',
  component: SpendSummary,
  parameters: { layout: 'centered' },
  argTypes: {
    totalSpend: { control: 'number' },
    mixedCurrency: { control: 'boolean' },
    totalSpendByCurrency: { control: 'object' },
    deltaPercent: { control: 'number' },
    deltaLabel: { control: 'text' },
    sparklineData: { control: 'object' },
    period: { control: 'text' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof SpendSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    totalSpend: 124500,
    deltaPercent: 12,
    sparklineData,
    period: 'Feb 2024',
  },
};

export const DownTrend: Story = {
  args: {
    totalSpend: 89200,
    deltaPercent: -8,
    sparklineData,
    period: 'Jan 2024',
  },
};
