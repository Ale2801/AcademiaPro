# Arquitectura de AcademiaPro

Este documento resume los componentes clave del proyecto, cómo se conectan y qué responsabilidades cubre cada módulo. Sirve como punto de referencia rápido para nuevos colaboradores.

## Visión general

- **Monorepo** con dos aplicaciones independientes:
  - `backend/`: API REST construida con FastAPI y SQLModel.
  - `frontend/`: SPA en React 18 con Vite y Mantine para la interfaz administrativa.
- **Persistencia**: PostgreSQL en Docker para entornos productivos; SQLite se emplea automáticamente en pruebas y desarrollo local sin contenedores.
- **Autenticación** basada en JWT, con roles (`admin`, `teacher`, `student`) y dependencias reutilizables para control de acceso.

## Backend

- **Punto de entrada**: `backend/src/main.py` inicializa la base de datos, aplica datos semilla y registra los routers de dominio.
- **Configuración**: `backend/src/config.py` resuelve variables de entorno (`DATABASE_URL`, `SECRET_KEY`, expiración de tokens) y expone `settings`.
- **Modelos**: `backend/src/models.py` centraliza entidades SQLModel (usuarios, estudiantes, docentes, cursos, horarios, ajustes, etc.). También define enums de negocio.
- **Routers**: cada dominio vive en `backend/src/routers/<nombre>.py`. Ejemplos relevantes:
  - `auth.py`: autenticación y emisión de JWT.
  - `schedule.py`: orquestación del optimizador, guardado de asignaciones y exportaciones.
  - `settings.py`: CRUD de configuraciones institucionales y endpoints públicos.
- **Seguridad**: `backend/src/security.py` provee hashing bcrypt, validación de tokens y `require_roles` para inyectar controles per-endpoint.
- **Base de datos**: `backend/src/db.py` crea el engine y asegura compatibilidad con SQLite (`check_same_thread=False`).
- **Semilla**: `backend/src/seed.py` crea datos demo deterministas (programas, cursos, salones, horarios, usuarios) y configura ajustes de branding.
- **Optimizador**: implementado en `backend/src/scheduler/optimizer.py`. Ofrece granularidad de 15 minutos, soporta recesos (`reserve_break_minutes`), límites de bloques consecutivos, disponibilidad docente, restricciones por sala y balance de carga.
- **Migraciones**: Alembic configurado en `backend/alembic.ini`. Usa `SQLModel.metadata` para autogenerar revisiones (`alembic revision --autogenerate`).

## Frontend

- **Bootstrap**: `frontend/src/main.tsx` monta React Router, Mantine y el tema compartido.
- **Estado**: `frontend/src/lib/auth.ts` gestiona autenticación con Zustand (persistencia en `localStorage`).
- **API**: `frontend/src/lib/api.ts` expone un cliente Axios configurable mediante `VITE_API_BASE`.
- **Componentes principales**:
  - `ui/components/GlobalScheduleOptimizer.tsx`: renderiza la vista previa del optimizador y permite aplicar propuestas.
  - `ui/components/ApplicationSettings.tsx`: formulario para editar ajustes de branding, plataforma y contacto.
  - `ui/dashboards/DashboardLayout.tsx`: shell compartido por los tableros de admin, docente y estudiante con persistencia del estado de la barra lateral.
- **Pruebas de UI**: Vitest + Testing Library (`npm test`). Los archivos `*.test.tsx` cubren dashboards, optimizador y ajustes.

## Optimizador de horarios

- **Entrada**: `CourseInput`, `RoomInput`, `TimeslotInput` y `Constraints` definidos en `optimizer.py`.
- **Restricciones soportadas**:
  - Disponibilidad docente (`teacher_availability`) y conflictos previos (`teacher_conflicts`).
  - Restricciones por sala (`room_allowed`).
  - Límites de bloques consecutivos y minutos mínimos de descanso (`max_consecutive_blocks`, `reserve_break_minutes`, `min_gap_minutes`).
  - Límites diarios por programa (`max_daily_hours_per_program`) y jornadas permitidas.
- **Salida**: lista de `AssignmentResult` (curso, sala, bloque, offset y duración) y minutos pendientes.
- **Métricas**: métricas de calidad anexas (`ScheduleQualityMetrics`) para alimentar dashboards (balance, utilización, sobrecargas, etc.).

## Datos semilla y ajustes

- El seed crea un administrador (`admin@academiapro.dev` / `admin123`), programas académicos, cursos, horarios y estudiantes.
- `AppSetting` almacena branding y parámetros de plataforma. Los endpoints `/settings` y `/settings/public` sirven para gestionar y consumir estos valores desde el frontend.

## Pruebas automatizadas

- **Backend**: `cd backend && python -m pytest -q`. Los tests se apoyan en `backend/tests/conftest.py`, que fuerza `DATABASE_URL=sqlite:///test.db` y prepara las tablas en cada corrida.
- **Scheduler**: `backend/tests/test_scheduler.py` cubre recesos, límites consecutivos, gaps y guardado de asignaciones.
- **Frontend**: `cd frontend && npm test`. El archivo `src/test/setup.ts` configura polyfills requeridos por Mantine.

## Flujo local recomendado

1. Levantar dependencias con Docker (`docker compose up --build`) o configurar PostgreSQL manualmente.
2. Lanzar el backend (`uvicorn src.main:app --reload`) y el frontend (`npm run dev`).
3. Consumir la API vía `http://localhost:8000/docs` y la UI en `http://localhost:5173`.
4. Ejecutar pruebas antes de subir cambios (`python -m pytest` y `npm test`).

## Próximos pasos sugeridos

- Implementar métricas históricas y reportes descargables desde el frontend.
- Integrar OR-Tools como dependencia obligatoria en despliegues donde el solver exacto aporte valor.
- Añadir pipeline de CI que corra linters, pruebas y análisis estático para backend y frontend.
