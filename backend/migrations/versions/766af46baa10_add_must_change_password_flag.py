"""Add must_change_password flag to user table.

Revision ID: 766af46baa10
Revises: 745fdf15901d
Create Date: 2025-11-24 02:51:56.309179

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "766af46baa10"
down_revision: Union[str, None] = "745fdf15901d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "user"
COLUMN_NAME = "must_change_password"


def upgrade() -> None:
    with op.batch_alter_table(TABLE_NAME, recreate="auto") as batch_op:
        batch_op.add_column(sa.Column(COLUMN_NAME, sa.Boolean(), nullable=False, server_default=sa.text("0")))
    op.execute(sa.text(f"UPDATE \"{TABLE_NAME}\" SET {COLUMN_NAME} = 0 WHERE {COLUMN_NAME} IS NULL"))
    with op.batch_alter_table(TABLE_NAME, recreate="auto") as batch_op:
        batch_op.alter_column(COLUMN_NAME, server_default=None)


def downgrade() -> None:
    op.drop_column(TABLE_NAME, COLUMN_NAME)
