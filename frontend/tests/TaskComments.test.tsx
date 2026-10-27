import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskCard } from '../src/features/workspace/tasks/TaskCard';
import { TaskDetailsModal } from '../src/features/workspace/tasks/TaskDetailsModal';
import type { Task, TaskComment } from '../src/types/task';
import type { UserBrief } from '../src/types/user';

const api = vi.hoisted(() => ({
  getTaskComments: vi.fn(),
  addTaskComment: vi.fn(),
  deleteTaskComment: vi.fn(),
  changeTaskStatus: vi.fn(),
}));
vi.mock('../src/api/tasks', () => api);

const SARAH: UserBrief = { id: 3, first_name: 'Sarah', last_name: 'Mansour', full_name: 'Sarah Mansour', role: 'user' };
const KARIM: UserBrief = { id: 4, first_name: 'Karim', last_name: 'Bouzid', full_name: 'Karim Bouzid', role: 'user' };

const TASK: Task = {
  id: 42, key: 'HRD-42', title: 'Hiring funnel chart', description: 'Weekly funnel by stage.',
  status: 'in_progress', priority: 'high', due_date: '2099-11-15', completed_at: null,
  created_at: '2026-10-15T09:00:00Z', project: { id: 5, key: 'HRD', name: 'HR dashboard', color: '#4F46E5' },
  assignee: KARIM, creator_id: 3, subtasks_done: 0, subtasks_total: 0, comments_count: 1,
  can_change_status: true,
};

const FIRST: TaskComment = {
  id: 1, author: SARAH, content: 'Can you add the Q3 numbers?', created_at: new Date().toISOString(), can_delete: false,
};

describe('task card', () => {
  it('opens the task from its title and its comments link', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<TaskCard task={{ ...TASK, comments_count: 2 }} onStatusChange={vi.fn()} onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: 'Hiring funnel chart' }));
    await user.click(screen.getByRole('button', { name: '2 comments on Hiring funnel chart' }));

    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('invites to comment when there is none', () => {
    render(<TaskCard task={{ ...TASK, comments_count: 0 }} onStatusChange={vi.fn()} onOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Comment on Hiring funnel chart' })).toBeInTheDocument();
  });
});

describe('task details and comments', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getTaskComments.mockResolvedValue([FIRST]);
  });

  it('shows the task and its comments', async () => {
    render(<TaskDetailsModal task={TASK} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Hiring funnel chart' });
    expect(dialog).toHaveTextContent('HRD-42 · HR dashboard');
    expect(dialog).toHaveTextContent('In progress');
    expect(dialog).toHaveTextContent('Karim Bouzid');
    expect(dialog).toHaveTextContent('Weekly funnel by stage.');
    const thread = within(dialog).getByRole('region', { name: 'Comments' });
    expect(await within(thread).findByText('Can you add the Q3 numbers?')).toBeInTheDocument();
    expect(within(thread).queryByRole('button', { name: /Delete comment/ })).not.toBeInTheDocument();
    expect(api.getTaskComments).toHaveBeenCalledWith(42);
  });

  it('posts a comment with Ctrl+Enter and updates the counter', async () => {
    const reply: TaskComment = { ...FIRST, id: 2, author: KARIM, content: 'Done, see the update.', can_delete: true };
    api.addTaskComment.mockResolvedValue(reply);
    const onCommentsChange = vi.fn();
    const user = userEvent.setup();
    render(<TaskDetailsModal task={TASK} onClose={vi.fn()} onCommentsChange={onCommentsChange} />);
    await screen.findByText('Can you add the Q3 numbers?');

    const box = screen.getByLabelText('Write a comment');
    await user.type(box, '  Done, see the update.  ');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(api.addTaskComment).toHaveBeenCalledWith(42, 'Done, see the update.');
    expect(await screen.findByText('Done, see the update.')).toBeInTheDocument();
    expect(box).toHaveValue('');
    expect(onCommentsChange).toHaveBeenCalledWith(TASK, 2);
  });

  it('does not send an empty comment', async () => {
    render(<TaskDetailsModal task={TASK} onClose={vi.fn()} />);
    await screen.findByText('Can you add the Q3 numbers?');

    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('deletes a comment the user may delete', async () => {
    api.getTaskComments.mockResolvedValue([{ ...FIRST, can_delete: true }]);
    api.deleteTaskComment.mockResolvedValue(undefined);
    const onCommentsChange = vi.fn();
    const user = userEvent.setup();
    render(<TaskDetailsModal task={TASK} onClose={vi.fn()} onCommentsChange={onCommentsChange} />);

    await user.click(await screen.findByRole('button', { name: 'Delete comment by Sarah Mansour' }));

    expect(api.deleteTaskComment).toHaveBeenCalledWith(42, 1);
    expect(await screen.findByText('No comments yet. Start the conversation.')).toBeInTheDocument();
    expect(onCommentsChange).toHaveBeenCalledWith(TASK, 0);
  });
});
