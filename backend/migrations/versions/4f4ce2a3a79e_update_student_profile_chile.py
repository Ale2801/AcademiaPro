"""update student profile fields for chilean context

Revision ID: 4f4ce2a3a79e
Revises: b1d8e6c8285d
Create Date: 2025-11-09 05:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4f4ce2a3a79e'
down_revision = 'b1d8e6c8285d'
branch_labels = None
depends_on = None

study_shift_enum = sa.Enum('diurna', 'vespertina', 'mixta', 'ejecutiva', name='studyshiftenum')
admission_type_enum = sa.Enum('paes', 'pace', 'traslado', 'especial', 'otra', name='admissiontypeenum')
financing_type_enum = sa.Enum('gratuidad', 'beca', 'credito', 'particular', 'empresa', name='financingtypeenum')


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        study_shift_enum.create(bind, checkfirst=True)
        admission_type_enum.create(bind, checkfirst=True)
        financing_type_enum.create(bind, checkfirst=True)

    with op.batch_alter_table('student', recreate='auto') as batch_op:
        batch_op.add_column(sa.Column('study_shift', study_shift_enum.copy(), nullable=True))
        batch_op.add_column(sa.Column('admission_type', admission_type_enum.copy(), nullable=True))
        batch_op.add_column(sa.Column('financing_type', financing_type_enum.copy(), nullable=True))
        batch_op.add_column(sa.Column('cohort_year', sa.Integer(), nullable=True))
        batch_op.drop_column('gpa')
        batch_op.drop_column('guardian_name')
        batch_op.drop_column('guardian_phone')


def downgrade() -> None:
    with op.batch_alter_table('student', recreate='auto') as batch_op:
        batch_op.add_column(sa.Column('guardian_phone', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('guardian_name', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('gpa', sa.Float(), nullable=True))
        batch_op.drop_column('cohort_year')
        batch_op.drop_column('financing_type')
        batch_op.drop_column('admission_type')
        batch_op.drop_column('study_shift')

    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        financing_type_enum.drop(bind, checkfirst=True)
        admission_type_enum.drop(bind, checkfirst=True)
        study_shift_enum.drop(bind, checkfirst=True)
