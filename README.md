# AcademiaPro

Backend FastAPI + Frontend React (Vite) con optimización de horarios.

## Backend
  - docker compose up -d
  - API: http://localhost:8000
  - Seed automático: al iniciar la API se crean datos demo (admin/admin123, catálogos básicos). Para resembrar manualmente usa:

    ```bash
    cd backend
    python -m src.seed
    ```
  - Docs: http://localhost:8000/docs
  - docker compose exec -T api python -m pytest -q

### Migraciones (Alembic)

Este repo incluye Alembic para evolucionar el esquema sin recrear la base de datos.

Pasos rápidos:

1) Crear una nueva revisión a partir de los modelos actuales:

```
cd backend
alembic revision -m "actualizar esquema" --autogenerate
```

2) Aplicar migraciones hasta la última versión:

```
cd backend
alembic upgrade head
```

3) Revertir una migración:

```
cd backend
alembic downgrade -1
```

Notas:
- Alembic toma `DATABASE_URL` de variables de entorno si está definida; de lo contrario usa `alembic.ini`.
- El `env.py` usa `SQLModel.metadata` para autogenerar cambios (incluye tipos y defaults de servidor).

## Frontend
- Ruta: `frontend/`
- Requisitos: Node 18+
- Instalar deps y levantar:
  - npm install
  - npm run dev
- URL: http://localhost:5173
- Tests frontend:
  - npm test

Proxy de desarrollo: se proxya `/api` a `http://localhost:8000`.

## Notas
- Se usa OR-Tools si está disponible; hay fallback greedy.
- JWT Bearer; CORS abierto para dev.
- Base de datos: Postgres en compose; SQLite en pruebas.# AcademiaPro – Sistema Académico con Optimización de Horarios

Este proyecto implementa un backend FastAPI con autenticación JWT, gestión académica básica y un módulo de optimización de horarios con OR-Tools (fallback greedy si no está disponible). Incluye Docker Compose con PostgreSQL.

## Stack técnico
- Backend: FastAPI, SQLModel (SQLAlchemy), Pydantic v2
- Auth: OAuth2 Password + JWT (python-jose), passlib[bcrypt]
- DB: PostgreSQL (prod) / SQLite (local), SQLModel ORM
- Optimización: Google OR-Tools (opcional) + algoritmo greedy de respaldo
- Exportación: openpyxl (Excel), reportlab (PDF) – por implementar
- Contenedores: Docker, docker-compose

## Cómo ejecutar

Opción rápida con Docker:

```bash
docker compose up --build
```

Luego abre: http://localhost:8000/docs

Para desarrollo local sin Docker (requiere Python 3.11):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload
```

## Endpoints rápidos
- POST /auth/signup
- POST /auth/token
- CRUD /students
- POST /schedule/optimize

## Próximos pasos
- CRUDs restantes (teachers, subjects, courses, rooms, enrollment, grades, attendance)
- Vistas por rol (profesor/estudiante) y endpoints de intranet
- Exportación de horarios a PDF/Excel
- Tests automatizados y CI
- Frontend (React + Vite + TypeScript + Mantine/Chakra)
- Despliegue en AWS (ECS Fargate o Elastic Beanstalk) y/o Azure (App Service)