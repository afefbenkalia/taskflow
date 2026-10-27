from enum import StrEnum

from pydantic import BaseModel


class SearchKind(StrEnum):
    PROJECTS = "projects"
    TASKS = "tasks"
    PEOPLE = "people"


class SearchItem(BaseModel):
    id: int
    title: str
    subtitle: str
    # Page that opens the result, for the searcher's role.
    link: str
    # Project color for projects and tasks.
    color: str | None = None


class SearchGroup(BaseModel):
    kind: SearchKind
    items: list[SearchItem]


class SearchResults(BaseModel):
    query: str
    groups: list[SearchGroup]
