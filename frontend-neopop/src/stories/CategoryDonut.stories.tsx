import type { Meta, StoryObj } from '@storybook/react';
import { CategoryDonut } from '@/components/CategoryDonut';

const sampleData = [
  { category: 'food' as const, amount: 18500, percentage: 0, count: 12 },
  { category: 'shopping' as const, amount: 32000, percentage: 0, count: 5 },
  { category: 'travel' as const, amount: 28000, percentage: 0, count: 2 },
  { category: 'fuel' as const, amount: 12000, percentage: 0, count: 4 },
  { category: 'entertainment' as const, amount: 8500, percentage: 0, count: 8 },
  { category: 'groceries' as const, amount: 15000, percentage: 0, count: 6 },
];

const meta = {
  title: 'NeoPOP/CategoryDonut',
  component: CategoryDonut,
  parameters: { layout: 'centered' },
  argTypes: {
    data: { control: 'object' },
    currency: { control: 'text' },
    className: { control: 'text' },
  },
  args: {
    currency: 'INR',
  },
} satisfies Meta<typeof CategoryDonut>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: sampleData },
};

export const FewCategories: Story = {
  args: { data: sampleData.slice(0, 4) },
};
