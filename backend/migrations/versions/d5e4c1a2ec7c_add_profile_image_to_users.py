"""add profile image to users

Revision ID: d5e4c1a2ec7c
Revises: a57de4569051
Create Date: 2025-11-25 00:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd5e4c1a2ec7c'
down_revision = 'a57de4569051'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user', sa.Column('profile_image', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('user', 'profile_image')
