import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilterSelect } from '../src/components/ui/Select';

const OWNERS = Array.from({ length: 30 }, (_, index) => ({ value: String(index + 1), label: `Owner ${index + 1}` }));

function renderOwnerFilter() {
  const onChange = vi.fn();
  render(<FilterSelect label="Owner" value="" options={OWNERS} onChange={onChange} allLabel="All owners" />);
  return { onChange, user: userEvent.setup() };
}

describe('dropdown menu scrolling (admin Projects › Owner filter)', () => {
  it('stays open while its list is scrolled', async () => {
    const { onChange, user } = renderOwnerFilter();
    await user.click(screen.getByRole('button', { name: 'Owner' }));
    const menu = screen.getByRole('menu', { name: 'Owner' });

    fireEvent.scroll(menu);

    expect(screen.getByRole('menu', { name: 'Owner' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: 'Owner 30' }));
    expect(onChange).toHaveBeenCalledWith('30');
  });

  it('stays open while the page scrolls', async () => {
    const { user } = renderOwnerFilter();
    await user.click(screen.getByRole('button', { name: 'Owner' }));

    fireEvent.scroll(window);
    fireEvent.scroll(document.body);

    expect(screen.getByRole('menu', { name: 'Owner' })).toBeInTheDocument();
  });

  it('scrolls inside instead of overflowing the screen', async () => {
    const { user } = renderOwnerFilter();
    await user.click(screen.getByRole('button', { name: 'Owner' }));

    const menu = screen.getByRole('menu', { name: 'Owner' });
    expect(menu).toHaveClass('overflow-y-auto');
    expect(menu.style.maxHeight).not.toBe('');
  });

  it('still closes on a click outside', async () => {
    const { user } = renderOwnerFilter();
    await user.click(screen.getByRole('button', { name: 'Owner' }));

    await user.click(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
