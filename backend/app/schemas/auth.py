import re

from pydantic import BaseModel, ConfigDict, ValidationInfo, field_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import validate_email_address as _validate_email
from app.schemas.common import validate_name as _validate_name
from app.schemas.user import UserOut, check_confirmation, check_new_password

# Messages are mirrored in frontend/src/lib/validators.ts.
PASSWORD_MIN_LENGTH = 8


class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str
    last_name: str
    email: str
    password: str

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

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        if len(value) < PASSWORD_MIN_LENGTH:
            raise PydanticCustomError(
                "password_length", f"Password must be at least {PASSWORD_MIN_LENGTH} characters."
            )
        if not re.search(r"[A-Z]", value):
            raise PydanticCustomError(
                "password_uppercase", "Password must contain at least one uppercase letter."
            )
        if not re.search(r"\d", value):
            raise PydanticCustomError(
                "password_digit", "Password must contain at least one number."
            )
        return value


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return _validate_email(value)


class ResetPasswordRequest(BaseModel):
    """The token comes from the emailed link; the rules match the profile's password change."""

    token: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def _new(cls, value: str) -> str:
        return check_new_password(value)

    @field_validator("confirm_password")
    @classmethod
    def _confirm(cls, value: str, info: ValidationInfo) -> str:
        return check_confirmation(value, info)


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str
    password: str
    remember_me: bool = False

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return _validate_email(value)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        if not value:
            raise PydanticCustomError("password_required", "Password is required.")
        return value


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class MessageResponse(BaseModel):
    message: str


class RegisterResponse(MessageResponse):
    user: UserOut
