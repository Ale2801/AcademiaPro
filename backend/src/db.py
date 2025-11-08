from typing import Generator

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine import Engine
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


def _ensure_column(engine: Engine, table_name: str, column_name: str, column_sql: str) -> None:
    inspector = inspect(engine)
    try:
        columns = {col["name"] for col in inspector.get_columns(table_name)}
    except SQLAlchemyError:
        return

    if column_name in columns:
        return

    try:
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}"))
    except SQLAlchemyError:
        # Si la alteración falla (p. ej. por falta de permisos), preferimos continuar
        # y permitir que Alembic/futuras migraciones manejen el caso.
        return


def init_db():
    # Importar modelos para asegurar que todas las tablas estén registradas en el metadata
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)

    # Asegurar columnas nuevas en instalaciones existentes sin migraciones aplicadas
    _ensure_column(engine, "courseschedule", "duration_minutes", "duration_minutes INTEGER")
    _ensure_column(engine, "courseschedule", "start_offset_minutes", "start_offset_minutes INTEGER")
    _ensure_column(engine, "program", "is_active", "is_active BOOLEAN NOT NULL DEFAULT 1")
    # Estado del semestre académico para instalaciones sin migración
    _ensure_column(engine, "programsemester", "state", "state VARCHAR(20) DEFAULT 'planned'")
    try:
        with engine.begin() as connection:
            connection.execute(text("UPDATE programsemester SET state = 'planned' WHERE state IS NULL"))
    except SQLAlchemyError:
        pass


def get_session() -> Generator[Session, None, None]:
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()