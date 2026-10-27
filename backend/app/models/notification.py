from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.user import User


class Notification(Base):
    """Something that happened to one user (the recipient), shown in the bell and the Notifications page."""

    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_id_read_at", "user_id", "read_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(50))
    # Notifications about a deleted project go away with it.
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    recipient: Mapped[User] = relationship(foreign_keys=[user_id], lazy="joined")
    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id], lazy="joined")
