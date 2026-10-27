from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response, status

from app.api.deps import DbSession, get_client_info
from app.core.config import settings
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
)
from app.schemas.user import UserOut
from app.services import auth_service
from app.services.auth_service import AuthResult, ClientInfo

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"

Client = Annotated[ClientInfo, Depends(get_client_info)]
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def set_refresh_cookie(response: Response, result: AuthResult) -> None:
    max_age = int((result.refresh_expires_at - datetime.now(UTC)).total_seconds())
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=result.refresh_token,
        max_age=max_age,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )


def _auth_response(response: Response, result: AuthResult) -> AuthResponse:
    set_refresh_cookie(response, result)
    return AuthResponse(
        access_token=result.access_token,
        expires_in=result.expires_in,
        user=UserOut.model_validate(result.user),
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: DbSession, client: Client) -> RegisterResponse:
    user = auth_service.register(db, data, client)
    return RegisterResponse(
        message="Account created. An administrator will review your account.",
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, response: Response, db: DbSession, client: Client) -> AuthResponse:
    return _auth_response(response, auth_service.login(db, data, client))


@router.post("/refresh", response_model=AuthResponse)
def refresh(
    response: Response, db: DbSession, client: Client, refresh_token: RefreshCookie = None
) -> AuthResponse:
    return _auth_response(response, auth_service.refresh(db, refresh_token, client))


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(data: ForgotPasswordRequest, db: DbSession, client: Client) -> MessageResponse:
    auth_service.request_password_reset(db, data.email, client)
    # Same answer whether or not the account exists.
    return MessageResponse(
        message="If an account exists for this email, we’ve sent a link to reset the password."
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(data: ResetPasswordRequest, db: DbSession, client: Client) -> MessageResponse:
    auth_service.reset_password(db, data, client)
    return MessageResponse(message="Your password has been reset. You can now sign in.")


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response, db: DbSession, client: Client, refresh_token: RefreshCookie = None
) -> MessageResponse:
    auth_service.logout(db, refresh_token, client)
    _clear_refresh_cookie(response)
    return MessageResponse(message="Signed out.")
