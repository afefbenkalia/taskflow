import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextValue } from '../src/context/AuthContext';
import { ProjectPage } from '../src/features/workspace/projects/ProjectPage';
import type { ProjectActivityEntry } from '../src/types/activity';
import type { ProjectDetail, ProjectFile, ProjectMember, ProjectPermission } from '../src/types/project';
import type { Task } from '../src/types/task';
import type { UserBrief } from '../src/types/user';

const SARAH: UserBrief = { id: 3, first_name: 'Sarah', last_name: 'Mansour', full_name: 'Sarah Mansour', role: 'user' };
const KARIM: UserBrief = { id: 4, first_name: 'Karim', last_name: 'Bouzid', full_name: 'Karim Bouzid', role: 'user' };

const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjectTasks: vi.fn(),
  getProjectMembers: vi.fn(),
  getProjectPermissions: vi.fn(),
  getProjectActivity: vi.fn(),
  getProjectFiles: vi.fn(),
  getMemberCandidates: vi.fn(),
  addProjectMember: vi.fn(),
  removeProjectMember: vi.fn(),
  uploadProjectFile: vi.fn(),
  downloadProjectFile: vi.fn(),
  deleteProjectFile: vi.fn(),
}));
vi.mock('../src/api/projects', () => api);

vi.mock('../src/hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    user: {
      ...SARAH,
      email: 'sarah.m@taskflow.io',
      status: 'active',
      job_title: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    accessToken: 'token',
    status: 'authenticated',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function project(myRole: 'owner' | 'member'): ProjectDetail {
  return {
    id: 7,
    key: 'HRD',
    name: 'HR dashboard',
    description: 'Headcount and hiring metrics for the people team.',
    color: '#4F46E5',
    owner: myRole === 'owner' ? SARAH : KARIM,
    due_date: '2099-12-31',
    health: 'on_track',
    progress: 33,
    tasks_done: 1,
    tasks_count: 3,
    members_count: 2,
    files_count: 1,
    my_role: myRole,
    archived: false,
    created_at: '2026-09-01T09:00:00Z',
  };
}

function task(id: number, overrides: Partial<Task>): Task {
  return {
    id,
    key: `HRD-${id}`,
    title: `Task ${id}`,
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    completed_at: null,
    created_at: '2026-10-01T09:00:00Z',
    project: { id: 7, key: 'HRD', name: 'HR dashboard', color: '#4F46E5' },
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
  task(1, { title: 'Hiring funnel chart', due_date: '2099-01-10', status: 'in_progress' }),
  task(2, { title: 'Old export', due_date: '2020-01-01', assignee: KARIM }),
  task(3, { title: 'Kickoff', status: 'done' }),
];

function members(myRole: 'owner' | 'member'): ProjectMember[] {
  const owner = myRole === 'owner';
  return [
    {
      user: owner ? SARAH : KARIM, email: owner ? 'sarah.m@taskflow.io' : 'karim.b@taskflow.io',
      job_title: null, role_in_project: 'owner', is_self: owner, joined_at: '2026-09-01T09:00:00Z',
      open_tasks: 1, done_tasks: 1, can_remove: false,
    },
    {
      user: owner ? KARIM : SARAH, email: owner ? 'karim.b@taskflow.io' : 'sarah.m@taskflow.io',
      job_title: 'Designer', role_in_project: 'member', is_self: !owner, joined_at: '2026-09-05T09:00:00Z',
      open_tasks: 1, done_tasks: 0, can_remove: owner,
    },
  ];
}

function permissions(myRole: 'owner' | 'member'): ProjectPermission[] {
  const owner = myRole === 'owner';
  return [
    { key: 'create_tasks', label: 'Create tasks', allowed: true },
    { key: 'update_status', label: 'Update status of your tasks', allowed: true },
    { key: 'comment', label: 'Comment on any task', allowed: true },
    { key: 'edit_settings', label: 'Edit project settings', allowed: owner },
    { key: 'manage_members', label: 'Manage members', allowed: owner },
    { key: 'archive_delete', label: 'Archive or delete the project', allowed: owner },
  ];
}

const ACTIVITY: ProjectActivityEntry[] = [
  {
    id: 2, actor: KARIM, action: 'file.uploaded', type: 'create', entity_type: 'file', entity_id: 5,
    entity_label: 'brief.pdf', details: { project_id: 7 }, created_at: new Date().toISOString(),
  },
  {
    id: 1, actor: SARAH, action: 'task.status_changed', type: 'status', entity_type: 'task', entity_id: 1,
    entity_label: 'Kickoff', details: { project_id: 7, from: 'in_progress', to: 'done' },
    created_at: new Date().toISOString(),
  },
];

const FILES: ProjectFile[] = [
  {
    id: 5, name: 'brief.pdf', content_type: 'application/pdf', size_bytes: 2_621_440,
    uploaded_by: KARIM, created_at: '2026-10-20T09:00:00Z', can_delete: false,
  },
];

function setup(myRole: 'owner' | 'member', tab?: string) {
  api.getProject.mockResolvedValue(project(myRole));
  api.getProjectTasks.mockResolvedValue(TASKS);
  api.getProjectMembers.mockResolvedValue(members(myRole));
  api.getProjectPermissions.mockResolvedValue(permissions(myRole));
  api.getProjectActivity.mockResolvedValue({ items: ACTIVITY, total: 2, page: 1, page_size: 20 });
  api.getProjectFiles.mockResolvedValue(FILES);
  api.getMemberCandidates.mockResolvedValue([
    { id: 9, full_name: 'Leila Haddad', email: 'leila.h@taskflow.io', job_title: null },
  ]);
  api.addProjectMember.mockResolvedValue([]);

  render(
    <MemoryRouter
      initialEntries={[`/app/projects/7${tab ? `?tab=${tab}` : ''}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/app/projects/:projectId" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('project tabs', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it('enables every tab and switches between them', async () => {
    const user = setup('member');
    await screen.findByRole('heading', { name: 'HR dashboard' });

    const tablist = screen.getByRole('tablist', { name: 'Project sections' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-disabled'))).toEqual([null, null, null, null, null]);
    expect(within(tablist).getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(tablist).getByRole('tab', { name: 'Overview' }));

    expect(within(tablist).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Headcount and hiring metrics for the people team.')).toBeInTheDocument();
  });

  it('shows progress, deadlines and recent activity on the overview', async () => {
    setup('member', 'overview');

    expect(await screen.findByRole('progressbar', { name: 'Project progress: 33%' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3 tasks done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Overdue: 1 of 3 tasks' })).toBeInTheDocument();

    const deadlines = screen.getByRole('heading', { name: 'Upcoming deadlines' }).closest('section')!;
    const rows = within(deadlines).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Old export'),
      expect.stringContaining('Hiring funnel chart'),
    ]);
    expect(within(rows[0]!).getByText('Overdue')).toBeInTheDocument();

    expect(await screen.findByText('brief.pdf')).toBeInTheDocument();
  });

  it('lets the owner add a member', async () => {
    const user = setup('owner', 'members');

    expect(await screen.findByText('karim.b@taskflow.io', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Karim Bouzid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Sarah Mansour' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add member' });
    await user.click(await within(dialog).findByRole('option', { name: /Leila Haddad/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Add to project' }));

    expect(api.addProjectMember).toHaveBeenCalledWith(7, 9);
    expect(await screen.findByText('Leila Haddad was added to the project.')).toBeInTheDocument();
  });

  it('keeps membership read-only for a member', async () => {
    setup('member', 'members');

    expect(await screen.findByText('Designer · sarah.m@taskflow.io')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.queryByText('Membership is managed by the project owner or an admin.')).not.toBeInTheDocument();
  });

  it('renders the activity timeline with actors', async () => {
    setup('member', 'activity');

    const timeline = await screen.findByRole('region', { name: 'Today' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Karim Bouzid uploaded brief.pdf');
    expect(items[1]).toHaveTextContent('Sarah Mansour changed status of Kickoff from In progress to Done');
    expect(api.getProjectActivity).toHaveBeenCalledWith(7, { page: 1, page_size: 20 });
  });

  it('lists files and only offers delete when allowed', async () => {
    const user = setup('member', 'files');

    expect(await screen.findByRole('button', { name: 'Download brief.pdf' })).toBeInTheDocument();
    expect(screen.getByText('2.5 MB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete brief.pdf' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download brief.pdf' }));
    expect(api.downloadProjectFile).toHaveBeenCalledWith(7, FILES[0]);
  });

  it('uploads the chosen file', async () => {
    const created: ProjectFile = { ...FILES[0]!, id: 6, name: 'notes.txt', uploaded_by: SARAH, can_delete: true };
    const user = setup('member', 'files');
    api.uploadProjectFile.mockResolvedValue(created);
    await screen.findByRole('button', { name: 'Download brief.pdf' });

    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Choose files to upload'), file);

    expect(api.uploadProjectFile).toHaveBeenCalledWith(7, file);
    expect(await screen.findByRole('button', { name: 'Delete notes.txt' })).toBeInTheDocument();
    expect(screen.getByText('“notes.txt” was uploaded.')).toBeInTheDocument();
  });
});
