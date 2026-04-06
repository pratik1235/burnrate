import type { Meta, StoryObj } from '@storybook/react';
import { CashFlowChart } from '@/components/CashFlowChart';

const sampleData = [
  { month: 'Sep', spend: 42000 },
  { month: 'Oct', spend: 58000 },
  { month: 'Nov', spend: 45000 },
  { month: 'Dec', spend: 72000 },
  { month: 'Jan', spend: 89000 },
  { month: 'Feb', spend: 124500 },
];

const meta = {
  title: 'NeoPOP/CashFlowChart',
  component: CashFlowChart,
  parameters: { layout: 'centered' },
  argTypes: {
    data: { control: 'object' },
    currency: { control: 'text' },
    className: { control: 'text' },
  },
  args: {
    currency: 'INR',
  },
} satisfies Meta<typeof CashFlowChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: sampleData },
};

export const ThreeMonths: Story = {
  args: { data: sampleData.slice(0, 3) },
};

export const SixMonths: Story = {
  args: { data: sampleData },
};
