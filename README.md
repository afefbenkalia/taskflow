# TaskFlow

TaskFlow is a project and task management web application with **two role-based interfaces**:

- **Admin console** (`/admin`): manage users and roles, oversee every project, monitor all tasks (read-only) and review the audit log.
- **User workspace** (`/app`): team members work on the projects they belong to, with tasks, a Kanban board, a calendar, members, files and comments.

Access is enforced on the backend for every request. The frontend hides what a role cannot use and redirects to a 403 page.

The detailed requirements, business rules and changes to the original specification are in **[requirements.md](requirements.md)**.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Getting started](#getting-started)
5. [Configuration](#configuration)
6. [Demo accounts](#demo-accounts)
7. [Running the tests](#running-the-tests)
8. [API overview](#api-overview)
9. [Security model](#security-model)
10. [Known limitations](#known-limitations)

---

## Features

### Authentication and access
- Sign in, sign up, sign out. Sessions are restored on page load.
- Short-lived JWT access token, kept in memory. Rotating refresh token in an `httpOnly` cookie; reusing a revoked token revokes the whole family.
- New accounts are **pending** until an administrator approves them.
- **Forgot password**: the user receives a single-use link by email, valid for 30 minutes, then chooses a new password. Resetting the password ends every session of the account. Without SMTP configured (local development), the email, with its link, is printed in the backend console.
- Role-based routing: admins land on `/admin`, members on `/app`. A member who opens an admin page sees a 403 page.

### Admin console
| Page | What it does |
|---|---|
| **Overview** | KPIs with trends, 8-week throughput chart, tasks by status, team workload, recent admin activity. Report export in CSV or PDF. |
| **Users** | Filters and search; invite, edit, change role, approve, activate or deactivate, reset password, delete. Bulk actions on selected rows. |
| **Projects** | Summary by health, filters, create, archive, delete. Export in CSV or PDF. |
| **Tasks** | Read-only view of every task, with filters, summary and sorting. |
| **Activity log** | Full audit trail with filters. Export in CSV or PDF. |
| **Notifications, Profile** | Personal notifications and profile (personal information and password). |

### User workspace
| Page | What it does |
|---|---|
| **Home** | Greeting, weekly goal, stats, Today / Upcoming / Overdue focus list, recent projects, week strip. |
| **My tasks** | The tasks the user is assigned to or created, as a Kanban **Board** or a **List** grouped by status; filters; status changes; new task. |
| **My projects** | All of the user's projects, with the tabs All / Owned by me / Member. |
| **Project** | Tabs Overview, Tasks, Members (owner adds and removes members), Activity, Files (upload and download). |
| **Comments** | A comment thread on every task, opened from My tasks or a project's task table. |
| **Calendar** | Month view of tasks by due date, with a day panel. |
| **Activity** | Activity across the user's projects. |
| **Notifications, Profile** | Notifications; personal information and password. |

### Shared
- **Notifications** for both roles: bell with unread count, notifications page, mark as read.
- **Global search** (Ctrl+K) for projects, tasks and people, limited to what the user may see.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Backend | Python 3.11+ (developed with 3.12), FastAPI, SQLAlchemy 2, PostgreSQL with psycopg 3, Alembic, pydantic-settings, bcrypt, PyJWT, ReportLab |
| Frontend | React 18, TypeScript, Vite, react-router-dom 6, axios, react-hook-form with zod, Tailwind CSS 3, lucide-react |
| Tests | pytest, httpx, pypdf · Vitest, Testing Library, jsdom |

---

## Project structure

```
.
├── README.md
├── requirements.md
├── backend/
│   ├── requirements.txt        Python dependencies
│   ├── .env.example            Configuration template (copy to .env)
│   ├── alembic.ini, alembic/   Database migrations (0001 to 0005)
│   ├── app/
│   │   ├── main.py             FastAPI application ("TaskFlow API" 1.0.0)
│   │   ├── core/               Settings, security (JWT, bcrypt), access rules (permissions.py),
│   │   │                       errors, file storage, PDF rendering
│   │   ├── api/                Dependencies and routes: /api/v1 (auth, me, projects, tasks,
│   │   │                       notifications, search) and /api/v1/admin/*
│   │   ├── models/             SQLAlchemy models
│   │   ├── schemas/            Pydantic request and response schemas
│   │   ├── services/           Business logic
│   │   └── db/                 Engine and session, model registry, demo data seed
│   └── tests/                  pytest suite
└── frontend/
    ├── package.json            Scripts: dev, build, preview, test
    ├── .env.example            VITE_API_URL
    ├── src/
    │   ├── api/                Typed API clients (axios)
    │   ├── components/         UI kit, navigation, charts, notifications
    │   ├── context/, hooks/    Authentication and notifications contexts, shared hooks
    │   ├── features/           auth, admin/*, workspace/*, notifications, errors
    │   ├── layouts/            AuthLayout, AdminLayout, UserLayout
    │   ├── routes/             Route tree and guards (RequireAuth, RequireRole, RoleRedirect)
    │   ├── lib/, types/        Formatting, validation (zod), permissions, shared types
    │   └── styles/             Design tokens and Tailwind entry point
    └── tests/                  Vitest suite
```

---

## Getting started

### Prerequisites
- **Python** 3.11 or newer
- **Node.js** 18 or newer, with npm
- **PostgreSQL** running locally, with two databases: one for the application (for example `taskflow_db`) and one for the tests (for example `taskflow_test`)

> The Docker files (`docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`) exist but are empty. Use the local setup below.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # then edit .env (see Configuration)

alembic upgrade head          # create or upgrade the schema
python -m app.db.seed         # load demo data (safe to run again)
uvicorn app.main:app --reload # http://localhost:8000
```

- Interactive API documentation: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:8000/api/v1
npm run dev                   # http://localhost:5173
```

Other scripts: `npm run build` (type-check and production build), `npm run preview`, `npm run test`.

---

## Configuration

The backend reads `backend/.env`. That file is git-ignored; never commit real credentials.

| Variable | Description | Example / default |
|---|---|---|
| `DATABASE_URL` | Application database (SQLAlchemy URL, psycopg driver) | `postgresql+psycopg://postgres:change_me@localhost:5432/taskflow_db` |
| `TEST_DATABASE_URL` | Test database. It **must be different** from `DATABASE_URL`, because the tests drop all tables. | `postgresql+psycopg://postgres:change_me@localhost:5432/taskflow_test` |
| `JWT_SECRET_KEY` | Secret used to sign access tokens | a long random string |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `7` |
| `REFRESH_TOKEN_REMEMBER_DAYS` | Lifetime with "Remember for 30 days" | `30` |
| `CORS_ORIGINS` | Allowed frontend origins, comma-separated | `http://localhost:5173` |
| `COOKIE_SECURE` | Send the refresh cookie over HTTPS only (set to `true` in production) | `false` |
| `FRONTEND_URL` | Base URL used in the password reset link sent by email | `http://localhost:5173` |
| `PASSWORD_RESET_EXPIRE_MINUTES` | Lifetime of a password reset link | `30` |
| `SMTP_HOST` | SMTP server for outgoing email. **Leave empty in development**: emails are then printed in the backend log. | *(empty)* |
| `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | SMTP connection and credentials | `587`, *(empty)*, *(secret)* |
| `SMTP_FROM` | Sender of the emails | `TaskFlow <no-reply@taskflow.local>` |
| `SMTP_STARTTLS` | Use STARTTLS on the SMTP connection | `true` |
| `UPLOAD_DIR` | Folder for project files, relative to `backend/` (git-ignored) | `storage/uploads` |
| `MAX_UPLOAD_SIZE_MB` | Maximum size of an uploaded file | `10` |

The frontend reads `VITE_API_URL` from `frontend/.env`. The default is `http://localhost:8000/api/v1`.

---

## Demo accounts

`python -m app.db.seed` creates about 24 users, 10 projects (3 of them archived), about 150 tasks, activity events and a few notifications. Running it again does not duplicate data.

| Name | Email | Password | Role | Status |
|---|---|---|---|---|
| Afef Ben Kalia | `afef@taskflow.io` | `Admin@1234` | Admin | Active |
| Amira Mejri | `amira.m@taskflow.io` | `Admin@1234` | Admin | Active |
| Sarah Mansour | `sarah.m@taskflow.io` | `User@1234` | Member (owner of *HR dashboard*) | Active |
| Karim Bouzid | `karim.b@taskflow.io` | `User@1234` | Member | Active |
| Nour Kefi | `nour.k@company.com` | `User@1234` | Member | Pending: sign-in is refused until an admin approves the account |
| Youssef Trabelsi | `youssef.t@taskflow.io` | `User@1234` | Member | Deactivated |

Other seeded admins use `Admin@1234` and other seeded members use `User@1234`.

**Quick tour**
1. Sign in as `afef@taskflow.io`. You land on the Admin console.
2. Sign in as `sarah.m@taskflow.io`. You land on the workspace. Opening `/admin` shows the 403 page.
3. Sign in as `nour.k@company.com`. You get the message "Your account is awaiting administrator approval."

---

## Running the tests

```bash
# Backend: needs TEST_DATABASE_URL in backend/.env
cd backend
pytest

# Frontend
cd frontend
npm run test
```

- **Backend**: authentication, RBAC, users, projects, tasks, project tabs (members, activity, files), comments, notifications, search, PDF exports, admin tasks.
- **Frontend**: routing and role guards, sign-in, task cards, project tabs, workspace pages, notifications, global search, user selection and bulk actions, export menu, admin profile, admin tasks, comments.

On the latest run, all tests passed: 293 backend tests and 94 frontend tests.

---

## API overview

Every endpoint is under `/api/v1`. The complete, always up-to-date reference is the OpenAPI documentation at `/docs`.

| Area | Endpoints |
|---|---|
| Authentication | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` |
| Current user | `GET, PATCH /me` · `PUT /me/password` · `GET /me/counts`, `/me/dashboard`, `/me/tasks`, `/me/projects`, `/me/activity` |
| Projects (members only, 404 otherwise) | `GET /projects/{id}`, `/tasks`, `/permissions`, `/activity` · members: `GET, POST /projects/{id}/members`, `DELETE /projects/{id}/members/{user_id}`, `GET /projects/{id}/member-candidates` · files: `GET, POST /projects/{id}/files`, `GET /projects/{id}/files/{file_id}/download`, `DELETE /projects/{id}/files/{file_id}` |
| Tasks | `POST /tasks` · `PATCH /tasks/{id}/status` · `GET, POST /tasks/{id}/comments` · `DELETE /tasks/{id}/comments/{comment_id}` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/{id}/read` · `POST /notifications/read-all` |
| Search | `GET /search?q=` |
| Admin (admin role required) | `/admin/stats/counts`, `/admin/stats/overview`, `/admin/stats/export` · `/admin/users` (list, create, update, role, approve, activate, deactivate, reset password, delete) · `/admin/projects` (list, create, archive, unarchive, delete, export) · `GET /admin/tasks` (read-only) · `/admin/activity` (list, export) |

Exports accept `?format=csv` (the default) or `?format=pdf`.

Every error returns `{"detail": "...", "code": "..."}`. Validation errors (422) also return `errors: [{"field", "message"}]`.

---

## Security model

- **Passwords**: hashed with bcrypt. Rules: at least 8 characters, one uppercase letter, one digit.
- **Sessions**:
  - The access token (JWT) lives only in memory.
  - The refresh token is an `httpOnly` cookie limited to `/api/v1/auth`. Only its SHA-256 hash is stored.
  - Each refresh rotates the token; reusing a revoked token revokes the whole family.
  - Changing your password ends your other sessions. An admin password reset or a deactivation ends every session of that user.
- **Authorization**:
  - The admin router requires the admin role. Refusals are logged as `auth.denied`.
  - Project access rules are pure functions in `backend/app/core/permissions.py`:
    - only project members can see a project; anyone else gets a 404;
    - only the assignee or the owner can change a task's status;
    - only the owner manages members;
    - only the uploader or the owner can delete a file;
    - only the author or the owner can delete a comment.
- **Files**: stored under a random name outside the web root. The original file name is cleaned. Downloads are sent as attachments with `nosniff`.
- **Audit**: admin actions, sign-ins, denied requests, and task, member and file events are recorded in the activity log.

---

## Known limitations

- **No working Docker setup**: `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` and the root `.env.example` are empty.
- **Placeholder link**: "Request access" on the 403 page does nothing.
- **Email**: TaskFlow sends only one email, the password reset link. It needs an SMTP server in production; without one, the email is only written to the server log.
- **Notifications**: in-app only, refreshed by polling every 60 seconds; there is no email or real-time push.
- **File storage**: uploaded files are kept on the server's local disk.
- **PDF fonts**: PDF exports use Helvetica, so non-Latin characters (for example Arabic) are not rendered.

See [requirements.md](requirements.md) for the full list of requirements and the changes made to the original specification.
