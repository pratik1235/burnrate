import type { Meta, StoryObj } from '@storybook/react';
import { InsightCard } from '@/components/InsightCard';

const meta = {
  title: 'NeoPOP/InsightCard',
  component: InsightCard,
  parameters: { layout: 'centered' },
  argTypes: {
    text: { control: 'text' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof InsightCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: "You spent 23% more on food this month. Swiggy's got a new fan!",
  },
};

export const Another: Story = {
  args: {
    text: 'Your HDFC card saw 45% of total spends. Consider spreading across cards for better rewards.',
  },
};
