import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrashIconButton } from './TrashIconButton';

describe('TrashIconButton', () => {
  it('invokes onClick and exposes accessible name', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<TrashIconButton aria-label="Remove item" onClick={onClick} />);
    const btn = screen.getByRole('button', { name: 'Remove item' });
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
