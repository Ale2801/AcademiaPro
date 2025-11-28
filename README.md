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
 - Autenticación JWT con roles (`admin`, `coordinator`, `teacher`, `student`) y guardas de acceso en routers.
- CRUD completo de programas, asignaturas, cursos, docentes, estudiantes, matrículas, evaluaciones y asistencia.
- Asignaturas con prerrequisitos configurables para reforzar el flujo de aprobación previo a cursar nuevas materias.
- Gestión de perfiles personales con endpoints `/users/me` y `/users/me/avatar`, carga/validación de fotos en base64 y bandera `must_change_password` para obligar el primer cambio de contraseña a través de `/auth/change-password`.
- Optimizador de horarios con granularidad de 15 minutos que respeta disponibilidad docente, restricciones de sala, recesos configurables, máximos de bloques consecutivos y límites diarios por programa.
- Exportación de horarios (Excel/PDF) y guardado persistente de asignaciones.
- Módulo de **Ajustes de Aplicación** (modelo `AppSetting`, endpoints `/settings`, seed con valores de branding y plataforma).
- Frontend administrativo con vista global del optimizador, botón de aplicación de propuestas y persistencia de estado de la barra lateral.
- Panel del coordinador con guía interactiva de onboarding, seguimiento de cobertura académica y atajos hacia el optimizador, además de un dashboard estudiantil centrado en la consulta del horario consolidado.

## Roles y capacidades
| Rol | Descripción | Interfaz principal |
| --- | --- | --- |
| **Administrador** | Configura ajustes institucionales, gestiona usuarios, programas, catálogos y aprueba cambios estructurales. Puede exportar horarios y forzar cambios de contraseña. | `AdminDashboard`, `ApplicationSettings`, CRUDs completos. |
| **Coordinador** | Opera el `SchedulePlanner`, ejecuta el optimizador, asigna salas/bloques y monitorea cobertura desde el `CoordinatorDashboard`. Tiene permisos CRUD sobre cursos, grupos, matrículas, programas y salones. | `CoordinatorDashboard`, `OptimizerOnboardingGuide`, `SchedulePlanner`. |
| **Docente** | Consulta sus cursos, horarios y métricas de carga; puede revisar estudiantes inscritos y registrar información académica según los endpoints habilitados (asistencia, calificaciones). | `TeacherDashboard`, vista de horario personal. |
| **Estudiante** | Accede a su horario consolidado, seguimiento de créditos y mensajes clave del coordinador. | `StudentDashboard`, `StudentScheduleDashboard`. |

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
- Frontend servido por Nginx dentro de Docker en `http://localhost:8080` (el proxy `/api` ya apunta al contenedor FastAPI)

En modo desarrollo (`APP_ENV=dev`) la base se siembra automáticamente (usuario admin `admin@academiapro.dev` / `admin123`, coordinador y catálogos demo). Si estableces `APP_ENV=prod` en un archivo `.env` en la raíz del repositorio, el arranque omite los datos demo y solo crea el administrador por defecto con una contraseña temporal que debe ser cambiada tras el primer inicio de sesión.

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
  - Con Docker (recomendado para demostraciones): ya queda expuesto en `http://localhost:8080` al ejecutar `docker compose up`.
  - Desarrollo local con Vite (hot reload):
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
- `APP_ENV`: controla si la app corre en `dev` (siembra datos demo) o `prod` (solo crea el admin). Puedes definirlo en un archivo `.env` en la raíz y se cargará automáticamente con `python-dotenv`.
- `.env`: crea un archivo `.env` junto al `README.md` con pares `CLAVE=valor` para fijar variables. Ejemplo para producción:
  ```
  APP_ENV=prod
  SECRET_KEY=tu-clave-segura
  DATABASE_URL=postgresql://user:pass@db:5432/academiapro
  ```
  En este modo se creará únicamente el administrador demo y se le solicitará forzar el cambio de contraseña al autenticarse.
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
- `POST /auth/change-password`: permite que el usuario autenticado actualice su contraseña cuando `must_change_password` es `true`.
- `GET/PATCH /users/me`: devuelve y actualiza perfil (nombre completo, rol, bandera de cambio de contraseña) del usuario autenticado.
- `PUT /users/me/avatar`: guarda o borra la imagen de perfil en formato data URL base64.
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
  - `OptimizerOnboardingGuide`: asistente visual que guía a coordinadores y nuevos usuarios por las capacidades del optimizador.
  - Dashboards por rol (`AdminDashboard`, `CoordinatorDashboard`, `TeacherDashboard`, `StudentDashboard`) con barra lateral persistente (`DashboardLayout`).
  - `StudentScheduleDashboard`: agenda estudiantil consolidada con filtros por programa y widgets de progreso.
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
- Admin: `admin@academiapro.dev` / `admin123` (se solicita cambio inicial cuando `APP_ENV=prod`).
- Coordinador académico: `coordinador@academiapro.dev` / `coordinador123`.
- Docente: `docente1@academiapro.dev` / `teacher123` (asignado a Matemáticas, visible en `TeacherDashboard`).
- Estudiante: `estudiante1@academiapro.dev` / `student123` (Ingeniería en Sistemas, tiene inscripciones activas para probar el portal estudiantil).

Con estos credenciales puedes experimentar con el panel administrativo, modificar ajustes de marca y generar propuestas de horarios desde la vista del optimizador.

> Nota: En entornos configurados con `APP_ENV=prod` solo se aprovisiona el administrador demo y el sistema le exigirá cambiar su contraseña temporal (`admin123`) antes de continuar.