import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { SetupForm } from '@/components/SetupForm';

const meta = {
  title: 'NeoPOP/SetupForm',
  component: SetupForm,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    onSubmit: { action: 'submit' },
    className: { control: 'text' },
    initialData: { control: 'object' },
    isUpdate: { control: 'boolean' },
  },
  args: {
    onSubmit: fn(),
    isUpdate: false,
  },
} satisfies Meta<typeof SetupForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
