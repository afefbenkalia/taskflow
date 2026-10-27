import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarUser } from '../src/components/navigation/SidebarUser';
import { ActivityPage } from '../src/features/workspace/activity/ActivityPage';
import { CalendarPage } from '../src/features/workspace/calendar/CalendarPage';
import type { WorkspaceContext } from '../src/layouts/UserLayout';
import type { WorkspaceActivityEntry } from '../src/types/activity';
import type { Task } from '../src/types/task';
import type { UserBrief } from '../src/types/user';

const api = vi.hoisted(() => ({
  getMyTasks: vi.fn(),
  getMyActivity: vi.fn(),
  getMyProjects: vi.fn(),
}));
vi.mock('../src/api/users', () => api);

const SARAH: UserBrief = { id: 3, first_name: 'Sarah', last_name: 'Mansour', full_name: 'Sarah Mansour', role: 'user' };
const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function task(id: number, title: string, due: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    key: `WEB-${id}`,
    title,
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: due,
    completed_at: null,
    created_at: '2026-10-01T09:00:00Z',
    project: { id: 1, key: 'WEB', name: 'Website redesign', color: '#4F46E5' },
    assignee: SARAH,
    creator_id: 3,
    subtasks_done: 0,
    subtasks_total: 0,
    comments_count: 0,
    can_change_status: true,
    ...overrides,
  };
}

const TASKS = [
  task(1, 'Homepage mockup', '2026-10-24', { priority: 'high' }),
  task(2, 'Checkout QA', '2026-10-20'), // overdue
  task(3, 'Kickoff notes', '2026-10-28', { status: 'done' }),
  task(4, 'Sprint review', '2026-11-01'), // next month, visible in the last row
];

function renderPage(page: JSX.Element, path: string, context: Partial<WorkspaceContext> = {}) {
  const value: WorkspaceContext = {
    refreshKey: 0,
    notifyChanged: vi.fn(),
    openNewTask: vi.fn(),
    ...context,
  };
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <Routes>
        <Route element={<Outlet context={value} />}>
          <Route path="/app/calendar" element={page} />
          <Route path="/app/activity" element={page} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return { context: value, user: userEvent.setup() };
}

describe('Calendar page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 24, 10, 0));
    api.getMyTasks.mockReset().mockResolvedValue(TASKS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the visible weeks and summarizes the month', async () => {
    renderPage(<CalendarPage />, '/app/calendar');

    expect(await screen.findByText('3 tasks due in October · 1 overdue')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    // Monday Sep 28 to Sunday Nov 1.
    expect(api.getMyTasks).toHaveBeenCalledWith({ due_from: '2026-09-28', due_to: '2026-11-01' });
    expect(screen.getByRole('button', { name: 'Saturday, October 24 (today), 1 task' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the tasks of the selected day', async () => {
    const { user } = renderPage(<CalendarPage />, '/app/calendar');
    const panel = await screen.findByRole('list', { name: 'Tasks due Saturday, October 24' });
    expect(within(panel).getByText('Homepage mockup')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tuesday, October 20, 1 task' }));

    const other = screen.getByRole('list', { name: 'Tasks due Tuesday, October 20' });
    expect(within(other).getByText('Checkout QA')).toBeInTheDocument();
    expect(within(other).getByText('Overdue')).toBeInTheDocument();
  });

  it('says when nothing is due on the selected day', async () => {
    const { user } = renderPage(<CalendarPage />, '/app/calendar');
    await screen.findByText('3 tasks due in October · 1 overdue');

    await user.click(screen.getByRole('button', { name: 'Thursday, October 15, no tasks' }));

    expect(screen.getByText('No tasks are due this day.')).toBeInTheDocument();
  });

  it('moves to the next month', async () => {
    const { user } = renderPage(<CalendarPage />, '/app/calendar');
    await screen.findByText('3 tasks due in October · 1 overdue');

    await user.click(screen.getByRole('button', { name: 'Next month' }));

    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    // Monday Oct 26 to Sunday Dec 6.
    expect(api.getMyTasks).toHaveBeenLastCalledWith({ due_from: '2026-10-26', due_to: '2026-12-06' });
  });

  it('opens the task form with the selected day as due date', async () => {
    const { user, context } = renderPage(<CalendarPage />, '/app/calendar?month=2026-10&day=2026-10-28');
    const panel = await screen.findByRole('list', { name: 'Tasks due Wednesday, October 28' });
    expect(within(panel).getByText('Kickoff notes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(context.openNewTask).toHaveBeenCalledWith({ dueDate: '2026-10-28' });
  });
});

describe('Activity page', () => {
  const ENTRIES: WorkspaceActivityEntry[] = [
    {
      id: 2, actor: SARAH, action: 'task.created', type: 'create', entity_type: 'task', entity_id: 9,
      entity_label: 'Homepage mockup', details: { project_id: 1 }, created_at: new Date().toISOString(),
      project: { id: 1, key: 'WEB', name: 'Website redesign', color: '#4F46E5' },
    },
  ];

  beforeEach(() => {
    api.getMyProjects.mockReset().mockResolvedValue([
      { id: 1, key: 'WEB', name: 'Website redesign', color: '#4F46E5', my_role: 'member', progress: 40,
        done: 2, total: 5, due_date: null, health: 'on_track' },
    ]);
    api.getMyActivity.mockReset().mockResolvedValue({ items: ENTRIES, total: 1, page: 1, page_size: 20 });
  });

  it('lists activity with a link to the project', async () => {
    renderPage(<ActivityPage />, '/app/activity');

    const today = await screen.findByRole('region', { name: 'Today' });
    expect(within(today).getByRole('listitem')).toHaveTextContent('Sarah Mansour created task Homepage mockup');
    expect(within(today).getByRole('link', { name: 'Website redesign' })).toHaveAttribute(
      'href',
      '/app/projects/1?tab=activity',
    );
    expect(api.getMyActivity).toHaveBeenCalledWith({ project_id: undefined, mine: false, page: 1, page_size: 20 });
  });

  it('filters on my own events', async () => {
    const { user } = renderPage(<ActivityPage />, '/app/activity');
    await screen.findByRole('region', { name: 'Today' });
    api.getMyActivity.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });

    await user.click(screen.getByRole('button', { name: 'Only me' }));

    expect(api.getMyActivity).toHaveBeenLastCalledWith({ project_id: undefined, mine: true, page: 1, page_size: 20 });
    expect(await screen.findByText('No matching activity')).toBeInTheDocument();
  });
});

describe('workspace sidebar', () => {
  it('links Calendar and Activity', () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <SidebarUser counts={null} userName="Sarah Mansour" onNewTask={vi.fn()} onLogout={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/app/calendar');
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/app/activity');
  });
});
