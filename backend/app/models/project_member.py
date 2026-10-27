from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.user import User


class ProjectRole(StrEnum):
    OWNER = "owner"
    MEMBER = "member"


class ProjectMember(Base):
    __tablename__ = "project_members"

    # The composite primary key also enforces UNIQUE (project_id, user_id).
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role_in_project: Mapped[ProjectRole] = mapped_column(
        Enum(ProjectRole, name="project_role", values_callable=lambda e: [m.value for m in e]),
        default=ProjectRole.MEMBER,
        server_default=ProjectRole.MEMBER.value,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship(lazy="joined")
