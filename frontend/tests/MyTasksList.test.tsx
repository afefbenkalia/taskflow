import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MyTasksBoard } from '../src/features/workspace/tasks/MyTasksBoard';
import type { Task } from '../src/types/task';
import type { UserBrief } from '../src/types/user';

const api = vi.hoisted(() => ({ getMyTasks: vi.fn(), getMyProjects: vi.fn() }));
vi.mock('../src/api/users', () => api);
vi.mock('../src/api/tasks', () => ({
  getTaskComments: vi.fn().mockResolvedValue([]),
  addTaskComment: vi.fn(),
  deleteTaskComment: vi.fn(),
  changeTaskStatus: vi.fn(),
}));

const SARAH: UserBrief = { id: 3, first_name: 'Sarah', last_name: 'Mansour', full_name: 'Sarah Mansour', role: 'user' };

function task(id: number, overrides: Partial<Task>): Task {
  return {
    id, key: `WEB-${id}`, title: `Task ${id}`, description: null, status: 'todo', priority: 'medium',
    due_date: null, completed_at: null, created_at: '2026-10-01T09:00:00Z',
    project: { id: 1, key: 'WEB', name: 'Website redesign', color: '#4F46E5' },
    assignee: SARAH, creator_id: 3, subtasks_done: 0, subtasks_total: 0, comments_count: 0,
    can_change_status: true, ...overrides,
  };
}

const TASKS = [
  task(1, { title: 'Optimize product images', due_date: '2020-01-10', priority: 'high' }),
  task(2, { title: 'Homepage mockup', status: 'in_progress', comments_count: 4 }),
  task(3, { title: 'Brand color palette', status: 'done' }),
  task(4, { title: 'Checkout flow QA', can_change_status: false }),
];

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/app/tasks" element={<MyTasksBoard />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('My tasks › views', () => {
  beforeEach(() => {
    api.getMyTasks.mockReset().mockResolvedValue(TASKS);
    api.getMyProjects.mockReset().mockResolvedValue([]);
  });

  it('offers Board and List only', async () => {
    renderAt('/app/tasks');
    const views = screen.getByRole('group', { name: 'View' });

    expect(within(views).getAllByRole('button').map((button) => button.textContent)).toEqual(['Board', 'List']);
    expect(within(views).getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText('Homepage mockup');
  });

  it('switches to the list, grouped by status', async () => {
    const user = renderAt('/app/tasks');
    await screen.findByText('Homepage mockup');

    await user.click(screen.getByRole('button', { name: 'List' }));

    const table = screen.getByRole('table', { name: 'My tasks' });
    const groups = within(table).getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(groups).toEqual(['In progress1', 'To do2', 'Done1']);
    expect(within(table).getByText('4 comments')).toBeInTheDocument();
    expect(within(table).getByText('Jan 10')).toHaveClass('text-[#D92D20]'); // overdue
    expect(within(table).getByLabelText('To do — locked')).toBeInTheDocument(); // Checkout flow QA
    expect(within(table).getByRole('button', { name: 'Status of Optimize product images: To do' })).toBeInTheDocument();
  });

  it('opens a task from the list', async () => {
    const user = renderAt('/app/tasks?view=list');
    const table = await screen.findByRole('table', { name: 'My tasks' });

    await user.click(await within(table).findByRole('button', { name: /^Homepage mockup/ }));

    expect(screen.getByRole('dialog', { name: 'Homepage mockup' })).toBeInTheDocument();
  });
});
