Alembic migrations for the backend.

Commands (optional):
- Create revision (autogenerate): alembic revision -m "message" --autogenerate
- Upgrade to head: alembic upgrade head
- Downgrade one: alembic downgrade -1

Notes:
- Uses SQLModel.metadata for autogenerate.
- DATABASE_URL env var overrides alembic.ini sqlalchemy.url.
