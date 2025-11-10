"""add program semester state

Revision ID: b1d8e6c8285d
Revises: 3a6d4a3f9c2f
Create Date: 2024-10-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'b1d8e6c8285d'
down_revision = '3a6d4a3f9c2f'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column['name'] for column in inspector.get_columns('programsemester')}
    dialect_name = bind.dialect.name

    if 'state' not in columns:
        op.add_column('programsemester', sa.Column('state', sa.String(length=20), nullable=True))

    op.execute("UPDATE programsemester SET state = 'planned' WHERE state IS NULL")

    if dialect_name != 'sqlite':
        op.alter_column('programsemester', 'state', nullable=False)

    existing_indexes = {index['name'] for index in inspector.get_indexes('programsemester')}
    if 'ix_programsemester_state' not in existing_indexes:
        op.create_index('ix_programsemester_state', 'programsemester', ['state'])


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column['name'] for column in inspector.get_columns('programsemester')}
    existing_indexes = {index['name'] for index in inspector.get_indexes('programsemester')}

    if 'ix_programsemester_state' in existing_indexes:
        op.drop_index('ix_programsemester_state', table_name='programsemester')

    if 'state' in columns:
        op.drop_column('programsemester', 'state')
