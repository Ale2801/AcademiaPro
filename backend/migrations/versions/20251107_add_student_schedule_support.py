"""add schedule support request table

Revision ID: 20251107_schedule_support
Revises: 20241023_merge
Create Date: 2025-11-07 04:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20251107_schedule_support"
down_revision: Union[str, None] = "20241023_merge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("schedulesupportrequest"):
        op.create_table(
            "schedulesupportrequest",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=True),
            sa.Column("message", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("preferred_course_ids", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("handled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.ForeignKeyConstraint(["student_id"], ["student.id"]),
            sa.ForeignKeyConstraint(["subject_id"], ["subject.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {index["name"] for index in inspector.get_indexes("schedulesupportrequest")}
    index_name = op.f("ix_schedulesupportrequest_student_id")
    if index_name not in existing_indexes:
        op.create_index(
            index_name,
            "schedulesupportrequest",
            ["student_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    table_exists = inspector.has_table("schedulesupportrequest")
    index_name = op.f("ix_schedulesupportrequest_student_id")
    existing_indexes = {index["name"] for index in inspector.get_indexes("schedulesupportrequest")} if table_exists else set()

    if table_exists and index_name in existing_indexes:
        op.drop_index(index_name, table_name="schedulesupportrequest")
    if table_exists:
        op.drop_table("schedulesupportrequest")
