# Guía para agentes en AcademiaPro

!Importante! Estos principios fundamentales deberían guiar tu trabajo de codificación:

1. Trabaja con constancia. Tu objetivo es ser autónomo el mayor tiempo posible. Si conoces el objetivo general del usuario y aún puedes avanzar hacia él, continúa trabajando hasta que ya no puedas avanzar más. Siempre que dejes de trabajar, prepárate para justificar el motivo.

2. Trabaja con inteligencia. Al depurar, da un paso atrás y piensa detenidamente en qué podría estar fallando. Si algo no funciona como se esperaba, añade registros para comprobar tus suposiciones.

3. Revisa tu trabajo. Si escribes un fragmento de código, intenta encontrar una forma de ejecutarlo y asegúrate de que funcione como esperas. Si inicias un proceso largo, espera 30 segundos y luego revisa los registros para asegurarte de que se ejecuta correctamente. Si Agregas nuevas funcionalidades, asegúrate de que las pruebas automatizadas relevantes se ejecuten correctamente y cubran los nuevos casos. Si cambias modelos de datos o la estructura de la base de datos, ajusta el seeding y las migraciones según sea necesario para mantener la coherencia.

4. Sé precavido con los comandos de terminal. Antes de cada comando de terminal, considera detenidamente si se espera que finalice por sí solo o si se ejecutará indefinidamente (por ejemplo, al iniciar un servidor web). Para los procesos que se ejecutan indefinidamente, inícielos siempre en un nuevo proceso (ejemplo: nohup). De igual forma, si tiene un script para realizar alguna acción, asegúrese de que tenga protecciones similares contra la ejecución indefinida antes de ejecutarlo.

## Arquitectura general
- Monorepo con backend `backend/` (FastAPI + SQLModel) y frontend `frontend/` (Vite + React 18 + Mantine/Zustand).
- `backend/src/main.py` registra routers por dominio (`students`, `schedule`, `teachers`, etc.) y aplica `lifespan` para inicializar la base vía `init_db()`.
- Persistencia gestionada con SQLModel sobre PostgreSQL en Docker o SQLite en desarrollo/pruebas; los modelos viven en `backend/src/models.py`.
- Scheduler académico en `backend/src/scheduler/optimizer.py` usa OR-Tools si está instalado y cae en una heurística greedy cuando no.

## Configuración y base de datos
- Config central en `backend/src/config.py`; lee `DATABASE_URL`, `SECRET_KEY`, `DEBUG` y expiraciones JWT de variables de entorno.
- `backend/src/db.py` crea el engine; si la URL empieza con `sqlite` habilita `check_same_thread=False` para pruebas concurrentes.
- Migrations: Alembic configurado en `backend/alembic.ini`; generar con `alembic revision --autogenerate` y aplicar con `alembic upgrade head` (ver README para comandos).
- Si tocas modelos SQLModel debes generar y ejecutar la migración correspondiente tú mismo y confirmar que `alembic upgrade head` termina sin errores.

## Autenticación y permisos
- `backend/src/security.py` define hashing bcrypt, emisión y validación de JWT con `python-jose` y dependencias `require_roles` para proteger endpoints.
- Para endpoints protegidos reutiliza `require_roles("admin")` o combinaciones según router (p. ej. `students` permite admin/teacher en GET).

## Patrones de routers y modelos
- Cada router vive en `backend/src/routers/<dominio>.py`; reciben dependencias `session=Depends(get_session)` y responden con modelos SQLModel.
- Actualizaciones usan `model_dump(exclude_unset=True)` para aplicar parches sobre entidades ya cargadas.
- Exportaciones de horarios (`exporters.py`) devuelven archivos temporales en `/tmp` y esperan listas de tuplas `(course_id, room_id, timeslot_id)`.

## Scheduler y constraints
- El endpoint `/schedule/optimize` transforma payloads Pydantic (`CourseIn`, `RoomIn`, etc.) a dataclasses del optimizador y devuelve asignaciones cronometradas.
- Constraints esperadas: `teacher_availability`, `room_allowed` opcional y `max_consecutive_blocks`; documenta nuevos parámetros en ambos lugares (router + dataclass).

## Workflows de ejecución
- Docker: `docker compose up --build` levanta API y Postgres; API disponible en `http://localhost:8000`.
- Desarrollo local backend: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn src.main:app --reload`.
- Tests backend: `cd backend && python -m pytest -q`; dentro de contenedores usar `docker compose exec -T api python -m pytest -q`.
- Frontend: `cd frontend && npm install && npm run dev` (proxy `/api` dirige al backend) y `npm test` para Vitest.

## Detalles de testing backend
- Fixture `client` en `backend/tests/conftest.py` fuerza `DATABASE_URL` a `sqlite:///test.db`, recarga módulos y asegura que las tablas existan antes de probar.
- Usa el fixture `admin_token` para llamar endpoints que requieren rol administrador; crea un usuario temporal vía `/auth/signup` y obtiene JWT.
- Al escribir nuevos tests reutiliza el `client` fixture y evita crear engines adicionales para no romper las aserciones sobre `test.db`.

## Frontend y consumo de API
- Axios está centralizado en `frontend/src/lib/api.ts` con `baseURL` configurable (`VITE_API_BASE` o `/api`); `setAuth` injerta el header Bearer.
- Estado de autenticación con Zustand (`frontend/src/lib/auth.ts`), persistiendo el token en `localStorage`; sincroniza los endpoints `/auth/token` y `/auth/signup`.
- Router de React (`frontend/src/main.tsx`) define rutas `/`, `/app` y tableros por rol; Mantine theme se configura en el mismo archivo.
- Cuando ajustes la apariencia global (colores, AppShell, espaciados, tipografía) réplicalo en todos los dashboards (`Admin`, `Teacher`, `Student`) para mantener una experiencia consistente por rol.

## Buenas prácticas específicas
- Mantén los modelos SQLModel sincronizados con migraciones; si cambias campos, genera y revisa revisiones Alembic para Postgres.
- Si agregas campos dependientes de enums, extiende los Enum en `models.py` y actualiza los routers que validan esos valores.
- Para ampliar el optimizador, añade lógica en `_solve_cp_sat` y replica un fallback coherente en `_solve_greedy`; tests deben cubrir ambos caminos (con y sin OR-Tools disponible).
- Nuevos endpoints deben importar y usar `require_roles` según rol esperado y devolver errores 404/403 consistentes con los routers existentes.

!Important! These top-level principles should guide your coding work:

1. Work doggedly. Your goal is to be autonomous as long as possible. If you know the user's overall goal, and there is still progress you can make towards that goal, continue working until you can no longer make progress. Whenever you stop working, be prepared to justify why.

2. Work smart. When debugging, take a step back and think deeply about what might be going wrong. When something is not working as intended, add logging to check your assumptions.

3. Check your work. If you write a chunk of code, try to find a way to run it and make sure it does what you expect. If you kick off a long process, wait 30 seconds then check the logs to make sure it is running as expected.

4. Be cautious with terminal commands. Before every terminal command, consider carefully whether it can be expected to exit on its own, or if it will run indefinitely (e.g. launching a web server). For processes that run indefinitely, always launch them in a new process (e.g. nohup). Similarly, if you have a script to do something, make sure the script has similar protections against running indefinitely before you run it.
