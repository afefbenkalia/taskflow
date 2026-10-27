"""Member workspace project tabs: Overview data, Members, Activity and Files."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models.activity_log import ActivityLog
from app.models.project_file import ProjectFile
from app.models.project_member import ProjectMember
from app.models.task import Task, TaskStatus
from app.services.file_service import clean_content_type, clean_name
from app.services.project_service import today
from tests.conftest import MEMBER_PASSWORD, make_project, make_task, make_user

URL = "/api/v1/projects"


def bearer(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def karim(db_session: Session):
    return make_user(db_session, first_name="Karim", last_name="Bouzid",
                     email="karim.b@taskflow.io", password=MEMBER_PASSWORD)


@pytest.fixture
def leila(db_session: Session):
    return make_user(db_session, first_name="Leila", last_name="Haddad",
                     email="leila.h@taskflow.io", password=MEMBER_PASSWORD)


@pytest.fixture
def project(db_session: Session, member_user, karim):
    """Owned by Sarah (member_user); Karim is a member; Leila is not."""
    project = make_project(db_session, member_user, key="HRD", name="HR dashboard",
                           due_date=today() + timedelta(days=10), members=(karim,))
    make_task(db_session, project, status=TaskStatus.DONE, assignee=karim)
    make_task(db_session, project, status=TaskStatus.TODO, assignee=karim)
    make_task(db_session, project, status=TaskStatus.IN_PROGRESS, assignee=member_user)
    return project


@pytest.mark.parametrize(
    ("method", "suffix"),
    [("get", "/member-candidates"), ("post", "/members"), ("delete", "/members/1"),
     ("get", "/activity"), ("get", "/files"), ("post", "/files"),
     ("get", "/files/1/download"), ("delete", "/files/1")],
)
def test_tabs_are_hidden_from_non_members(client, project, leila, method, suffix) -> None:
    response = client.request(method, f"{URL}/{project.id}{suffix}", headers=bearer(leila))

    assert response.status_code == 404
    assert response.json()["code"] == "project_not_found"


def test_project_detail_counts_files(client, project, member_user) -> None:
    client.post(f"{URL}/{project.id}/files", headers=bearer(member_user),
                files={"file": ("brief.pdf", b"%PDF-1.7", "application/pdf")})

    body = client.get(f"{URL}/{project.id}", headers=bearer(member_user)).json()

    assert body["files_count"] == 1
    assert body["created_at"]


# --- Members -----------------------------------------------------------------------


def test_members_include_workload_and_removal_rights(client, project, member_user, karim) -> None:
    as_owner = client.get(f"{URL}/{project.id}/members", headers=bearer(member_user)).json()
    as_member = client.get(f"{URL}/{project.id}/members", headers=bearer(karim)).json()

    sarah, karim_row = as_owner
    assert (sarah["role_in_project"], sarah["open_tasks"], sarah["done_tasks"]) == ("owner", 1, 0)
    assert (karim_row["email"], karim_row["open_tasks"], karim_row["done_tasks"]) == (
        "karim.b@taskflow.io", 1, 1,
    )
    assert karim_row["joined_at"]
    # Only the owner can remove, and never the owner's own membership.
    assert [row["can_remove"] for row in as_owner] == [False, True]
    assert [row["can_remove"] for row in as_member] == [False, False]


def test_member_candidates_are_active_non_members(
    client, project, member_user, leila, pending_user, karim
) -> None:
    response = client.get(f"{URL}/{project.id}/member-candidates", headers=bearer(member_user))

    assert response.status_code == 200
    emails = [row["email"] for row in response.json()]
    assert "leila.h@taskflow.io" in emails
    assert pending_user.email not in emails
    assert karim.email not in emails and member_user.email not in emails


def test_only_the_owner_manages_members(client, project, karim, leila) -> None:
    headers = bearer(karim)

    candidates = client.get(f"{URL}/{project.id}/member-candidates", headers=headers)
    added = client.post(f"{URL}/{project.id}/members", headers=headers, json={"user_id": leila.id})
    removed = client.delete(f"{URL}/{project.id}/members/{karim.id}", headers=headers)

    for response in (candidates, added, removed):
        assert response.status_code == 403
        # Not "forbidden": the frontend must not redirect to the 403 page.
        assert response.json()["code"] == "members_manage_forbidden"


def test_owner_adds_a_member(client, db_session, project, member_user, leila) -> None:
    response = client.post(f"{URL}/{project.id}/members", headers=bearer(member_user),
                           json={"user_id": leila.id})

    assert response.status_code == 201
    assert "Leila Haddad" in [row["user"]["full_name"] for row in response.json()]
    assert client.get(f"{URL}/{project.id}", headers=bearer(leila)).status_code == 200
    entry = db_session.scalars(
        select(ActivityLog).where(ActivityLog.action == "project.member_added")
    ).one()
    assert entry.details["member"] == "Leila Haddad"


def test_add_member_validation(client, project, member_user, karim, pending_user) -> None:
    headers = bearer(member_user)

    duplicate = client.post(f"{URL}/{project.id}/members", headers=headers, json={"user_id": karim.id})
    pending = client.post(f"{URL}/{project.id}/members", headers=headers,
                          json={"user_id": pending_user.id})
    unknown = client.post(f"{URL}/{project.id}/members", headers=headers, json={"user_id": 999999})

    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "already_member"
    assert pending.status_code == unknown.status_code == 400
    assert pending.json()["errors"] == [{"field": "user_id", "message": "Choose an active user."}]


def test_owner_removes_a_member_and_frees_open_tasks(
    client, db_session, project, member_user, karim
) -> None:
    response = client.delete(f"{URL}/{project.id}/members/{karim.id}", headers=bearer(member_user))

    assert response.status_code == 204
    db_session.expire_all()
    assert db_session.get(ProjectMember, (project.id, karim.id)) is None
    tasks = db_session.scalars(select(Task).where(Task.project_id == project.id)).all()
    by_status = {task.status: task.assignee_id for task in tasks}
    assert by_status[TaskStatus.TODO] is None  # open task unassigned
    assert by_status[TaskStatus.DONE] == karim.id  # completed work keeps its history
    assert client.get(f"{URL}/{project.id}", headers=bearer(karim)).status_code == 404


def test_owner_cannot_be_removed(client, project, member_user) -> None:
    response = client.delete(f"{URL}/{project.id}/members/{member_user.id}",
                             headers=bearer(member_user))

    assert response.status_code == 400
    assert response.json()["code"] == "cannot_remove_owner"


def test_remove_unknown_member(client, project, member_user, leila) -> None:
    response = client.delete(f"{URL}/{project.id}/members/{leila.id}", headers=bearer(member_user))

    assert response.status_code == 404
    assert response.json()["code"] == "member_not_found"


# --- Activity ------------------------------------------------------------------------


def test_project_activity_is_scoped_and_has_no_ip(
    client, db_session, project, member_user, karim, leila
) -> None:
    other = make_project(db_session, leila, key="OPS", name="Ops")
    client.post("/api/v1/tasks", headers=bearer(karim),
                json={"title": "Draft KPIs", "project_id": project.id})
    client.post("/api/v1/tasks", headers=bearer(leila), json={"title": "Elsewhere", "project_id": other.id})
    client.post(f"{URL}/{project.id}/members", headers=bearer(member_user), json={"user_id": leila.id})
    client.post(f"{URL}/{project.id}/files", headers=bearer(karim),
                files={"file": ("kpis.csv", b"a,b\n1,2\n", "text/csv")})
    # Account events are not project activity.
    client.post("/api/v1/auth/login", json={"email": karim.email, "password": MEMBER_PASSWORD})

    response = client.get(f"{URL}/{project.id}/activity", headers=bearer(karim))

    assert response.status_code == 200
    body = response.json()
    actions = [item["action"] for item in body["items"]]
    assert actions == ["file.uploaded", "project.member_added", "task.created"]
    assert body["total"] == 3
    assert all("ip" not in item for item in body["items"])
    assert body["items"][0]["entity_label"] == "kpis.csv"
    assert body["items"][2]["actor"]["full_name"] == "Karim Bouzid"


def test_project_activity_paginates(client, project, karim) -> None:
    for number in range(3):
        client.post("/api/v1/tasks", headers=bearer(karim),
                    json={"title": f"Task {number}", "project_id": project.id})

    first = client.get(f"{URL}/{project.id}/activity", headers=bearer(karim),
                       params={"page_size": 2}).json()
    second = client.get(f"{URL}/{project.id}/activity", headers=bearer(karim),
                        params={"page": 2, "page_size": 2}).json()

    assert (len(first["items"]), len(second["items"]), first["total"]) == (2, 1, 3)
    assert second["items"][0]["entity_label"] == "Task 0"


# --- Files ---------------------------------------------------------------------------


def upload(client, project, user, name="brief.pdf", content=b"%PDF-1.7 demo", kind="application/pdf"):
    return client.post(f"{URL}/{project.id}/files", headers=bearer(user),
                       files={"file": (name, content, kind)})


def test_upload_list_and_download(client, project, karim, member_user, upload_dir) -> None:
    created = upload(client, project, karim)

    assert created.status_code == 201
    body = created.json()
    assert (body["name"], body["content_type"], body["size_bytes"]) == (
        "brief.pdf", "application/pdf", 13,
    )
    assert body["uploaded_by"]["full_name"] == "Karim Bouzid"
    assert body["can_delete"] is True
    assert len(list(upload_dir.iterdir())) == 1

    listed = client.get(f"{URL}/{project.id}/files", headers=bearer(member_user)).json()
    assert [row["name"] for row in listed] == ["brief.pdf"]
    assert listed[0]["can_delete"] is True  # the owner can delete any file

    download = client.get(f"{URL}/{project.id}/files/{body['id']}/download", headers=bearer(member_user))
    assert download.status_code == 200
    assert download.content == b"%PDF-1.7 demo"
    assert download.headers["content-disposition"].startswith("attachment")
    assert download.headers["x-content-type-options"] == "nosniff"


def test_member_cannot_delete_someone_elses_file(client, project, member_user, karim) -> None:
    file_id = upload(client, project, member_user).json()["id"]

    listed = client.get(f"{URL}/{project.id}/files", headers=bearer(karim)).json()
    response = client.delete(f"{URL}/{project.id}/files/{file_id}", headers=bearer(karim))

    assert listed[0]["can_delete"] is False
    assert response.status_code == 403
    assert response.json()["code"] == "file_delete_forbidden"


@pytest.mark.parametrize("uploader", ["karim", "member_user"])
def test_uploader_and_owner_delete_files(
    client, db_session, project, member_user, karim, upload_dir, uploader
) -> None:
    file_id = upload(client, project, karim).json()["id"]
    actor = {"karim": karim, "member_user": member_user}[uploader]

    response = client.delete(f"{URL}/{project.id}/files/{file_id}", headers=bearer(actor))

    assert response.status_code == 204
    assert list(upload_dir.iterdir()) == []
    assert db_session.get(ProjectFile, file_id) is None
    assert client.get(f"{URL}/{project.id}/files/{file_id}/download",
                      headers=bearer(karim)).status_code == 404


def test_file_from_another_project_is_not_found(client, db_session, project, karim, leila) -> None:
    other = make_project(db_session, leila, key="OPS", name="Ops", members=(karim,))
    file_id = upload(client, other, leila).json()["id"]

    response = client.get(f"{URL}/{project.id}/files/{file_id}/download", headers=bearer(karim))

    assert response.status_code == 404
    assert response.json()["code"] == "file_not_found"


def test_upload_limits(client, project, karim, upload_dir, monkeypatch) -> None:
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 1)

    too_large = upload(client, project, karim, content=b"x" * (1024 * 1024 + 1))
    empty = upload(client, project, karim, content=b"")

    assert too_large.status_code == 413
    assert too_large.json() == {"detail": "Files must be 1 MB or smaller.", "code": "file_too_large"}
    assert empty.status_code == 400
    assert empty.json()["code"] == "file_empty"
    assert list(upload_dir.iterdir()) == []  # nothing left behind


def test_deleting_a_project_removes_its_files(
    client, admin_headers, project, karim, upload_dir
) -> None:
    upload(client, project, karim)

    response = client.delete(f"/api/v1/admin/projects/{project.id}", headers=admin_headers)

    assert response.status_code == 204
    assert list(upload_dir.iterdir()) == []


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("report.pdf", "report.pdf"),
        ("../../etc/passwd", "passwd"),
        ("C:\\Users\\sarah\\notes.txt", "notes.txt"),
        ('bad<name>|?.png', "bad_name___.png"),
        ("", "file"),
        ("...", "file"),
        ("a" * 300 + ".docx", "a" * 250 + ".docx"),
    ],
)
def test_clean_name(raw, expected) -> None:
    assert clean_name(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("image/png", "image/png"), ("text/csv; charset=utf-8", "text/csv"),
     ("<script>", "application/octet-stream"), (None, "application/octet-stream")],
)
def test_clean_content_type(raw, expected) -> None:
    assert clean_content_type(raw) == expected
