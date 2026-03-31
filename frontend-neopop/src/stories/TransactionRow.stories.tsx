import type { Meta, StoryObj } from '@storybook/react';
import { TransactionRow } from '@/components/TransactionRow';
import type { Transaction } from '@/lib/types';

const sampleTransaction: Transaction = {
  id: '1',
  date: '2024-02-15',
  merchant: 'Swiggy',
  amount: 450,
  type: 'debit',
  category: 'food',
  cardId: 'c1',
  bank: 'hdfc',
  cardLast4: '4521',
  source: 'CC',
};

const meta = {
  title: 'NeoPOP/TransactionRow',
  component: TransactionRow,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TransactionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Debit: Story = {
  args: { transaction: sampleTransaction },
};

export const Credit: Story = {
  args: {
    transaction: {
      ...sampleTransaction,
      type: 'credit',
      merchant: 'Refund - Amazon',
      amount: 1200,
    },
  },
};

export const Multiple: Story = {
  args: { transaction: sampleTransaction },
  render: () => (
    <div style={{ width: 400 }}>
      <TransactionRow
        transaction={{
          ...sampleTransaction,
          merchant: 'Swiggy',
          category: 'food',
          amount: 450,
        }}
      />
      <TransactionRow
        transaction={{
          ...sampleTransaction,
          id: '2',
          merchant: 'Amazon',
          category: 'shopping',
          amount: 3200,
          bank: 'icici',
          cardLast4: '7890',
        }}
      />
      <TransactionRow
        transaction={{
          ...sampleTransaction,
          id: '3',
          merchant: 'Indian Oil',
          category: 'fuel',
          amount: 3500,
        }}
      />
    </div>
  ),
};
