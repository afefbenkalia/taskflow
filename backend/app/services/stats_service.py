import csv
import io
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import pdf
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.user import User, UserStatus
from app.schemas.stats import (
    Kpi,
    Overview,
    SidebarCounts,
    StatsPeriod,
    StatusBreakdown,
    ThroughputWeek,
    WorkloadEntry,
)
from app.schemas.user import UserBrief
from app.services import activity_service
from app.services.project_service import compute_progress

SPARKLINE_POINTS = 8
THROUGHPUT_WEEKS = 8
WORKLOAD_CAPACITY = 10
WORKLOAD_SIZE = 4


@dataclass(frozen=True)
class _TaskRow:
    status: TaskStatus
    created_at: datetime
    completed_at: datetime | None
    due_date: date | None
    assignee_id: int | None


def _active_project_tasks(db: Session) -> list[_TaskRow]:
    """Statistics only consider tasks that belong to non-archived projects."""
    rows = db.execute(
        select(Task.status, Task.created_at, Task.completed_at, Task.due_date, Task.assignee_id)
        .join(Project, Project.id == Task.project_id)
        .where(Project.archived.is_(False))
    ).all()
    return [_TaskRow(*row) for row in rows]


def _is_done_at(task: _TaskRow, moment: datetime) -> bool:
    if task.completed_at is not None:
        return task.completed_at <= moment
    return task.status == TaskStatus.DONE


def is_overdue_at(task: _TaskRow, moment: datetime) -> bool:
    """Open at `moment` (status != done) with a due date before that day."""
    return (
        task.created_at <= moment
        and not _is_done_at(task, moment)
        and task.due_date is not None
        and task.due_date < moment.date()
    )


def percent_delta(value: int, previous: int) -> int:
    if previous == 0:
        return 100 if value else 0
    return round((value - previous) * 100 / previous)


def sidebar_counts(db: Session) -> SidebarCounts:
    return SidebarCounts(
        users=db.scalar(select(func.count(User.id))) or 0,
        projects=db.scalar(select(func.count(Project.id)).where(Project.archived.is_(False))) or 0,
        tasks=db.scalar(
            select(func.count(Task.id))
            .join(Project, Project.id == Task.project_id)
            .where(Project.archived.is_(False))
        ) or 0,
    )


def _kpis(
    db: Session, tasks: list[_TaskRow], now: datetime, days: int
) -> list[Kpi]:
    start = now - timedelta(days=days)
    previous_start = start - timedelta(days=days)
    step = timedelta(days=days) / SPARKLINE_POINTS
    bucket_ends = [start + step * (index + 1) for index in range(SPARKLINE_POINTS)]

    users_created = list(db.scalars(select(User.created_at)))
    projects_created = list(
        db.scalars(select(Project.created_at).where(Project.archived.is_(False)))
    )

    def created_before(created: list[datetime], moment: datetime) -> int:
        return sum(value <= moment for value in created)

    def completed_between(after: datetime, until: datetime) -> int:
        return sum(
            task.completed_at is not None and after < task.completed_at <= until for task in tasks
        )

    def overdue_at(moment: datetime) -> int:
        return sum(is_overdue_at(task, moment) for task in tasks)

    users_now = len(users_created)
    projects_now = len(projects_created)
    completed_now = completed_between(start, now)
    overdue_now = overdue_at(now)
    bucket_starts = [start, *bucket_ends[:-1]]

    return [
        Kpi(
            key="users",
            label="Total users",
            value=users_now,
            delta=percent_delta(users_now, created_before(users_created, start)),
            sparkline=[created_before(users_created, end) for end in bucket_ends],
        ),
        Kpi(
            key="projects",
            label="Active projects",
            value=projects_now,
            delta=percent_delta(projects_now, created_before(projects_created, start)),
            sparkline=[created_before(projects_created, end) for end in bucket_ends],
        ),
        Kpi(
            key="completed",
            label="Tasks completed",
            value=completed_now,
            delta=percent_delta(completed_now, completed_between(previous_start, start)),
            sparkline=[completed_between(a, b) for a, b in zip(bucket_starts, bucket_ends)],
        ),
        Kpi(
            key="overdue",
            label="Overdue tasks",
            value=overdue_now,
            delta=percent_delta(overdue_now, overdue_at(start)),
            sparkline=[overdue_at(end) for end in bucket_ends],
        ),
    ]


def _throughput(tasks: list[_TaskRow], now: datetime) -> list[ThroughputWeek]:
    this_monday = now.date() - timedelta(days=now.date().weekday())
    weeks = []
    for offset in range(THROUGHPUT_WEEKS - 1, -1, -1):
        week_start = this_monday - timedelta(weeks=offset)
        week_end = week_start + timedelta(days=7)
        weeks.append(
            ThroughputWeek(
                label=f"W{week_start.isocalendar().week}",
                created=sum(week_start <= task.created_at.date() < week_end for task in tasks),
                completed=sum(
                    task.completed_at is not None
                    and week_start <= task.completed_at.date() < week_end
                    for task in tasks
                ),
            )
        )
    return weeks


def _status(tasks: list[_TaskRow], now: datetime, projects: int) -> StatusBreakdown:
    # An overdue task is counted only as "overdue".
    overdue = [task for task in tasks if is_overdue_at(task, now)]
    rest = [task for task in tasks if not is_overdue_at(task, now)]
    by_status = Counter(task.status for task in rest)
    return StatusBreakdown(
        done=by_status[TaskStatus.DONE],
        in_progress=by_status[TaskStatus.IN_PROGRESS],
        todo=by_status[TaskStatus.TODO],
        overdue=len(overdue),
        total=len(tasks),
        projects=projects,
    )


