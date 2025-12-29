"""
Revision ID: 478da7ba5ab5
Revises: c8ceaaf089ed, e3b5c844cfce
Create Date: 2025-12-29 06:20:22.703502

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '478da7ba5ab5'
down_revision: Union[str, None] = ('c8ceaaf089ed', 'e3b5c844cfce')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
