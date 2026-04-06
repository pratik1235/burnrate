import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectDropdown } from './SelectDropdown';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('SelectDropdown', () => {
  it('applies margin and padding on the outer wrapper', () => {
    const { container } = render(
      <SelectDropdown options={OPTIONS} margin="10px 0" padding="4px 8px" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.margin).toBe('10px 0px');
    expect(root.style.padding).toBe('4px 8px');
  });

  it('selects an option and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectDropdown options={OPTIONS} placeholder="Pick" onChange={onChange} />);

    await user.click(screen.getByText('Pick'));
    await user.click(screen.getByRole('option', { name: 'Beta' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('b');
    });
  });
});
