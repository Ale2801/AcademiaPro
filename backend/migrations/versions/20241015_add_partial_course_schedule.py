"""add duration and offset to course schedule

Revision ID: 20241015_partial
Revises: a57de4569051
Create Date: 2025-10-15 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20241015_partial'
down_revision: Union[str, None] = 'a57de4569051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('courseschedule', sa.Column('duration_minutes', sa.Integer(), nullable=True))
    op.add_column('courseschedule', sa.Column('start_offset_minutes', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('courseschedule', 'start_offset_minutes')
    op.drop_column('courseschedule', 'duration_minutes')
