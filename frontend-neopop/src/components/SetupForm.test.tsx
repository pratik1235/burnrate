import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupForm } from './SetupForm';

const postMock = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: { post: (...args: unknown[]) => postMock(...args) },
  };
});

describe('SetupForm', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({ data: { path: '/Users/test/WatchFolder' } });
  });

  it('updates watch folder input after Browse returns a path', async () => {
    const user = userEvent.setup();
    render(<SetupForm />);
    await user.click(screen.getByRole('button', { name: /browse/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/path to statements folder/i)).toHaveValue('/Users/test/WatchFolder');
    });
    expect(postMock).toHaveBeenCalledWith('/settings/browse-folder');
  });
});
