import type { Meta, StoryObj } from '@storybook/react';
import { StatUpload } from '@/components/StatUpload';

const mockUpload = async (file: File) => {
  console.log('Uploading:', file.name);
  await new Promise((r) => setTimeout(r, 2000));
  return { status: 'success', count: 42, bank: 'hdfc' };
};

const mockPasswordUpload = async (_file: File, password?: string) => {
  await new Promise((r) => setTimeout(r, 1500));
  if (!password) return { status: 'error', message: 'Could not unlock PDF - wrong password' };
  return { status: 'success', count: 12, bank: 'icici' };
};

const mockBulkUpload = async (files: File[]) => {
  console.log('Bulk upload:', files.map((f) => f.name));
  await new Promise((r) => setTimeout(r, 800));
  const n = files.length;
  return {
    status: 'ok',
    input_total: n,
    total: n,
    success: n,
    failed: 0,
    duplicate: 0,
    card_not_found: 0,
    parse_error: 0,
    password_needed: 0,
    skipped: 0,
    rejected: [],
    outcomes: files.map((f) => ({ file_name: f.name, status: 'success' as const, message: null })),
  };
};

const meta = {
  title: 'NeoPOP/StatUpload',
  component: StatUpload,
  parameters: { layout: 'centered' },
  argTypes: {
    compact: { control: 'boolean' },
    className: { control: 'text' },
    acceptTypes: { control: 'object', description: 'react-dropzone accept map, e.g. { "application/pdf": [".pdf"] }' },
    idleText: { control: 'text' },
    subtitleText: { control: 'text' },
    onUpload: { control: false, description: 'Set per story — must return a Promise<UploadResult>' },
    onBulkUpload: { control: false, description: 'Optional bulk handler' },
  },
} satisfies Meta<typeof StatUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { onUpload: mockUpload },
};

export const Compact: Story = {
  args: { compact: true, onUpload: mockUpload },
};

export const PasswordProtected: Story = {
  args: { onUpload: mockPasswordUpload },
};

export const FullWidth: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <StatUpload onUpload={mockUpload} />
    </div>
  ),
};

export const WithBulkDualDropzones: Story = {
  args: {
    onUpload: mockUpload,
    onBulkUpload: mockBulkUpload,
    acceptTypes: { 'application/pdf': ['.pdf'], 'text/csv': ['.csv'] },
  },
  render: (args) => (
    <div style={{ width: 400 }}>
      <StatUpload {...args} />
    </div>
  ),
};