def _completion(tasks: list[_TaskRow], now: datetime, days: int) -> tuple[int, int]:
    start = now - timedelta(days=days)
    rate = compute_progress(sum(task.status == TaskStatus.DONE for task in tasks), len(tasks))
    existing = [task for task in tasks if task.created_at <= start]
    rate_at_start = compute_progress(
        sum(_is_done_at(task, start) for task in existing), len(existing)
    )
    return rate, rate - rate_at_start


def _workload(db: Session, tasks: list[_TaskRow]) -> list[WorkloadEntry]:
    open_by_user = Counter(
        task.assignee_id for task in tasks
        if task.status != TaskStatus.DONE and task.assignee_id is not None
    )
    users = db.scalars(select(User).where(User.status == UserStatus.ACTIVE)).all()
    ranked = sorted(users, key=lambda user: (-open_by_user[user.id], user.first_name, user.id))
    return [
        WorkloadEntry(
            user=UserBrief.model_validate(user),
            open_tasks=open_by_user[user.id],
            capacity=WORKLOAD_CAPACITY,
        )
        for user in ranked[:WORKLOAD_SIZE]
    ]


def overview(db: Session, period: StatsPeriod) -> Overview:
    now = datetime.now(UTC)
    tasks = _active_project_tasks(db)
    projects = db.scalar(select(func.count(Project.id)).where(Project.archived.is_(False))) or 0
    rate, rate_delta = _completion(tasks, now, period.days)
    return Overview(
        period=period,
        kpis=_kpis(db, tasks, now, period.days),
        throughput=_throughput(tasks, now),
        status=_status(tasks, now, projects),
        completion_rate=rate,
        completion_delta=rate_delta,
        workload=_workload(db, tasks),
        admin_activity=activity_service.recent_admin_activity(db),
    )


def export_csv(db: Session, period: StatsPeriod) -> str:
    data = overview(db, period)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Section", "Metric", "Value", "Delta"])
    for kpi in data.kpis:
        writer.writerow(["KPI", kpi.label, kpi.value, f"{kpi.delta}%"])
    for week in data.throughput:
        writer.writerow(["Throughput", f"{week.label} created", week.created, ""])
        writer.writerow(["Throughput", f"{week.label} completed", week.completed, ""])
    status = data.status
    for label, value in (("Done", status.done), ("In progress", status.in_progress),
                         ("To do", status.todo), ("Overdue", status.overdue),
                         ("Total", status.total)):
        writer.writerow(["Tasks by status", label, value, ""])
    writer.writerow(["Completion", "Completion rate", f"{data.completion_rate}%",
                     f"{data.completion_delta} pts"])
    for entry in data.workload:
        writer.writerow(["Team workload", entry.user.full_name,
                         f"{entry.open_tasks} / {entry.capacity}", ""])
    return buffer.getvalue()


# The report's tables only have three columns: keep them compact.
REPORT_TABLE_WIDTH = 0.6


def _signed(value: int, unit: str) -> str:
    return f"{value:+d}{unit}"


def export_pdf(db: Session, period: StatsPeriod) -> bytes:
    """The Overview report: the same figures as the CSV export, one table per section."""
    data = overview(db, period)
    status = data.status
    total = status.total or 1

    def share(value: int) -> str:
        return f"{round(value * 100 / total)}%"

    return pdf.build_pdf(
        "Workspace report",
        [
            pdf.PdfTable(
                title="Key figures",
                headers=["Metric", "Value", "Change vs previous period"],
                rows=[[kpi.label, kpi.value, _signed(kpi.delta, "%")] for kpi in data.kpis],
                widths=[3, 1, 2],
                numeric=frozenset({1, 2}),
                width_ratio=REPORT_TABLE_WIDTH,
            ),
            pdf.PdfTable(
                title="Tasks by status",
                headers=["Status", "Tasks", "Share"],
                rows=[
                    [label, value, share(value)]
                    for label, value in (("Done", status.done), ("In progress", status.in_progress),
                                         ("To do", status.todo), ("Overdue", status.overdue))
                ] + [["Total", status.total, "100%" if status.total else "0%"]],
                widths=[3, 1, 2],
                numeric=frozenset({1, 2}),
                width_ratio=REPORT_TABLE_WIDTH,
            ),
            pdf.PdfTable(
                title="Completion",
                headers=["Metric", "Value", "Change vs start of period"],
                rows=[["Completion rate", f"{data.completion_rate}%",
                       _signed(data.completion_delta, " pts")]],
                widths=[3, 1, 2],
                numeric=frozenset({1, 2}),
                width_ratio=REPORT_TABLE_WIDTH,
            ),
            pdf.PdfTable(
                title="Weekly throughput",
                headers=["Week", "Tasks created", "Tasks completed"],
                rows=[[week.label, week.created, week.completed] for week in data.throughput],
                widths=[3, 1.5, 1.5],
                numeric=frozenset({1, 2}),
                width_ratio=REPORT_TABLE_WIDTH,
                empty_message="No tasks in this period.",
            ),
            pdf.PdfTable(
                title="Team workload",
                headers=["Member", "Open tasks", "Capacity"],
                rows=[[entry.user.full_name, entry.open_tasks, entry.capacity] for entry in data.workload],
                widths=[3, 1.5, 1.5],
                numeric=frozenset({1, 2}),
                width_ratio=REPORT_TABLE_WIDTH,
                empty_message="Nobody has open tasks.",
            ),
        ],
        details=[
            ("Period", f"Last {period.days} days"),
            ("Scope", f"{status.total} tasks across {status.projects} active projects"),
        ],
    )
