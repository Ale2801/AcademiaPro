"""Merge heads 20241015_partial and 9bde5cb6e2d0

Revision ID: 20241023_merge
Revises: 20241015_partial, 9bde5cb6e2d0
Create Date: 2025-10-23 00:00:00.000000
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "20241023_merge"
down_revision: Union[str, Sequence[str], None] = ("20241015_partial", "9bde5cb6e2d0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
