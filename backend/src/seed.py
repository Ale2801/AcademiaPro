from sqlmodel import Session, select

from .db import engine
from .models import User
from .security import get_password_hash


DEFAULT_ADMIN_EMAIL = "admin@academiapro.dev"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NAME = "Administrador Demo"


def ensure_default_admin() -> None:
    """Create a default admin user for local development if none exists."""
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == DEFAULT_ADMIN_EMAIL)).first()
        if existing:
            return
        user = User(
            email=DEFAULT_ADMIN_EMAIL,
            full_name=DEFAULT_ADMIN_NAME,
            hashed_password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.commit()
