"""
Add stored files table

Revision ID: e3b5c844cfce
Revises: c7c6ee842c4e
Create Date: 2025-12-26 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3b5c844cfce"
down_revision: Union[str, None] = "c7c6ee842c4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "storedfile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("original_name", sa.String(length=512), nullable=False),
        sa.Column("scope", sa.String(length=128), nullable=True),
        sa.Column("driver", sa.String(length=32), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["owner_user_id"], ["user.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_storedfile_driver"), "storedfile", ["driver"], unique=False)
    op.create_index(op.f("ix_storedfile_scope"), "storedfile", ["scope"], unique=False)
    op.create_index(op.f("ix_storedfile_storage_path"), "storedfile", ["storage_path"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_storedfile_storage_path"), table_name="storedfile")
    op.drop_index(op.f("ix_storedfile_scope"), table_name="storedfile")
    op.drop_index(op.f("ix_storedfile_driver"), table_name="storedfile")
    op.drop_table("storedfile")
