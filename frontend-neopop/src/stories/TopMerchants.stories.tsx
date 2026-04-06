import type { Meta, StoryObj } from '@storybook/react';
import { TopMerchants } from '@/components/TopMerchants';

const sampleData = [
  { merchant: 'Swiggy', amount: 18500, count: 12 },
  { merchant: 'Amazon', amount: 32000, count: 5 },
  { merchant: 'MakeMyTrip', amount: 28000, count: 2 },
  { merchant: 'Indian Oil', amount: 12000, count: 4 },
  { merchant: 'Netflix', amount: 8500, count: 3 },
];

const meta = {
  title: 'NeoPOP/TopMerchants',
  component: TopMerchants,
  parameters: { layout: 'centered' },
  argTypes: {
    data: { control: 'object' },
    currency: { control: 'text' },
    className: { control: 'text' },
  },
  args: {
    currency: 'INR',
  },
} satisfies Meta<typeof TopMerchants>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: sampleData },
};

export const Three: Story = {
  args: { data: sampleData.slice(0, 3) },
};
