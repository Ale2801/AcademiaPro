"""
Add learning module tables

Revision ID: c7c6ee842c4e
Revises: a57de4569051
Create Date: 2025-12-25 07:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7c6ee842c4e"
down_revision: Union[str, None] = "a57de4569051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


material_type_enum = sa.Enum("document", "link", "video", "resource", "other", name="materialtypeenum")
assignment_type_enum = sa.Enum("homework", "project", "quiz", "exam", "other", name="assignmenttypeenum")
submission_status_enum = sa.Enum("draft", "submitted", "graded", "returned", name="submissionstatusenum")


def upgrade() -> None:

    op.create_table(
        "coursematerial",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("material_type", material_type_enum, nullable=False),
        sa.Column("file_url", sa.String(length=512), nullable=True),
        sa.Column("external_url", sa.String(length=512), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ),
        sa.ForeignKeyConstraint(["teacher_id"], ["teacher.id"], ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_coursematerial_course_id"), "coursematerial", ["course_id"], unique=False)
    op.create_index(op.f("ix_coursematerial_teacher_id"), "coursematerial", ["teacher_id"], unique=False)

    op.create_table(
        "assignment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("assignment_type", assignment_type_enum, nullable=False),
        sa.Column("available_from", sa.DateTime(), nullable=True),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.Column("allow_late", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("max_score", sa.Float(), nullable=False, server_default="100"),
        sa.Column("resource_url", sa.String(length=512), nullable=True),
        sa.Column("attachment_url", sa.String(length=512), nullable=True),
        sa.Column("attachment_name", sa.String(length=255), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ),
        sa.ForeignKeyConstraint(["teacher_id"], ["teacher.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assignment_course_id"), "assignment", ["course_id"], unique=False)
    op.create_index(op.f("ix_assignment_teacher_id"), "assignment", ["teacher_id"], unique=False)

    op.create_table(
        "assignmentsubmission",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("enrollment_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("status", submission_status_enum, nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("text_response", sa.Text(), nullable=True),
        sa.Column("file_url", sa.String(length=512), nullable=True),
        sa.Column("external_url", sa.String(length=512), nullable=True),
        sa.Column("is_late", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("grade_score", sa.Float(), nullable=True),
        sa.Column("graded_at", sa.DateTime(), nullable=True),
        sa.Column("graded_by", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignment.id"], ),
        sa.ForeignKeyConstraint(["enrollment_id"], ["enrollment.id"], ),
        sa.ForeignKeyConstraint(["student_id"], ["student.id"], ),
        sa.ForeignKeyConstraint(["graded_by"], ["teacher.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_id", "enrollment_id", name="uq_assignment_submission"),
    )
    op.create_index(op.f("ix_assignmentsubmission_assignment_id"), "assignmentsubmission", ["assignment_id"], unique=False)
    op.create_index(op.f("ix_assignmentsubmission_enrollment_id"), "assignmentsubmission", ["enrollment_id"], unique=False)
    op.create_index(op.f("ix_assignmentsubmission_student_id"), "assignmentsubmission", ["student_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_assignmentsubmission_student_id"), table_name="assignmentsubmission")
    op.drop_index(op.f("ix_assignmentsubmission_enrollment_id"), table_name="assignmentsubmission")
    op.drop_index(op.f("ix_assignmentsubmission_assignment_id"), table_name="assignmentsubmission")
    op.drop_table("assignmentsubmission")

    op.drop_index(op.f("ix_assignment_teacher_id"), table_name="assignment")
    op.drop_index(op.f("ix_assignment_course_id"), table_name="assignment")
    op.drop_table("assignment")

    op.drop_index(op.f("ix_coursematerial_teacher_id"), table_name="coursematerial")
    op.drop_index(op.f("ix_coursematerial_course_id"), table_name="coursematerial")
    op.drop_table("coursematerial")

    bind = op.get_bind()
    submission_status_enum.drop(bind, checkfirst=True)
    assignment_type_enum.drop(bind, checkfirst=True)
    material_type_enum.drop(bind, checkfirst=True)
