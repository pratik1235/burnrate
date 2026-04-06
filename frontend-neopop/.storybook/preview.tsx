import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'white',
      values: [
        { name: 'white', value: '#FFFFFF' },
        { name: 'light', value: '#F5F5F5' },
        { name: 'dark', value: '#0D0D0D' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#FFFFFF', minHeight: '100vh', padding: '24px' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
