"""empty placeholder to satisfy alembic

Revision ID: 3a6d4a3f9c2f
Revises: 20251108_program_is_active
Create Date: 2025-11-07 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "3a6d4a3f9c2f"
down_revision = "20251108_program_is_active"
branch_labels = None
depends_on = None

def upgrade():
	# Legacy placeholder: no schema changes required. Keeping file so existing
	# deployments that referenced this revision can continue rolling forward.
	pass

def downgrade():
	# Legacy placeholder
	pass
