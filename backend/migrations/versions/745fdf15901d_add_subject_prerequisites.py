"""add subject prerequisites join table

Revision ID: 745fdf15901d
Revises: e0b7643c8f6b
Create Date: 2025-11-23 01:23:16.108179

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision: str = "745fdf15901d"
down_revision: Union[str, Sequence[str], None] = "e0b7643c8f6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_NAME = "subjectprerequisite"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    table_exists = inspector.has_table(TABLE_NAME)

    if not table_exists:
        _create_subject_prerequisite_table()
        _ensure_indexes(inspect(op.get_bind()))
        return

    columns = {column["name"] for column in inspector.get_columns(TABLE_NAME)}
    pk_columns = set(inspector.get_pk_constraint(TABLE_NAME).get("constrained_columns") or [])
    needs_rebuild = "id" in columns or pk_columns != {"subject_id", "prerequisite_subject_id"}

    if needs_rebuild:
        with op.batch_alter_table(TABLE_NAME, recreate="auto") as batch_op:
            if "id" in columns:
                batch_op.drop_column("id")
            batch_op.create_primary_key(
                "pk_subjectprerequisite",
                ["subject_id", "prerequisite_subject_id"],
            )

    _ensure_indexes(inspect(op.get_bind()))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table(TABLE_NAME):
        op.drop_table(TABLE_NAME)


def _create_subject_prerequisite_table() -> None:
    op.create_table(
        TABLE_NAME,
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("prerequisite_subject_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subject.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prerequisite_subject_id"], ["subject.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("subject_id", "prerequisite_subject_id", name="pk_subjectprerequisite"),
    )


def _ensure_indexes(inspector: Inspector) -> None:
    existing_indexes = {index["name"] for index in inspector.get_indexes(TABLE_NAME)}
    if "ix_subjectprerequisite_subject_id" not in existing_indexes:
        op.create_index(
            "ix_subjectprerequisite_subject_id",
            TABLE_NAME,
            ["subject_id"],
        )
    if "ix_subjectprerequisite_prerequisite_subject_id" not in existing_indexes:
        op.create_index(
            "ix_subjectprerequisite_prerequisite_subject_id",
            TABLE_NAME,
            ["prerequisite_subject_id"],
        )

