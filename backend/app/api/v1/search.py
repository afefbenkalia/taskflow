from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.search import SearchResults
from app.services import search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResults)
def search(db: DbSession, user: CurrentUser, q: Annotated[str, Query(max_length=100)] = "") -> SearchResults:
    return search_service.search(db, user, q)
