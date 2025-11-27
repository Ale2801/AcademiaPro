"""
Revision ID: 8c969e077b11
Revises: 20251107_schedule_support
Create Date: 2025-11-08 01:17:36.765412

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '8c969e077b11'
down_revision: Union[str, None] = '20251107_schedule_support'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name
    inspector = inspect(bind)

    has_appsetting = inspector.has_table('appsetting')
    if not has_appsetting:
        op.create_table(
            'appsetting',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('key', sa.String(length=255), nullable=False),
            sa.Column('value', sa.Text(), nullable=True),
            sa.Column('label', sa.String(length=255), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('category', sa.String(length=255), nullable=True),
            sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.PrimaryKeyConstraint('id')
        )
        has_appsetting = True

    existing_app_indexes = {index['name'] for index in inspector.get_indexes('appsetting')} if has_appsetting else set()
    if op.f('ix_appsetting_category') not in existing_app_indexes and has_appsetting:
        op.create_index(op.f('ix_appsetting_category'), 'appsetting', ['category'], unique=False)
    if op.f('ix_appsetting_key') not in existing_app_indexes and has_appsetting:
        op.create_index(op.f('ix_appsetting_key'), 'appsetting', ['key'], unique=True)

    has_enrollment = inspector.has_table('studentprogramenrollment')
    if not has_enrollment:
        op.create_table(
            'studentprogramenrollment',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('student_id', sa.Integer(), nullable=False),
            sa.Column('program_semester_id', sa.Integer(), nullable=False),
            sa.Column('enrolled_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('status', sa.Enum('active', 'completed', 'withdrawn', name='programenrollmentstatusenum'), nullable=False, server_default='active'),
            sa.Column('ended_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['program_semester_id'], ['programsemester.id']),
            sa.ForeignKeyConstraint(['student_id'], ['student.id']),
            sa.PrimaryKeyConstraint('id')
        )
        has_enrollment = True

    existing_enrollment_indexes = {index['name'] for index in inspector.get_indexes('studentprogramenrollment')} if has_enrollment else set()
    if op.f('ix_studentprogramenrollment_program_semester_id') not in existing_enrollment_indexes and has_enrollment:
        op.create_index(op.f('ix_studentprogramenrollment_program_semester_id'), 'studentprogramenrollment', ['program_semester_id'], unique=False)
    if op.f('ix_studentprogramenrollment_status') not in existing_enrollment_indexes and has_enrollment:
        op.create_index(op.f('ix_studentprogramenrollment_status'), 'studentprogramenrollment', ['status'], unique=False)
    if op.f('ix_studentprogramenrollment_student_id') not in existing_enrollment_indexes and has_enrollment:
        op.create_index(op.f('ix_studentprogramenrollment_student_id'), 'studentprogramenrollment', ['student_id'], unique=False)

    # Ensure legacy rows have a valid semester reference before tightening constraints
    bind.execute(sa.text(
        """
        UPDATE course
        SET program_semester_id = (
            SELECT ps.id
            FROM programsemester ps
            WHERE ps.program_id = (
                SELECT s.program_id FROM subject s WHERE s.id = course.subject_id
            )
            ORDER BY ps.is_active DESC, ps.semester_number ASC
            LIMIT 1
        )
        WHERE program_semester_id IS NULL
        """
    ))

    bind.execute(sa.text(
        """
        UPDATE courseschedule
        SET program_semester_id = (
            SELECT c.program_semester_id FROM course c WHERE c.id = courseschedule.course_id
        )
        WHERE program_semester_id IS NULL
        """
    ))

    # Default inactive semesters to active so existing data remains accessible
    bind.execute(sa.text(
        """
        UPDATE programsemester
        SET is_active = TRUE
        WHERE is_active IS NULL
        """
    ))

    # Seed an active program enrollment per student to maintain planner functionality
    students = bind.execute(sa.text(
        """
        SELECT id, program_id FROM student
        WHERE program_id IS NOT NULL
        """
    )).fetchall()

    insert_stmt = sa.text(
        """
        INSERT INTO studentprogramenrollment (student_id, program_semester_id, enrolled_at, status, ended_at)
        VALUES (:student_id, :program_semester_id, :enrolled_at, 'active', NULL)
        """
    )

    for student_id, program_id in students:
        existing_enrollment = bind.execute(sa.text(
            """
            SELECT id FROM studentprogramenrollment
            WHERE student_id = :student_id AND status = 'active'
            LIMIT 1
            """
        ), {"student_id": student_id}).fetchone()

        if existing_enrollment:
            continue

        semester_row = bind.execute(sa.text(
            """
            SELECT id FROM programsemester
            WHERE program_id = :program_id
            ORDER BY is_active DESC, semester_number ASC
            LIMIT 1
            """
        ), {"program_id": program_id}).fetchone()

        if not semester_row:
            continue

        bind.execute(insert_stmt, {
            "student_id": student_id,
            "program_semester_id": semester_row.id,
            "enrolled_at": datetime.utcnow(),
        })

    if dialect_name != 'sqlite':
        op.alter_column('course', 'program_semester_id',
                   existing_type=sa.INTEGER(),
                   nullable=False)
        op.drop_constraint('course_program_semester_id_fkey', 'course', type_='foreignkey')
        op.create_foreign_key(None, 'course', 'programsemester', ['program_semester_id'], ['id'])
        op.alter_column('courseschedule', 'program_semester_id',
                   existing_type=sa.INTEGER(),
                   nullable=False)
        op.drop_constraint('courseschedule_program_semester_id_fkey', 'courseschedule', type_='foreignkey')
        op.create_foreign_key(None, 'courseschedule', 'programsemester', ['program_semester_id'], ['id'])
        op.alter_column('programsemester', 'is_active',
                   existing_type=sa.BOOLEAN(),
                   server_default=None,
                   existing_nullable=False)
        op.alter_column('schedulesupportrequest', 'created_at',
                   existing_type=sa.DATETIME(),
                   server_default=None,
                   existing_nullable=False)
        op.alter_column('schedulesupportrequest', 'handled',
                   existing_type=sa.BOOLEAN(),
                   server_default=None,
                   existing_nullable=False)
        op.alter_column('student', 'program_id',
                   existing_type=sa.INTEGER(),
                   nullable=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    if dialect_name != 'sqlite':
        op.alter_column('student', 'program_id',
                   existing_type=sa.INTEGER(),
                   nullable=True)
        op.alter_column('schedulesupportrequest', 'handled',
               existing_type=sa.BOOLEAN(),
               server_default=sa.text('false'),
                   existing_nullable=False)
        op.alter_column('schedulesupportrequest', 'created_at',
                   existing_type=sa.DATETIME(),
                   server_default=sa.text('(CURRENT_TIMESTAMP)'),
                   existing_nullable=False)
        op.alter_column('programsemester', 'is_active',
               existing_type=sa.BOOLEAN(),
               server_default=sa.text('true'),
                   existing_nullable=False)
        op.drop_constraint(None, 'courseschedule', type_='foreignkey')
        op.create_foreign_key('courseschedule_program_semester_id_fkey', 'courseschedule', 'programsemester', ['program_semester_id'], ['id'], ondelete='SET NULL')
        op.alter_column('courseschedule', 'program_semester_id',
                   existing_type=sa.INTEGER(),
                   nullable=True)
        op.drop_constraint(None, 'course', type_='foreignkey')
        op.create_foreign_key('course_program_semester_id_fkey', 'course', 'programsemester', ['program_semester_id'], ['id'], ondelete='SET NULL')
        op.alter_column('course', 'program_semester_id',
                   existing_type=sa.INTEGER(),
                   nullable=True)
    inspector = inspect(bind)

    if inspector.has_table('studentprogramenrollment'):
        existing_enrollment_indexes = {index['name'] for index in inspector.get_indexes('studentprogramenrollment')}
        if op.f('ix_studentprogramenrollment_student_id') in existing_enrollment_indexes:
            op.drop_index(op.f('ix_studentprogramenrollment_student_id'), table_name='studentprogramenrollment')
        if op.f('ix_studentprogramenrollment_status') in existing_enrollment_indexes:
            op.drop_index(op.f('ix_studentprogramenrollment_status'), table_name='studentprogramenrollment')
        if op.f('ix_studentprogramenrollment_program_semester_id') in existing_enrollment_indexes:
            op.drop_index(op.f('ix_studentprogramenrollment_program_semester_id'), table_name='studentprogramenrollment')
        op.drop_table('studentprogramenrollment')

    if inspector.has_table('appsetting'):
        existing_app_indexes = {index['name'] for index in inspector.get_indexes('appsetting')}
        if op.f('ix_appsetting_key') in existing_app_indexes:
            op.drop_index(op.f('ix_appsetting_key'), table_name='appsetting')
        if op.f('ix_appsetting_category') in existing_app_indexes:
            op.drop_index(op.f('ix_appsetting_category'), table_name='appsetting')
        op.drop_table('appsetting')
    # ### end Alembic commands ###
