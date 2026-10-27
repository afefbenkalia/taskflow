import re
from datetime import datetime
from functools import cache
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, ValidationInfo, field_validator
from pydantic_core import PydanticCustomError

from app.models.user import UserRole, UserStatus
from app.schemas.common import Page
from app.schemas.common import validate_email_address as _validate_email
from app.schemas.common import validate_name as _validate_name

JOB_TITLE_MAX_LENGTH = 100


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    full_name: str
    email: str
    role: UserRole
    status: UserStatus
    job_title: str | None = None
    created_at: datetime


class UserBrief(BaseModel):
    """Compact user reference used inside projects, workload and activity rows."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    full_name: str
    role: UserRole


class AdminUserOut(UserOut):
    projects_count: int
    last_active_at: datetime | None = None
    is_self: bool


class UserCounts(BaseModel):
    all: int
    admins: int
    members: int
    pending: int
    deactivated: int


class AdminUserPage(Page[AdminUserOut]):
    counts: UserCounts


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str
    last_name: str
    email: str
    role: UserRole = UserRole.USER

    @field_validator("first_name")
    @classmethod
    def _first_name(cls, value: str) -> str:
        return _validate_name(value, "First name")

    @field_validator("last_name")
    @classmethod
    def _last_name(cls, value: str) -> str:
        return _validate_name(value, "Last name")

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return _validate_email(value)


class UserUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    job_title: str | None = None

    @field_validator("first_name")
    @classmethod
    def _first_name(cls, value: str | None) -> str | None:
        return None if value is None else _validate_name(value, "First name")

    @field_validator("last_name")
    @classmethod
    def _last_name(cls, value: str | None) -> str | None:
        return None if value is None else _validate_name(value, "Last name")

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return None if value is None else _validate_email(value)

    @field_validator("job_title")
    @classmethod
    def _job_title(cls, value: str | None) -> str | None:
        if value is not None and len(value) > JOB_TITLE_MAX_LENGTH:
            raise PydanticCustomError(
                "job_title_too_long",
                f"Job title must be at most {JOB_TITLE_MAX_LENGTH} characters.",
            )
        return value or None


class RoleUpdate(BaseModel):
    role: UserRole


class UserCreatedResponse(BaseModel):
    user: AdminUserOut
    temporary_password: str


class PasswordResetResponse(BaseModel):
    temporary_password: str


# --- current user (member workspace) ---------------------------------------------

PHONE_PATTERN = re.compile(r"^[+0-9 ().-]{6,30}$")


@cache
def _timezones() -> frozenset[str]:
    return frozenset(available_timezones())


class MeOut(UserOut):
    phone: str | None = None
    timezone: str
    last_active_at: datetime | None = None
    password_changed_at: datetime | None = None
    sessions_count: int


class MeCounts(BaseModel):
    open_tasks: int
    projects: int


class MeUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    job_title: str | None = None
    timezone: str | None = None

    @field_validator("first_name")
    @classmethod
    def _first_name(cls, value: str | None) -> str | None:
        return None if value is None else _validate_name(value, "First name")

    @field_validator("last_name")
    @classmethod
    def _last_name(cls, value: str | None) -> str | None:
        return None if value is None else _validate_name(value, "Last name")

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return None if value is None else _validate_email(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        if value and not PHONE_PATTERN.fullmatch(value):
            raise PydanticCustomError("phone", "Enter a valid phone number.")
        return value or None

    @field_validator("job_title")
    @classmethod
    def _job_title(cls, value: str | None) -> str | None:
        if value is not None and len(value) > JOB_TITLE_MAX_LENGTH:
            raise PydanticCustomError(
                "job_title_too_long",
                f"Job title must be at most {JOB_TITLE_MAX_LENGTH} characters.",
            )
        return value or None

    @field_validator("timezone")
    @classmethod
    def _timezone(cls, value: str | None) -> str | None:
        if value is not None and value not in _timezones():
            raise PydanticCustomError("timezone", "Choose a valid time zone.")
        return value


def check_new_password(value: str) -> str:
    """Rules for a new password (profile change and forgot-password reset)."""
    # Short messages, as in the Profile design ("Must include at least one number.").
    if len(value) < 8:
        raise PydanticCustomError("password_length", "Must be at least 8 characters.")
    if not re.search(r"[A-Z]", value):
        raise PydanticCustomError("password_uppercase", "Must include at least one uppercase letter.")
    if not re.search(r"\d", value):
        raise PydanticCustomError("password_digit", "Must include at least one number.")
    return value


def check_confirmation(value: str, info: ValidationInfo) -> str:
    if value != info.data.get("new_password", value):
        raise PydanticCustomError("password_mismatch", "Passwords don’t match.")
    return value


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

    @field_validator("current_password")
    @classmethod
    def _current(cls, value: str) -> str:
        if not value:
            raise PydanticCustomError("required", "Current password is required.")
        return value

    @field_validator("new_password")
    @classmethod
    def _new(cls, value: str) -> str:
        return check_new_password(value)

    @field_validator("confirm_password")
    @classmethod
    def _confirm(cls, value: str, info: ValidationInfo) -> str:
        return check_confirmation(value, info)
