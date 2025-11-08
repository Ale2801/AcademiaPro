# Resumen de cambios – 8 de noviembre de 2025

## Backend
- Alembic: se endurecieron las migraciones finales (`20251107_schedule_support`, `8c969e077b11_add_student_program_enrollments`, `20251108_program_is_active`, `b1d8e6c8285d_add_program_semester_state`) para que validen columnas, índices y tablas existentes antes de crearlos, evitando errores en bases SQLite que ya tengan esos objetos. También se omiten `ALTER COLUMN` incompatibles con SQLite.
- Al ejecutar `alembic upgrade head` ahora la cadena completa progresa sin fallas en entornos donde algunos cambios se aplicaron manualmente.

## Frontend
- Vista de estudiante: el panel de matrícula se movió a una nueva ruta `/dashboard/student/matricula`, accesible desde la barra lateral. Se añadió el componente `StudentMatriculationDashboard` para alojar la gestión de semestres.
- Planificador de horario: se añadió un bloque “Asignaciones sin horario definido” que lista los cursos del estudiante sin día/hora concretos y permite quitarlos. Además, se eliminó la sección de “Bloques de referencia” que ya no aportaba valor.
- Se ajustó la cuadrícula de accesos rápidos del dashboard de estudiantes para incluir un acceso directo a la nueva vista de matrícula.

## Validaciones
- `npm run build` (frontend) – OK.
- `alembic upgrade head` (backend, SQLite local) – OK tras los ajustes.
