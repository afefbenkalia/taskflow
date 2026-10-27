import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskCard } from '../src/features/workspace/tasks/TaskCard';
import type { Task } from '../src/types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 42,
    key: 'WEB-42',
    title: 'Homepage mockup',
    description: 'Hero, featured categories and footer for desktop and mobile.',
    status: 'in_progress',
    priority: 'high',
    due_date: '2026-10-23',
    completed_at: null,
    created_at: '2026-10-15T09:00:00Z',
    project: { id: 1, key: 'WEB', name: 'Website redesign', color: '#4F46E5' },
    assignee: { id: 3, first_name: 'Sarah', last_name: 'Mansour', full_name: 'Sarah Mansour', role: 'user' },
    creator_id: 1,
    subtasks_done: 3,
    subtasks_total: 5,
    comments_count: 4,
    can_change_status: true,
    ...overrides,
  };
}

function renderCard(task: Task) {
  const onStatusChange = vi.fn();
  render(<TaskCard task={task} onStatusChange={onStatusChange} />);
  return { onStatusChange, user: userEvent.setup() };
}

describe('TaskCard', () => {
  it('renders the title, subtask counter, priority and project', () => {
    renderCard(makeTask());

    expect(screen.getByRole('heading', { name: 'Homepage mockup' })).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Website redesign')).toBeInTheDocument();
    expect(screen.queryByLabelText('4 comments')).not.toBeInTheDocument();
  });

  it('changes the status from the menu when allowed', async () => {
    const task = makeTask();
    const { onStatusChange, user } = renderCard(task);

    await user.click(screen.getByRole('button', { name: 'Change status of Homepage mockup' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Change status')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'In progress' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(menu).getByRole('menuitemradio', { name: 'Done' }));

    expect(onStatusChange).toHaveBeenCalledWith(task, 'done');
  });

  it('disables the status menu when can_change_status is false', async () => {
    const { onStatusChange, user } = renderCard(
      makeTask({
        can_change_status: false,
        assignee: { id: 4, first_name: 'Karim', last_name: 'Bouzid', full_name: 'Karim Bouzid', role: 'user' },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Change status of Homepage mockup' }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitemradio');

    expect(items).toHaveLength(3);
    items.forEach((item) => expect(item).toBeDisabled());
    expect(
      within(menu).getByText('Only the assignee or the project owner can change the status.'),
    ).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitemradio', { name: 'Done' }));
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('hides the subtask counter when the task has no subtasks', () => {
    renderCard(makeTask({ subtasks_total: 0, subtasks_done: 0 }));

    expect(screen.queryByText('0/0')).not.toBeInTheDocument();
  });
});
