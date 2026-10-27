from enum import StrEnum
from typing import Annotated, Generic, TypeVar

from fastapi import Query

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel
from pydantic_core import PydanticCustomError

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100


class ExportFormat(StrEnum):
    """File format of the admin exports (?format=csv|pdf)."""

    CSV = "csv"
    PDF = "pdf"


# Query parameter "format" (named export_format in Python to keep the builtin).
ExportFormatQuery = Annotated[ExportFormat, Query(alias="format")]

# Messages are mirrored in frontend/src/lib/validators.ts.
NAME_MAX_LENGTH = 50


def validate_email_address(value: str) -> str:
    try:
        return validate_email(value, check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise PydanticCustomError("email", "Enter a valid email address.") from None


def validate_name(value: str, label: str) -> str:
    if not value:
        raise PydanticCustomError("name_required", f"{label} is required.")
    if len(value) > NAME_MAX_LENGTH:
        raise PydanticCustomError(
            "name_too_long", f"{label} must be at most {NAME_MAX_LENGTH} characters."
        )
    return value


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
