"""
Add program semesters and link courses

Revision ID: 9bde5cb6e2d0
Revises: a57de4569051
Create Date: 2025-10-13 09:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision: str = "9bde5cb6e2d0"
down_revision: Union[str, None] = "a57de4569051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "programsemester" not in inspector.get_table_names():
        op.create_table(
            "programsemester",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("program_id", sa.Integer(), nullable=False),
            sa.Column("semester_number", sa.Integer(), nullable=False),
            sa.Column("label", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.ForeignKeyConstraint(["program_id"], ["program.id"], ),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        columns = {col["name"] for col in inspector.get_columns("programsemester")}
        if "number" in columns and "semester_number" not in columns:
            op.execute(text("ALTER TABLE programsemester RENAME COLUMN number TO semester_number"))
        if "title" in columns and "label" not in columns:
            op.execute(text("ALTER TABLE programsemester RENAME COLUMN title TO label"))
        if "semester_number" not in columns and "number" not in columns:
            op.add_column("programsemester", sa.Column("semester_number", sa.Integer(), nullable=True))
        if "label" not in columns and "title" not in columns:
            op.add_column("programsemester", sa.Column("label", sa.String(), nullable=True))
        if "is_active" not in columns:
            op.add_column("programsemester", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))

    existing_indexes = {index["name"] for index in inspector.get_indexes("programsemester")}
    if op.f("ix_programsemester_program_id") not in existing_indexes:
        op.create_index(op.f("ix_programsemester_program_id"), "programsemester", ["program_id"], unique=False)

    course_columns = {col["name"] for col in inspector.get_columns("course")}
    course_indexes = {index["name"] for index in inspector.get_indexes("course")}
    course_fks = {fk["name"] for fk in inspector.get_foreign_keys("course")}
    with op.batch_alter_table("course", recreate="auto") as batch:
        if "program_semester_id" not in course_columns:
            batch.add_column(sa.Column("program_semester_id", sa.Integer(), nullable=True))
        if op.f("ix_course_program_semester_id") not in course_indexes:
            batch.create_index(op.f("ix_course_program_semester_id"), ["program_semester_id"], unique=False)
        if "course_program_semester_id_fkey" not in course_fks:
            batch.create_foreign_key(
                "course_program_semester_id_fkey",
                "programsemester",
                ["program_semester_id"],
                ["id"],
                ondelete="SET NULL",
            )

    schedule_columns = {col["name"] for col in inspector.get_columns("courseschedule")}
    schedule_indexes = {index["name"] for index in inspector.get_indexes("courseschedule")}
    schedule_fks = {fk["name"] for fk in inspector.get_foreign_keys("courseschedule")}
    with op.batch_alter_table("courseschedule", recreate="auto") as batch:
        if "program_semester_id" not in schedule_columns:
            batch.add_column(sa.Column("program_semester_id", sa.Integer(), nullable=True))
        if op.f("ix_courseschedule_program_semester_id") not in schedule_indexes:
            batch.create_index(op.f("ix_courseschedule_program_semester_id"), ["program_semester_id"], unique=False)
        if "courseschedule_program_semester_id_fkey" not in schedule_fks:
            batch.create_foreign_key(
                "courseschedule_program_semester_id_fkey",
                "programsemester",
                ["program_semester_id"],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    op.drop_constraint("courseschedule_program_semester_id_fkey", "courseschedule", type_="foreignkey")
    op.drop_index(op.f("ix_courseschedule_program_semester_id"), table_name="courseschedule")
    op.drop_column("courseschedule", "program_semester_id")

    op.drop_constraint("course_program_semester_id_fkey", "course", type_="foreignkey")
    op.drop_index(op.f("ix_course_program_semester_id"), table_name="course")
    op.drop_column("course", "program_semester_id")

    op.drop_index(op.f("ix_programsemester_program_id"), table_name="programsemester")
    op.drop_table("programsemester")
