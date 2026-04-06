import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useEffect, useState } from 'react';
import { Button } from '@cred/neopop-web/lib/components';
import { CommandSearch } from '@/components/CommandSearch';

const meta = {
  title: 'NeoPOP/CommandSearch',
  component: CommandSearch,
  parameters: { layout: 'centered' },
  argTypes: {
    open: { control: 'boolean', description: 'Syncs with the overlay when changed in Controls' },
    className: { control: 'text' },
    onClose: { action: 'close' },
    onSearch: { action: 'search' },
  },
  args: {
    open: false,
    onClose: fn(),
    onSearch: fn(),
  },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    useEffect(() => {
      setOpen(args.open);
    }, [args.open]);

    return (
      <>
        <Button
          variant="primary"
          kind="elevated"
          size="medium"
          colorMode="dark"
          onClick={() => setOpen(true)}
        >
          Open Search (⌘K)
        </Button>
        <CommandSearch
          {...args}
          open={open}
          onClose={() => {
            setOpen(false);
            args.onClose();
          }}
          onSearch={(query, filters) => {
            args.onSearch?.(query, filters);
          }}
        />
      </>
    );
  },
} satisfies Meta<typeof CommandSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InitiallyOpen: Story = {
  args: {
    open: true,
  },
};
