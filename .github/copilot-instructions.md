# AcademiaPro – Copilot Instructions

## Architecture Snapshot
- Monorepo with FastAPI/SQLModel backend (`backend/`) and Vite + React 18 frontend (`frontend/`).
- `backend/src/main.py` wires routers under `/auth`, `/files`, `/schedule`, etc.; each router isolates a domain inside `backend/src/routers/`.
- State shared via PostgreSQL in Docker or SQLite for dev/tests; optimizer logic lives in `backend/src/scheduler/optimizer.py` and is triggered by `/schedule/optimize`.

## Backend Guidelines
- Routers follow the pattern `session=Depends(get_session)` + `user=Depends(require_roles(...))`; reuse helpers from `backend/src/security.py` and `backend/src/utils/course_access.py`.
- Models live in `backend/src/models.py`; whenever you touch them, add Alembic migrations and keep `seed.py` aligned.
- File uploads/downloads use `backend/src/routers/files.py`. Downloads now accept a `token` query param—mirror this in frontend helpers when generating URLs.
- Keep scheduler updates consistent between the CP-SAT path and the greedy fallback; both are exercised in `backend/tests/test_scheduler.py`.

## Database & Tests
- Alembic config sits in `backend/alembic.ini`; run `alembic revision --autogenerate` after model changes and `alembic upgrade head` before committing.
- Pytest fixtures in `backend/tests/conftest.py` spin up an in-memory SQLite DB and provide `client`, `session`, and role tokens; reuse them instead of rolling custom DB setups.
- Critical regression suites: `backend/tests/test_files.py` (auth/file storage) and `backend/tests/test_scheduler.py` (optimizer constraints).

## Frontend Guidelines
- React entry point `frontend/src/main.tsx` mounts Mantine Provider + React Router; dashboards are under `frontend/src/ui/dashboards/` and role-specific flows under `frontend/src/ui/learning/`.
- Axios wrapper `frontend/src/lib/api.ts` plus Zustand auth store `frontend/src/lib/auth.ts` manage JWT headers/persistence—always call `setAuth` after login/signup flows.
- File workflows rely on `frontend/src/lib/files.ts`; use `buildAuthorizedFileUrl` whenever rendering download links so tokens propagate to `/files/{id}?token=...`.
- Mantine Tabs should prefer `defaultValue` unless you deliberately manage state; forcing `value` (see student learning page) prevents users from switching sections.

## Workflow Commands
- Backend dev: `cd backend && uvicorn src.main:app --reload` (after `pip install -r requirements.txt`).
- Backend tests: `cd backend && python -m pytest -q` or target modules via `-k`.
- Frontend dev: `cd frontend && npm install && npm run dev`.
- Frontend tests: `cd frontend && npm run test -- <pattern>` (Vitest, jsdom environment).
- Full stack via Docker: `docker compose up --build` (API on `:8000`, frontend dev server on `:5173`).

## When Contributing Features
- Touching auth/roles? Update both backend guards (`require_roles`) and UI gating (Zustand selectors, protected routes).
- Changes to schedules or assignments require syncing backend serializers, optimizer inputs, and the respective React forms (teacher/student learning pages).
- Any new file-based feature should extend both `/files` router tests and the React upload helpers to keep JWT download flows consistent.
- Always run tests for both backend and frontend after changes, and ensure Alembic migrations are included for any model updates.

ALWAYS ANSWER IN SPANISH.