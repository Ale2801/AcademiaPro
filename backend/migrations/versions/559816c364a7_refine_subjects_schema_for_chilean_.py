"""
Revision ID: 559816c364a7
Revises: 4f4ce2a3a79e
Create Date: 2025-11-10 03:26:24.165768

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '559816c364a7'
down_revision: Union[str, None] = '4f4ce2a3a79e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _subject_columns() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column['name'] for column in inspector.get_columns('subject')}


def upgrade() -> None:
    """Adapta el esquema de asignaturas al formato chileno de horas."""

    existing_columns = _subject_columns()
    def _add_or_zero_int(column_name: str) -> None:
        if column_name not in existing_columns:
            op.add_column(
                'subject',
                sa.Column(column_name, sa.Integer(), nullable=False, server_default='0'),
            )
        else:
            op.execute(f"UPDATE subject SET {column_name} = 0 WHERE {column_name} IS NULL")

    if 'pedagogical_hours_per_week' not in existing_columns:
        op.add_column(
            'subject',
            sa.Column(
                'pedagogical_hours_per_week',
                sa.Integer(),
                nullable=False,
                server_default='0',
            ),
        )
    else:
        op.execute("UPDATE subject SET pedagogical_hours_per_week = 0 WHERE pedagogical_hours_per_week IS NULL")

    for column in (
        'theoretical_hours_per_week',
        'practical_hours_per_week',
        'laboratory_hours_per_week',
        'weekly_autonomous_work_hours',
    ):
        _add_or_zero_int(column)

    # Removemos columnas que ya no forman parte del modelo actual.
    for obsolete in (
        'total_pedagogical_hours',
        'duration_weeks',
        'evaluation_system',
    ):
        if obsolete in existing_columns:
            op.drop_column('subject', obsolete)

    # Eliminamos columnas obsoletas basadas en créditos.
    if 'hours_per_week' in existing_columns:
        op.drop_column('subject', 'hours_per_week')
    if 'credits' in existing_columns:
        op.drop_column('subject', 'credits')

    # Removemos la default creada solo para la migración y delegamos al modelo.
    # Para SQLite mantener el server_default no genera impactos prácticos, por lo que no se remueve explícitamente.


def downgrade() -> None:
    """Revierte el esquema de asignaturas al formato anterior basado en créditos."""

    existing_columns = _subject_columns()

    if 'credits' not in existing_columns:
        op.add_column('subject', sa.Column('credits', sa.Integer(), nullable=False, server_default='0'))
    if 'hours_per_week' not in existing_columns:
        op.add_column('subject', sa.Column('hours_per_week', sa.Integer(), nullable=True))

    for column in (
        'weekly_autonomous_work_hours',
        'laboratory_hours_per_week',
        'practical_hours_per_week',
        'theoretical_hours_per_week',
        'pedagogical_hours_per_week',
    ):
        if column in existing_columns:
            op.drop_column('subject', column)

    # Restaurar el default original no es necesario para SQLite.
