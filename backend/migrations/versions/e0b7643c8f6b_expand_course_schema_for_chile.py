"""expand course schema for chilean requirements

Revision ID: e0b7643c8f6b
Revises: 559816c364a7
Create Date: 2025-11-10 03:30:00.000000

"""
from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "e0b7643c8f6b"
down_revision: Union[str, None] = "559816c364a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
	"""No-op placeholder to preserve history."""
	pass


def downgrade() -> None:
	"""No-op placeholder to preserve history."""
	pass

