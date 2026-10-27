import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResults } from '../src/api/search';
import { GlobalSearch } from '../src/components/navigation/GlobalSearch';

const api = vi.hoisted(() => ({ searchWorkspace: vi.fn() }));
vi.mock('../src/api/search', () => api);

const RESULTS: SearchResults = {
  query: 'web',
  groups: [
    { kind: 'projects', items: [{ id: 1, title: 'Website redesign', subtitle: 'WEB · Member · 58% done', link: '/app/projects/1', color: '#4F46E5' }] },
    { kind: 'tasks', items: [{ id: 42, title: 'Homepage mockup', subtitle: 'WEB-42 · Website redesign · To do', link: '/app/projects/1?tab=tasks', color: '#4F46E5' }] },
  ],
};

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderSearch() {
  render(
    <MemoryRouter initialEntries={['/app']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GlobalSearch />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const input = () => screen.getByRole('combobox', { name: 'Search projects, tasks, people' });

describe('top bar search', () => {
  beforeEach(() => {
    api.searchWorkspace.mockReset().mockResolvedValue(RESULTS);
  });

  it('shows grouped results and opens one on click', async () => {
    const user = renderSearch();

    await user.type(input(), 'web');

    const list = await screen.findByRole('listbox', { name: 'Search results' });
    expect(await within(list).findByRole('group', { name: 'Projects' })).toHaveTextContent('Website redesign');
    expect(within(list).getByRole('group', { name: 'Tasks' })).toHaveTextContent('WEB-42');
    expect(api.searchWorkspace).toHaveBeenCalledWith('web', expect.any(AbortSignal));

    await user.click(within(list).getByRole('option', { name: /Homepage mockup/ }));

    expect(screen.getByTestId('where')).toHaveTextContent('/app/projects/1?tab=tasks');
    expect(input()).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('can be used with the keyboard', async () => {
    const user = renderSearch();
    await user.type(input(), 'web');
    await screen.findByRole('option', { name: /^Website redesign/ });

    expect(screen.getByRole('option', { name: /^Website redesign/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: /Homepage mockup/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('where')).toHaveTextContent('/app/projects/1?tab=tasks');
  });

  it('focuses with Ctrl+K', async () => {
    const user = renderSearch();

    await user.keyboard('{Control>}k{/Control}');

    expect(input()).toHaveFocus();
  });

  it('waits for two characters', async () => {
    const user = renderSearch();

    await user.type(input(), 'w');
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(api.searchWorkspace).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    api.searchWorkspace.mockResolvedValue({ query: 'zzz', groups: [] });
    const user = renderSearch();

    await user.type(input(), 'zzz');

    expect(await screen.findByText('No results for “zzz”.')).toBeInTheDocument();
  });
});
