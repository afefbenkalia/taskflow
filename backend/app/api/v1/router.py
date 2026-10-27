from fastapi import APIRouter

from app.api.v1 import auth, me, notifications, projects, search, tasks
from app.api.v1.admin import router as admin_router

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(notifications.router)
api_router.include_router(search.router)
api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(admin_router)
