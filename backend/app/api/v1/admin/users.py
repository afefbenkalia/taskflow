from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import AdminUser, Client, DbSession
from app.models.user import UserRole, UserStatus
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.schemas.user import (
    AdminUserOut,
    AdminUserPage,
    PasswordResetResponse,
    RoleUpdate,
    UserCreate,
    UserCreatedResponse,
    UserUpdate,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["admin: users"])


def _out(db: DbSession, user, actor) -> AdminUserOut:
    return user_service.to_admin_out(db, [user], actor)[0]


@router.get("", response_model=AdminUserPage)
def list_users(
    db: DbSession,
    admin: AdminUser,
    search: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> AdminUserPage:
    return user_service.list_users(
        db, admin, search=search, role=role, status=status, page=page, page_size=page_size
    )


@router.post("", response_model=UserCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate, db: DbSession, admin: AdminUser, client: Client
) -> UserCreatedResponse:
    user, password = user_service.create_user(db, admin, data, client.ip)
    return UserCreatedResponse(user=_out(db, user, admin), temporary_password=password)


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int, data: UserUpdate, db: DbSession, admin: AdminUser, client: Client
) -> AdminUserOut:
    return _out(db, user_service.update_user(db, admin, user_id, data, client.ip), admin)


@router.patch("/{user_id}/role", response_model=AdminUserOut)
def change_role(
    user_id: int, data: RoleUpdate, db: DbSession, admin: AdminUser, client: Client
) -> AdminUserOut:
    return _out(db, user_service.change_role(db, admin, user_id, data.role, client.ip), admin)


@router.post("/{user_id}/approve", response_model=AdminUserOut)
def approve_user(user_id: int, db: DbSession, admin: AdminUser, client: Client) -> AdminUserOut:
    return _out(db, user_service.approve_user(db, admin, user_id, client.ip), admin)


@router.post("/{user_id}/deactivate", response_model=AdminUserOut)
def deactivate_user(
    user_id: int, db: DbSession, admin: AdminUser, client: Client
) -> AdminUserOut:
    return _out(db, user_service.deactivate_user(db, admin, user_id, client.ip), admin)


@router.post("/{user_id}/activate", response_model=AdminUserOut)
def activate_user(user_id: int, db: DbSession, admin: AdminUser, client: Client) -> AdminUserOut:
    return _out(db, user_service.activate_user(db, admin, user_id, client.ip), admin)


@router.post("/{user_id}/reset-password", response_model=PasswordResetResponse)
def reset_password(
    user_id: int, db: DbSession, admin: AdminUser, client: Client
) -> PasswordResetResponse:
    password = user_service.reset_password(db, admin, user_id, client.ip)
    return PasswordResetResponse(temporary_password=password)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: DbSession, admin: AdminUser, client: Client) -> Response:
    user_service.delete_user(db, admin, user_id, client.ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
