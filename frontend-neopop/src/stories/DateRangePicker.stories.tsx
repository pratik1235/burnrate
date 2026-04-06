import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { DateRangePicker } from '@/components/DateRangePicker';

const PRESETS = ['this_month', '3_months', '6_months', '1_year', 'custom'] as const;

const meta = {
  title: 'NeoPOP/DateRangePicker',
  component: DateRangePicker,
  parameters: { layout: 'centered' },
  argTypes: {
    value: { control: 'select', options: [...PRESETS] },
    className: { control: 'text' },
    onChange: { action: 'change' },
  },
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof DateRangePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 'this_month',
  },
};

export const ThreeMonths: Story = {
  args: {
    value: '3_months',
  },
};
