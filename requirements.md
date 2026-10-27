# TaskFlow — Requirements

This document lists the requirements of **TaskFlow**, a project and task management application with two role-based interfaces. It combines the original specification (delivered in three parts) with the changes requested during development, and records how each requirement is implemented today.

- **Original specification**: Part 1 (authentication and role-based access), Part 2 (Admin console), Part 3 (Member workspace).
- **Later changes**: requests made after the three parts. They are listed in [section 7](#7-changes-to-the-original-specification) because several of them replace an original requirement.

Status legend: **Done** = implemented and covered by automated tests, unless noted otherwise.

---

## 1. Scope and roles

TaskFlow has two roles, fixed in `backend/app/core/permissions.py`; there is no role management screen.

| Role | Interface | Entry point | Purpose |
|---|---|---|---|
| `admin` | Admin console | `/admin` | Manage users, roles and every project; monitor tasks and the audit log. |
| `user` (Member) | User workspace | `/app` | Work on the projects the user belongs to: tasks, members, files, comments. |

Inside a project, a member is either the **owner** or a **member** (`project_members.role_in_project`).

Security is enforced at two levels:

- **Backend.** This is the source of truth: every request is authorized.
- **Frontend.** It hides what is not allowed and redirects.

---

## 2. Functional requirements

### 2.1 Authentication (Part 1)

| ID | Requirement | Status |
|---|---|---|
| AUTH-1 | Sign in with email and password. The response contains a short-lived JWT access token (15 min by default). | Done |
| AUTH-2 | The refresh token is stored only in an `httpOnly` cookie (`SameSite=Lax`, path `/api/v1/auth`). It never appears in a JSON body. The database stores only its SHA-256 hash. | Done |
| AUTH-3 | "Remember for 30 days" extends the refresh token lifetime from 7 to 30 days. | Done |
| AUTH-4 | Refresh rotates the token. Reusing a revoked token revokes the whole token family. | Done |
| AUTH-5 | Sign out revokes the refresh token and clears the cookie. | Done |
| AUTH-6 | Wrong email or wrong password both return the same message: "Incorrect email or password." (401). | Done |
| AUTH-7 | A pending account gets 403 `account_pending`; a deactivated account gets 403 `account_deactivated`. | Done |
| AUTH-8 | Sign up creates a **pending Member** account that an administrator must approve. A duplicate email returns 409. | Done |
| AUTH-9 | Password rules: at least 8 characters, one uppercase letter, one digit. The same messages are used on the backend and in the frontend. | Done |
| AUTH-10 | On load, the frontend restores the session through `/auth/refresh`. The access token is kept in memory only, never in `localStorage`. | Done |
| AUTH-11 | After sign in, an admin goes to `/admin` and a member goes to `/app`. If the user was sent to the login page from a page they are allowed to see, they return to that page. | Done |
| AUTH-12 | Sign-up page: password strength meter (Weak / Fair / Good / Strong) and a confirmation state ("Account created"). | Done |
| AUTH-13 | **Later change.** Forgot password: `/forgot-password` asks for the email. The answer is always the same, whether or not the account exists. An active account receives an emailed link (`/reset-password?token=…`). The link works once, expires after 30 minutes, and only the newest link is valid. A second request within 60 seconds sends no new email. Only the SHA-256 hash of the token is stored. | Done |
| AUTH-14 | **Later change.** Reset page: new password with the same rules as the profile, plus confirmation. The reset ends every session of the account. Used, expired or unknown links show "Link no longer valid" with a way to request a new one. Both steps are recorded in the activity log. | Done |

### 2.2 Role-based access (Part 1)

| ID | Requirement | Status |
|---|---|---|
| RBAC-1 | Every `/api/v1/admin/*` route requires the admin role. The check is applied once, on the admin router. | Done |
| RBAC-2 | A refused admin request returns 403 `{"detail": "Admin role required", "code": "forbidden"}` and is logged as `auth.denied`. | Done |
| RBAC-3 | A member who opens `/admin/*` sees the 403 page ("This area is for administrators only"), displayed inside the member layout. | Done |
| RBAC-4 | Project routes return **404** when the user is not a member of the project, so nothing about the project is revealed. | Done |
| RBAC-5 | Only the assignee or the project owner can change a task's status (403 `status_change_forbidden`). | Done |
| RBAC-6 | Every error uses the format `{"detail", "code"}`. Validation errors (422) also include `errors: [{field, message}]`. | Done |

### 2.3 Admin console (Part 2 and later changes)

**Overview — `/admin`**

| ID | Requirement | Status |
|---|---|---|
| ADM-OV-1 | Four KPI cards with a change vs. the previous period and a sparkline: Total users, Active projects, Tasks completed, Overdue tasks. | Done |
| ADM-OV-2 | Period selector: Last 7, 30 or 90 days. | Done |
| ADM-OV-3 | Task throughput over 8 weeks, created vs. completed (hand-made SVG bar chart). | Done |
| ADM-OV-4 | Tasks by status donut. An overdue task counts only as "Overdue". The card also shows the completion rate and its change. | Done |
| ADM-OV-5 | Team workload: open tasks per active user, the 4 busiest users, capacity 10 (Balanced / High / At capacity). | Done |
| ADM-OV-6 | Recent admin activity (latest 4 events). | Done |
| ADM-OV-7 | "Export report" in **CSV or PDF**. PDF was a later change. | Done |

**User management — `/admin/users`**

| ID | Requirement | Status |
|---|---|---|
| ADM-US-1 | Tabs All / Admins / Members / Pending / Deactivated with counts. Search, Role filter and Status filter are kept in the URL. 10 users per page. | Done |
| ADM-US-2 | Invite a user (created as active) and show a temporary password once, with a Copy button. | Done |
| ADM-US-3 | Edit details (first name, last name, email, job title). | Done |
| ADM-US-4 | Change a role, with confirmation. The role selector is locked on the admin's own row. | Done |
| ADM-US-5 | Approve a pending account; deactivate or activate a user. Deactivation ends the user's sessions immediately. | Done |
| ADM-US-6 | Reset a password: the temporary password is shown once and every session of the user is revoked. | Done |
| ADM-US-7 | Delete a user. The user's assigned tasks become unassigned. Refused (409 `user_owns_projects`) when the user owns projects. | Done |
| ADM-US-8 | An admin cannot act on their own account (400 `self_action_forbidden`). The last active admin cannot be demoted, deactivated or deleted (400 `last_admin`). | Done |
| ADM-US-9 | **Later change.** Checkboxes drive bulk actions: Approve, Activate, Make admin / Make member, Deactivate, Delete. Each user is processed through the single-user endpoint, so all the rules above apply. Destructive actions ask for confirmation. Progress is shown, partial failures are reported, and failed rows stay selected. Shift+click selects a range. | Done |
| ADM-US-10 | **Later change.** Pending accounts have an actions menu that includes "Reject and delete". Approve and Activate show a loading state and ignore double clicks. | Done |

**All projects — `/admin/projects`**

| ID | Requirement | Status |
|---|---|---|
| ADM-PR-1 | Summary cards: Active, On track, At risk, Overdue, Archived. | Done |
| ADM-PR-2 | Scope Active / Archived / All, search, Owner filter and Health filter. 10 projects per page. | Done |
| ADM-PR-3 | Create a project: name, 3-letter key, description, owner, due date, color. | Done |
| ADM-PR-4 | Archive, unarchive or delete a project (delete asks for confirmation). Deleting a project also removes its stored files. | Done |
| ADM-PR-5 | Export in **CSV or PDF**. PDF was a later change. | Done |

**Tasks — `/admin/tasks` (later change)**

| ID | Requirement | Status |
|---|---|---|
| ADM-TK-1 | Read-only view of every task: project, assignee, priority, status, due date (overdue highlighted), subtask progress. | Done |
| ADM-TK-2 | Summary: Total, To do, In progress, Done, Overdue, Unassigned. Scope: active, archived or all projects. | Done |
| ADM-TK-3 | Filters: search (title or key such as `WEB-42`), project, assignee (including "Unassigned"), status (including "Overdue"), priority, due date. Sort by due date, priority or newest. 10 tasks per page. | Done |
| ADM-TK-4 | No create, edit or delete action. The API only exposes `GET /admin/tasks`. | Done |

**Activity log — `/admin/activity`**

| ID | Requirement | Status |
|---|---|---|
| ADM-AC-1 | Audit trail with time, user, action sentence, target and IP address. 10 events per page. | Done |
| ADM-AC-2 | Filters: search, user, action type, project, period (24 hours, 7 days, 30 days). | Done |
| ADM-AC-3 | Export of the filtered log in **CSV or PDF**. The PDF holds the 1,000 most recent matching entries; the CSV holds all of them. | Done |

**Navigation and account**

| ID | Requirement | Status |
|---|---|---|
| ADM-NAV-1 | Dark sidebar: Overview, Users, Projects, Tasks, Activity log, with counts. The **Account** section contains Notifications and Profile (later change, replaces "System › Settings"). | Done |
| ADM-NAV-2 | **Later change.** Admin Profile at `/admin/profile`, same forms as the member profile. | Done |
| ADM-NAV-3 | Responsive: below 1024 px the sidebar becomes a drawer; tables scroll horizontally inside their card. | Done |

### 2.4 Member workspace (Part 3 and later changes)

**Home — `/app`**

| ID | Requirement | Status |
|---|---|---|
| WS-HOME-1 | Hero card: greeting, tasks due this week and overdue, weekly goal of 10 completed tasks (progress ring). | Done |
| WS-HOME-2 | Stat cards: Assigned to me, Due this week, Completed this month (vs. the previous month). | Done |
| WS-HOME-3 | Today's focus with Today / Upcoming (next 7 days) / Overdue. The round checkbox toggles Done ↔ To do, only when the user is allowed to change the status. | Done |
| WS-HOME-4 | My projects (3 most recent) with a "View all" link, and a This week strip with the next deadline. | Done |

**My tasks — `/app/tasks`**

| ID | Requirement | Status |
|---|---|---|
| WS-TK-1 | Kanban board To do / In progress / Done showing the tasks the user is assigned to **or** created, in active projects. | Done |
| WS-TK-2 | Search, Project, Priority and Due filters. | Done |
| WS-TK-6 | **Later change.** View switcher **Board / List**. The List view is a table grouped by status (task, project, priority, due date, status). The view is kept in the URL (`?view=list`). The Calendar option was removed from this switcher; the calendar has its own page, `/app/calendar`. | Done |
| WS-TK-3 | Status is changed from a menu (no drag-and-drop). The update is optimistic and rolled back with a message if the API refuses. | Done |
| WS-TK-4 | "New task" form: title, description (500 characters max), project, assignee (a member of that project), priority, due date, status. | Done |
| WS-TK-5 | **Later change.** A task assigned to the user appears in My tasks with the correct details. The workspace reloads automatically when a new notification arrives, within at most 60 seconds or immediately when the browser tab regains focus. | Done (the automatic reload has no dedicated automated test) |

**Projects — `/app/projects` and `/app/projects/:id`**

| ID | Requirement | Status |
|---|---|---|
| WS-PR-1 | **Later change.** `/app/projects` lists all the user's projects, with the tabs All / Owned by me / Member. Original requirement: redirect to the most recent project. | Done |
| WS-PR-2 | Project header: health, role ("You're the owner" / "You're a member"), owner, due date, number of members, "Add task". | Done |
| WS-PR-3 | **Tasks** tab: tasks grouped by status, with the status selector (locked when the user is not allowed to change it). | Done |
| WS-PR-4 | **Overview** tab (later change): description, progress and breakdown by status, upcoming deadlines, recent activity. | Done |
| WS-PR-5 | **Members** tab (later change): members with open and completed tasks. The owner adds members (active users) and removes them; the owner cannot be removed. A removed member's open tasks become unassigned. | Done |
| WS-PR-6 | **Activity** tab (later change): project activity grouped by day, without IP addresses. | Done |
| WS-PR-7 | **Files** tab (later change): upload by any member (10 MB max per file, stored on disk under a random name), download, delete by the uploader or the owner. | Done |
| WS-PR-8 | A user who is not a member of the project sees the "not found" page. | Done |

**Comments (later change; Part 3 originally stored comments for counting only)**

| ID | Requirement | Status |
|---|---|---|
| WS-CM-1 | Every task has a comment thread. It opens from the task title or the "Comment / N comments" link in My tasks and in a project's task table. | Done |
| WS-CM-2 | Any project member can read and post (1,000 characters max). The author deletes their own comments; the project owner can delete any comment. | Done |
| WS-CM-3 | A new comment notifies the task's assignee and creator (never the author) and appears in the project activity. | Done |

**Other screens (later changes; these were "not clickable" items in Part 3)**

| ID | Requirement | Status |
|---|---|---|
| WS-CAL-1 | Calendar `/app/calendar`: month view of the user's tasks by due date; day panel with status changes and "Add task" for that day. | Done |
| WS-ACT-1 | Activity `/app/activity`: activity across the user's projects, filterable by project and by "Only me". | Done |
| WS-PRF-1 | Profile `/app/profile`: personal information and password change. Changing the password ends the user's other sessions. | Done |

### 2.5 Shared features (later changes)

| ID | Requirement | Status |
|---|---|---|
| SH-NOT-1 | In-app notifications for both roles. Members are notified of: task assigned, status changed on their task, comment, added to or removed from a project, project archived or restored, made owner of a project, role changed, account approved. Admins are also notified of new sign-ups waiting for approval and of password reset requests ("requested a password reset link"; the notification opens the Users page filtered on that person). The actor is never notified of their own action. | Done |
| SH-NOT-2 | Bell with the unread count and a panel of the latest notifications; Notifications page with All / Unread; mark one or all as read. The count refreshes every 60 seconds, on navigation and when the tab regains focus. | Done |
| SH-SRC-1 | Top bar search (Ctrl+K) for projects, tasks (by title or key) and people, scoped to what the user may see. Results open the right page for the user's role. | Done |
| SH-PDF-1 | PDF exports: landscape A4, header repeated on every page, "Page X of Y". | Done |

---

## 3. Business rules

| Rule | Definition |
|---|---|
| Overdue task | Status is not `done` and the due date is before today. |
| Project progress | Done tasks ÷ total tasks, rounded (0 % when the project has no task). |
| Project health | **Completed** if progress = 100 %; otherwise **Overdue** if the due date has passed; otherwise **At risk** if due within 14 days with progress below 70 %; otherwise **On track**. |
| KPI change | The current period compared with the previous period of the same length. |
| Workload | Open tasks per active user; capacity 10; levels: ≥ 10 At capacity, ≥ 8 High, otherwise Balanced. |
| Weekly goal | 10 completed tasks per week, counted from Monday. |
| Task status change | Allowed for the assignee or the project owner. `completed_at` is set when the task becomes Done and cleared otherwise. |
| Task assignee | Must be the project owner or a member of the project. |
| Project key | Exactly 3 letters, stored in uppercase, unique. Task keys are `{PROJECT_KEY}-{task id}`. |

---

## 4. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | No secret in the code: everything comes from `backend/.env`, which is git-ignored. Passwords are hashed with bcrypt. Refresh tokens are stored hashed. Uploaded files are served as attachments with `X-Content-Type-Options: nosniff`. |
| Auditability | Admin actions, sign-ins, denied requests, task, member and file events are written to `activity_logs`. |
| Architecture | FastAPI routes stay thin: business logic is in `services/` and access rules are pure functions in `core/permissions.py`. The schema is managed by Alembic migrations. |
| Accessibility | Labels linked to fields, `aria-invalid` on fields in error, visible focus, keyboard-usable menus and search, buttons disabled while a request runs. |
| Responsive design | Forms are usable at 375 px. Below 1280 px side columns stack; below 1024 px sidebars become drawers; below 768 px the Kanban stacks and tables scroll horizontally. |
| User interface language | English. |
| Testing | Backend: pytest against a dedicated PostgreSQL database; each test runs in a rolled-back transaction. Frontend: Vitest and Testing Library. |

---

## 5. Technical constraints

| Layer | Stack |
|---|---|
| Backend | Python 3.11+ (developed with 3.12), FastAPI, SQLAlchemy 2, PostgreSQL with psycopg 3, Alembic, pydantic-settings, bcrypt, PyJWT, ReportLab (PDF) |
| Frontend | React 18, Vite, TypeScript, react-router-dom 6, axios, react-hook-form with zod, Tailwind CSS 3, lucide-react |
| Tests | pytest, httpx, pypdf (backend); Vitest, Testing Library, jsdom (frontend) |

---

## 6. Data model

| Table | Purpose | Added in |
|---|---|---|
| `users` | Accounts: role, status, profile fields, `last_active_at`, `password_changed_at` | Migrations 0001 and 0003 |
| `refresh_tokens` | Hashed refresh tokens with expiry, revocation and user agent | Migration 0001 |
| `activity_logs` | Audit trail (actor, action, entity, JSONB details, IP address) | Migration 0001 |
| `projects`, `project_members`, `tasks` | Projects, membership (owner or member), tasks | Migration 0002 |
| `subtasks`, `comments` | Task checklist items and comments | Migration 0003 |
| `project_files` | Metadata of uploaded files (the content is on disk) | Migration 0004 |
| `notifications` | Per-user notifications and their read state | Migration 0005 |
| `password_reset_tokens` | Hashed single-use reset links with expiry and use date | Migration 0006 |

---

## 7. Changes to the original specification

The following requests were made after the three original parts. They take precedence over the original text.

| Original requirement | Current behavior |
|---|---|
| Sign-up requires "I agree to the Terms and Privacy Policy". | Checkbox removed. The API no longer requires `accept_terms` and ignores the field if it is sent. |
| Sign-in side panel shows a "Role-based workspaces" badge and the Admin console and User workspace cards. | Badge and cards removed. The panel keeps its title, text and "Trusted by 120+ teams". |
| Sidebars show a PrivilegesCard (admin) and a RoleCard "Member access" (member). | Both cards removed. |
| Admin sidebar "System › Settings" is not clickable. | Replaced by "Account › Notifications" and "Profile". |
| Admin sidebar "Tasks" is not clickable. | Opens the read-only admin Tasks page. |
| Member sidebar Calendar, Activity and Notifications are not clickable. | All three are implemented. |
| Top bar search is visual only. | Working global search. |
| Top bar has a Help (?) icon and a fake notification dot. | Help icon removed. The bell shows the real unread count. |
| `/app/projects` redirects to the most recent project. | Lists all the user's projects, with tabs. |
| Project tabs Overview, Members, Activity and Files are not clickable. | All four are implemented. |
| Project page shows a locked "Project settings" button and a "Your permissions here" panel. | Both removed. The permissions still apply. |
| Members panel note "Membership is managed by the project owner or an admin." | Removed. |
| Task cards show a comment icon with a count. | Icon removed. A "Comment / N comments" text link opens the thread. |
| Comments are stored for counting only. | Full comment feature (see WS-CM). |
| Profile tabs Security, Notifications and Sessions are shown but not clickable. | Removed. Only General remains. |
| Users table checkboxes select rows only, with no bulk actions. | Bulk actions (see ADM-US-9). |
| "Forgot password?" is a simple link with no action. | Full forgot-password flow by email (see AUTH-13, AUTH-14). |
| My tasks view switcher Board / List / Calendar, with List and Calendar not clickable. | Board / List, both working; Calendar removed from the switcher (see WS-TK-6). |
| Exports are CSV only. | CSV or PDF. |

---

## 8. Known limitations

- `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` and the root `.env.example` are **empty**. There is no working Docker setup; the project runs locally (see README).
- "Request access" on the 403 page is a link with no action.
- The only email TaskFlow sends is the password reset link. It needs an SMTP server; without `SMTP_HOST`, the email is written to the server log (development).
- Notifications are in-app only (no email, no push). They are refreshed by polling every 60 seconds, not in real time.
- Uploaded files are stored on the server's local disk (`UPLOAD_DIR`).
- PDF exports use the standard Helvetica font: characters outside Western European alphabets (for example Arabic) are not rendered.
