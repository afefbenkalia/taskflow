from fastapi import APIRouter, Depends

from app.api.deps import require_admin
from app.api.v1.admin import activity, projects, stats, tasks, users

# Every route mounted here requires the admin role.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
router.include_router(stats.router)
router.include_router(users.router)
router.include_router(projects.router)
router.include_router(tasks.router)
router.include_router(activity.router)


# Lightweight RBAC probe kept for tests and monitoring.
@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "ok"}
