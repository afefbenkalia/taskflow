import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MyProjectsCard } from '../src/features/workspace/home/MyProjectsCard';
import { MyProjectsPage } from '../src/features/workspace/projects/MyProjectsPage';
import type { MyProject } from '../src/types/project';

const api = vi.hoisted(() => ({ getMyProjects: vi.fn() }));
vi.mock('../src/api/users', () => ({ getMyProjects: api.getMyProjects }));

function project(id: number, name: string, key: string, overrides: Partial<MyProject> = {}): MyProject {
  return {
    id, key, name, color: '#4F46E5', my_role: 'member', progress: 40, done: 4, total: 10,
    due_date: '2099-11-15', health: 'on_track', ...overrides,
  };
}

const PROJECTS = [
  project(1, 'Website redesign', 'WEB'),
  project(5, 'HR dashboard', 'HRD', { my_role: 'owner', health: 'overdue', due_date: '2026-10-10' }),
  project(2, 'Mobile app', 'MOB'),
  project(3, 'Client portal', 'CLP'),
];

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/app" element={<MyProjectsCard projects={PROJECTS.slice(0, 3)} />} />
        <Route path="/app/projects" element={<MyProjectsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const cards = () => within(screen.getByRole('tabpanel', { name: 'Projects' })).queryAllByRole('listitem');

describe('My projects page', () => {
  beforeEach(() => {
    api.getMyProjects.mockReset().mockResolvedValue(PROJECTS);
  });

  it('opens from "View all" on Home and shows every project', async () => {
    const user = renderAt('/app');

    await user.click(screen.getByRole('link', { name: 'View all' }));

    expect(await screen.findByText('You’re part of 4 active projects.')).toBeInTheDocument();
    expect(cards()).toHaveLength(4);
    expect(screen.getByRole('link', { name: /HR dashboard/ })).toHaveAttribute('href', '/app/projects/5');
  });

  it('filters with the tabs', async () => {
    const user = renderAt('/app/projects');
    const tabs = screen.getByRole('tablist', { name: 'Projects' });
    await screen.findByText('You’re part of 4 active projects.');

    expect(within(tabs).getByRole('tab', { name: 'All 4' })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(tabs).getByRole('tab', { name: 'Owned by me 1' }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('Due Oct 10')).toBeInTheDocument();

    await user.click(within(tabs).getByRole('tab', { name: 'Member 3' }));
    expect(cards()).toHaveLength(3);
  });

  it('explains an empty tab', async () => {
    api.getMyProjects.mockResolvedValue(PROJECTS.filter((p) => p.my_role === 'member'));
    renderAt('/app/projects?tab=owned');

    expect(await screen.findByText('You don’t own a project')).toBeInTheDocument();
  });
});
