from datetime import date
from enum import StrEnum

from pydantic import BaseModel

from app.schemas.activity import ActivityOut
from app.schemas.project import MyProjectOut
from app.schemas.task import TaskOut
from app.schemas.user import UserBrief


class StatsPeriod(StrEnum):
    LAST_7_DAYS = "7d"
    LAST_30_DAYS = "30d"
    LAST_90_DAYS = "90d"

    @property
    def days(self) -> int:
        return int(self.value.removesuffix("d"))


class SidebarCounts(BaseModel):
    users: int
    projects: int
    tasks: int


class Kpi(BaseModel):
    key: str
    label: str
    value: int
    delta: int  # percent change vs the previous period of the same length
    sparkline: list[int]


class ThroughputWeek(BaseModel):
    label: str
    created: int
    completed: int


class StatusBreakdown(BaseModel):
    done: int
    in_progress: int
    todo: int
    overdue: int
    total: int
    projects: int


class WorkloadEntry(BaseModel):
    user: UserBrief
    open_tasks: int
    capacity: int


class Overview(BaseModel):
    period: StatsPeriod
    kpis: list[Kpi]
    throughput: list[ThroughputWeek]
    status: StatusBreakdown
    completion_rate: int
    completion_delta: int  # percentage points vs the start of the period
    workload: list[WorkloadEntry]
    admin_activity: list[ActivityOut]


# --- member dashboard (workspace Home) ---------------------------------------------


class DashboardHero(BaseModel):
    due_this_week: int
    overdue: int
    weekly_done: int
    weekly_target: int


class DashboardStats(BaseModel):
    assigned_open: int
    high_priority: int
    due_this_week: int
    overdue: int
    completed_this_month: int
    completed_prev_month: int
    prev_month_label: str


class FocusCounts(BaseModel):
    today: int
    upcoming: int
    overdue: int


class DashboardFocus(BaseModel):
    today: list[TaskOut]
    upcoming: list[TaskOut]
    overdue: list[TaskOut]
    counts: FocusCounts


class WeekDay(BaseModel):
    date: date
    has_due: bool


class Dashboard(BaseModel):
    hero: DashboardHero
    stats: DashboardStats
    focus: DashboardFocus
    my_projects: list[MyProjectOut]
    week: list[WeekDay]
    next_deadline: TaskOut | None
