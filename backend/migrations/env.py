from __future__ import with_statement
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys

# Interpret the config file for Python logging.
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Add src to path and import SQLModel metadata
# Add backend (project) to sys.path, then import via 'src' package
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

# Import engine and metadata from the application
from src.db import engine as app_engine  # type: ignore # noqa: E402
from src import models as app_models  # type: ignore # noqa: E402
from sqlmodel import SQLModel  # type: ignore # noqa: E402

# Allow URL override via env var (DATABASE_URL)
db_url = os.getenv('DATABASE_URL')
if db_url:
    config.set_main_option('sqlalchemy.url', db_url)

# target_metadata for 'autogenerate'
# Ensure models are imported so metadata is populated
_ = app_models  # noqa: F401
target_metadata = SQLModel.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = app_engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
