from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.project import Project
from app.models.user import User, UserRole
from app.services import activity_service, project_service
from app.services.auth_service import ClientInfo

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def get_client_info(request: Request) -> ClientInfo:
    return ClientInfo(
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(
            401, "not_authenticated", "Not authenticated.", {"WWW-Authenticate": "Bearer"}
        )

    payload = decode_access_token(credentials.credentials)
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise AppError(401, "invalid_token", "Invalid authentication token.") from None

    user = db.get(User, user_id)
    if user is None:
        raise AppError(401, "invalid_token", "Invalid authentication token.")
    if not user.is_active:
        raise AppError(403, "account_inactive", "This account is not active.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_project_for_member(project_id: int, db: DbSession, user: CurrentUser) -> Project:
    """The project, or 404 "Project not found" when it is missing or the user is not a member."""
    return project_service.get_project_for_member(db, user, project_id)


MemberProject = Annotated[Project, Depends(get_project_for_member)]


def require_role(*roles: UserRole | str) -> Callable[..., User]:
    allowed = {UserRole(role) for role in roles}
    label = " or ".join(sorted(role.value.capitalize() for role in allowed))

    def dependency(request: Request, db: DbSession, user: CurrentUser) -> User:
        if user.role not in allowed:
            activity_service.log(
                db,
                user.id,
                "auth.denied",
                "route",
                details={"method": request.method, "path": request.url.path},
                ip=request.client.host if request.client else None,
            )
            db.commit()
            raise AppError(403, "forbidden", f"{label} role required")
        return user

    return dependency


require_admin = require_role(UserRole.ADMIN)

# Resolved once per request: the admin router already depends on require_admin.
AdminUser = Annotated[User, Depends(require_admin)]
Client = Annotated[ClientInfo, Depends(get_client_info)]


def csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def pdf_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
