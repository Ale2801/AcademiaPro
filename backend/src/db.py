from typing import Generator
from sqlmodel import SQLModel, create_engine, Session
from .config import settings


# Configurar engine con soporte para SQLite en tests (hilos)
if settings.database_url.startswith("sqlite"):
    engine = create_engine(
        settings.database_url,
        echo=settings.debug,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(settings.database_url, echo=settings.debug)


def init_db():
    # Importar modelos para asegurar que todas las tablas estén registradas en el metadata
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()