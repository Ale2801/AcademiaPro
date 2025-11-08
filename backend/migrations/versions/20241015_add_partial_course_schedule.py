"""add duration and offset to course schedule

Revision ID: 20241015_partial
Revises: a57de4569051
Create Date: 2025-10-15 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '20241015_partial'
down_revision: Union[str, None] = 'a57de4569051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('courseschedule')}

    if 'duration_minutes' not in existing_columns:
        op.add_column('courseschedule', sa.Column('duration_minutes', sa.Integer(), nullable=True))
    if 'start_offset_minutes' not in existing_columns:
        op.add_column('courseschedule', sa.Column('start_offset_minutes', sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('courseschedule')}

    if 'start_offset_minutes' in existing_columns:
        op.drop_column('courseschedule', 'start_offset_minutes')
    if 'duration_minutes' in existing_columns:
        op.drop_column('courseschedule', 'duration_minutes')
