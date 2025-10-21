# AcademiaPro

Sistema académico completo para gestionar catálogos, cursos y horarios con un optimizador que respeta descansos, límites consecutivos y disponibilidad por docente. El repositorio es un monorepo con backend FastAPI/SQLModel y frontend React 18 (Vite + Mantine/Zustand).

## Tabla de contenido
- [Arquitectura general](#arquitectura-general)
- [Características principales](#características-principales)
- [Requisitos previos](#requisitos-previos)
- [Inicio rápido con Docker](#inicio-rápido-con-docker)
- [Configuración para desarrollo local](#configuración-para-desarrollo-local)
- [Entorno y configuración](#entorno-y-configuración)
- [Backend](#backend)
- [Frontend](#frontend)
- [Optimizador de horarios](#optimizador-de-horarios)
- [Pruebas automatizadas](#pruebas-automatizadas)
- [Estructura del repositorio](#estructura-del-repositorio)

## Arquitectura general
- **Backend** (`backend/`): FastAPI + SQLModel sobre PostgreSQL (o SQLite para pruebas). Expone CRUDs académicos, autenticación JWT, módulo de programación de horarios y API de ajustes institucionales.
- **Frontend** (`frontend/`): React 18 con Vite, Mantine UI y Zustand para estado. Incluye dashboards diferenciados por rol y herramientas de administración (p. ej. ajustes globales, vista previa del optimizador).
- **Infraestructura**: Docker Compose levanta API y Postgres. En entornos sin Docker puede ejecutarse cada servicio por separado.

## Características principales
- Autenticación JWT con roles (`admin`, `teacher`, `student`) y guardas de acceso en routers.
- CRUD completo de programas, asignaturas, cursos, docentes, estudiantes, matrículas, evaluaciones y asistencia.
- Optimizador de horarios con granularidad de 15 minutos que respeta disponibilidad docente, restricciones de sala, recesos configurables, máximos de bloques consecutivos y límites diarios por programa.
- Exportación de horarios (Excel/PDF) y guardado persistente de asignaciones.
- Módulo de **Ajustes de Aplicación** (modelo `AppSetting`, endpoints `/settings`, seed con valores de branding y plataforma).
- Frontend administrativo con vista global del optimizador, botón de aplicación de propuestas y persistencia de estado de la barra lateral.

## Requisitos previos
- Docker 24+ y Docker Compose v2 (para la opción containerizada).
- Python 3.11 o superior (desarrollo local de backend).
- Node.js 18+ y npm 9+ (frontend).
- PostgreSQL 14+ (si no se usa Docker y se quiere ejecutar contra Postgres).

## Inicio rápido con Docker
```bash
docker compose up --build
```

- API disponible en `http://localhost:8000`
- Documentación interactiva en `http://localhost:8000/docs`
- Frontend en `http://localhost:5173` (cuando se ejecute `npm run dev` en otra terminal)

La base se siembra automáticamente en el arranque (usuario admin `admin@academiapro.dev` / `admin123` y catálogos demo).

## Configuración para desarrollo local

1. **Backend**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn src.main:app --reload
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Base de datos**
   - Para SQLite (modo pruebas) no se requiere ningún paso adicional.
   - Para PostgreSQL exporta `DATABASE_URL=postgresql://user:pass@localhost:5432/academiapro` antes de iniciar el backend.

## Entorno y configuración
- `DATABASE_URL`: cadena de conexión (por defecto `sqlite:///./data.db`).
- `SECRET_KEY`: clave JWT; se recomienda anular la default en producción.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: minutos de validez del token (opcional).
- `DEBUG`: activa modo debug (`true` por defecto en dev).
- Frontend: `VITE_API_BASE` para apuntar a una URL distinta de `/api`.

El backend expone un endpoint `/settings/public` para ajustes visibles en el frontend (branding, idioma, zona horaria, etc.). Los valores iniciales se controlan mediante `src/seed.py`.

## Backend
- Entrypoint: `src/main.py` registra routers para dominios (`students`, `schedule`, `settings`, etc.) y aplica `init_db()` en el lifespan.
- Modelos: `src/models.py` (SQLModel) incluye `AppSetting` y enums de dominio.
- Seguridad: `src/security.py` implementa hashing bcrypt y dependencias `require_roles`.
- Base de datos: `src/db.py` crea el engine (maneja `check_same_thread` en SQLite).
- Semilla: `python -m src.seed` fuerza la creación de datos demo (programas, cursos, horarios, ajustes).
- Migraciones (Alembic):
  ```bash
  cd backend
  alembic revision -m "mensaje" --autogenerate
  alembic upgrade head
  alembic downgrade -1
  ```

### Endpoints destacados
- `POST /auth/token`: login y obtención de JWT.
- `POST /auth/signup`: creación de usuarios (rol configurable).
- `GET/POST/PUT/DELETE /settings`: CRUD de ajustes institucionales (solo admins).
- `GET /settings/public`: ajustes visibles para clientes.
- `POST /schedule/optimize`: ejecuta el optimizador greedy/OR-Tools y retorna propuesta.
- `POST /schedule/assignments/save`: persiste asignaciones devueltas por el optimizador.

## Frontend
- Vite + React 18 + TypeScript.
- Mantine y Chakra UI (componentes heredados) para layout, con Zustand para estado global (auth, UI) y React Hook Form/Zod para validaciones.
- Componentes principales:
  - `GlobalScheduleOptimizer`: vista previa de propuestas con botón **Aplicar**.
  - `ApplicationSettings`: formulario agrupado por categorías con consumo de `/settings`.
  - Dashboards por rol (`AdminDashboard`, `TeacherDashboard`, `StudentDashboard`) con barra lateral persistente (`DashboardLayout`).
- Scripts disponibles (`frontend/package.json`):
  - `npm run dev`: servidor de desarrollo.
  - `npm run build`: build de producción + `tsc`.
  - `npm run test`: pruebas Vitest en modo headless.
  - `npm run test:ui`: Vitest en modo interactivo.

## Optimizador de horarios
- Granularidad de 15 minutos (`GRANULARITY_MINUTES`).
- Soporta restricciones:
  - `teacher_availability` y `teacher_conflicts`.
  - `room_allowed`.
  - `max_consecutive_blocks` para forzar descansos; los minutos de receso se reservan dentro de los bloques (`reserve_break_minutes`).
  - `min_gap_blocks` y `min_gap_minutes` entre clases.
  - `max_daily_hours_per_program` para evitar sobrecarga.
  - Jornadas y bloques de almuerzo opcionales.
- Fallback greedy (`_solve_partial_greedy`) si OR-Tools no está instalado.
- Resultados devuelven métricas de calidad (balanceo, utilización, violaciones).

## Pruebas automatizadas
- **Backend** (pytest):
  ```bash
  cd backend
  python -m pytest -q
  python -m pytest -k schedule -q            # solo integración de horarios
  python -m pytest tests/test_scheduler.py::test_scheduler_enforces_rest_after_consecutive_blocks -q
  ```
- **Frontend** (Vitest):
  ```bash
  cd frontend
  npm test
  npm run test:ui
  ```

La suite de pruebas backend usa SQLite en memoria (`DATABASE_URL=sqlite:///test.db`) y re-sembra los catálogos necesarios antes de cada caso.

## Estructura del repositorio
```text
backend/
  src/
    config.py
    main.py
    models.py
    routers/
      schedule.py
      settings.py
      ...
    scheduler/optimizer.py
    seed.py
  tests/
    test_scheduler.py
    test_settings.py
frontend/
  src/
    main.tsx
    lib/
    ui/
      components/
        ApplicationSettings.tsx
        GlobalScheduleOptimizer.tsx
      dashboards/
        AdminDashboard.tsx
        DashboardLayout.tsx
```

## Usuarios demo
- Admin: `admin@academiapro.dev` / `admin123`

Con estos credenciales puedes experimentar con el panel administrativo, modificar ajustes de marca y generar propuestas de horarios desde la vista del optimizador.