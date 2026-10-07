import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectDropdown } from './SelectDropdown';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

const MULTI_OPTIONS = [
  { value: 'x', label: 'One' },
  { value: 'y', label: 'Two' },
  { value: 'z', label: 'Three' },
  { value: 'w', label: 'Four' },
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
    const { container } = render(<SelectDropdown options={OPTIONS} placeholder="Pick" onChange={onChange} />);

    await user.click(within(container).getAllByText('Pick').slice(-1)[0]);
    await user.click(screen.getByRole('option', { name: 'Beta' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('b');
    });
  });

  it('shows placeholder when value is missing', () => {
    render(<SelectDropdown options={OPTIONS} placeholder="Choose" value="" onChange={vi.fn()} />);
    expect(screen.getAllByText('Choose')[0]).toBeInTheDocument();
  });

  it('Escape closes the menu', async () => {
    const user = userEvent.setup();
    const { container } = render(<SelectDropdown options={OPTIONS} placeholder="Pick" />);
    await user.click(within(container).getAllByText('Pick').slice(-1)[0]);
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Alpha' })).not.toBeInTheDocument();
    });
  });

  it('multi: toggles selection and keeps menu open by default', async () => {
    const user = userEvent.setup();
    const onSelectedValuesChange = vi.fn();
    const { container } = render(
      <SelectDropdown
        selectionMode="multi"
        options={MULTI_OPTIONS}
        selectedValues={[]}
        onSelectedValuesChange={onSelectedValuesChange}
        placeholder="Tags"
      />,
    );
    await user.click(within(container).getAllByText('Tags').slice(-1)[0]);
    await user.click(screen.getByRole('option', { name: /One/ }));
    expect(onSelectedValuesChange).toHaveBeenCalledWith(['x']);
    expect(screen.getByRole('option', { name: /One/ })).toBeInTheDocument();
  });

  it('multi: toggles off', async () => {
    const user = userEvent.setup();
    const onSelectedValuesChange = vi.fn();
    const { container } = render(
      <SelectDropdown
        selectionMode="multi"
        options={MULTI_OPTIONS}
        selectedValues={['x']}
        onSelectedValuesChange={onSelectedValuesChange}
        placeholder="Tags"
      />,
    );
    await user.click(within(container).getAllByText('Tags').slice(-1)[0]);
    await user.click(screen.getByRole('option', { name: /One/ }));
    expect(onSelectedValuesChange).toHaveBeenCalledWith([]);
  });

  it('multi: maxSelected disables fourth unselected option', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SelectDropdown
        selectionMode="multi"
        options={MULTI_OPTIONS}
        selectedValues={['x', 'y', 'z']}
        onSelectedValuesChange={vi.fn()}
        maxSelected={3}
        placeholder="Tags"
      />,
    );
    await user.click(within(container).getAllByText('Tags').slice(-1)[0]);
    const four = screen.getByRole('option', { name: /Four/ });
    expect(four).toBeDisabled();
  });

  it('shows emptyMenuContent when options empty', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SelectDropdown
        options={[]}
        placeholder="Open"
        emptyMenuContent={<span>No items</span>}
      />,
    );
    await user.click(within(container).getAllByText('Open').slice(-1)[0]);
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('staticTriggerLabel ignores selection for trigger text', () => {
    render(
      <SelectDropdown
        selectionMode="multi"
        options={MULTI_OPTIONS}
        selectedValues={['x']}
        staticTriggerLabel="Tag ▾"
        placeholder="ignored on trigger"
      />,
    );
    expect(screen.getByText('Tag ▾')).toBeInTheDocument();
  });

  it('portal: menu mounts under document.body', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SelectDropdown
        options={OPTIONS}
        placeholder="Pick"
        menuMount="portal"
      />,
    );
    await user.click(within(container).getAllByText('Pick').slice(-1)[0]);
    const listboxes = document.body.querySelectorAll('[role="listbox"]');
    expect(listboxes.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('mousedown outside closes portal menu', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <SelectDropdown options={OPTIONS} placeholder="Pick" menuMount="portal" />
        <button type="button">outside</button>
      </div>,
    );
    await user.click(within(container).getAllByText('Pick').slice(-1)[0]);
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'outside' }));
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Alpha' })).not.toBeInTheDocument();
    });
  });
});
