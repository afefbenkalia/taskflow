import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Business error rendered as {"detail": ..., "code": ...}."""

    def __init__(
        self,
        status_code: int,
        code: str,
        detail: str,
        headers: dict[str, str] | None = None,
        errors: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.detail = detail
        self.headers = headers
        # Optional field errors, same shape as validation errors: [{"field", "message"}].
        self.errors = errors


def _error_body(detail: str, code: str, **extra: object) -> dict[str, object]:
    return {"detail": detail, "code": code, **extra}


def _status_code_slug(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase.lower().replace(" ", "_").replace("-", "_")
    except ValueError:
        return "error"


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    extra = {"errors": exc.errors} if exc.errors else {}
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(exc.detail, exc.code, **extra),
        headers=exc.headers,
    )


async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(str(exc.detail), _status_code_slug(exc.status_code)),
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", ()) if part not in ("body", "query", "path")]
        message = str(error.get("msg", "Invalid value."))
        # Pydantic prefixes messages raised from ValueError.
        message = message.removeprefix("Value error, ")
        errors.append({"field": ".".join(location) or None, "message": message})
    return JSONResponse(
        status_code=422,
        content=_error_body("Validation failed.", "validation_error", errors=errors),
    )


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=_error_body("An unexpected error occurred.", "internal_error"),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
