"""add is_active flag to program

Revision ID: 20251108_program_is_active
Revises: 8c969e077b11
Create Date: 2025-11-08 01:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20251108_program_is_active"
down_revision: Union[str, None] = "8c969e077b11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("program")}
    dialect_name = bind.dialect.name

    if "is_active" not in columns:
        op.add_column(
            "program",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
        op.execute("UPDATE program SET is_active = 1")

        if dialect_name != "sqlite":
            op.alter_column("program", "is_active", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("program")}

    if "is_active" in columns:
        op.drop_column("program", "is_active")
