# Changelog

Registro completo de cada push aplicado sobre `main`. Cada entrada usa el formato estándar `AAAA-MM-DD – hash – mensaje` y resume en español los cambios más relevantes.

## 2025-12-29 – cb50c77 – feat: learning & storage workflows
- Crea los routers `/files`, `/course-materials` y `/assignments`, servicios de almacenamiento y utilidades de acceso junto a migraciones, seeds, scripts y reportes para soportar subida/descarga segura de materiales.
- Incorpora módulos de aprendizaje (learning pages, rutas y librerías en frontend) con pruebas nuevas para docentes, estudiantes y flujo de landing, además de ajustes en `App`, dashboards y barra de navegación.
- Refuerza el optimizador global: nuevos heurísticos en `optimizer.py`, validaciones adicionales en `schedule.py` y métricas detalladas para comprender asignaciones y conflictos.
- Amplía la configuración (requirements, config, security) y documentación (`README`, requerimientos) para reflejar los nuevos procesos operativos.

## 2025-12-29 – 2088172 – feat: enforce teacher conflicts in planner
- El planner por programa envía `teacher_conflicts` derivados del horario global o del semestre activo para respetar choques docentes ya asignados.
- `ScheduleTimeline` expone `teacher_id` en sus entradas para que otros componentes puedan reutilizar la metadata del docente.
- Nuevas pruebas en `SchedulePlanner.test.tsx` cubren tanto la detección de conflictos globales como locales antes de llamar al optimizador.
- Se agrega una prueba de backend que verifica que `/schedule/optimize` honra explícitamente los `teacher_conflicts` recibidos.

## 2025-11-25 – 625d1a7 – chore: sync latest updates
- Agrega migraciones para `must_change_password` y `profile_image`, más endpoints `/users/me` y `/users/me/avatar` con pruebas de backend.
- Refuerza `DashboardLayout`, `CoordinatorDashboard` y `StudentScheduleDashboard`, añade `OptimizerOnboardingGuide` y mejora la experiencia del optimizador en frontend.
- Actualiza suite de pruebas (pytest y Vitest), validaciones de autenticación y documentación.

## 2025-11-24 – 0ee5fc2 – Sync pending changes
- Extiende el modelo de asignaturas con prerrequisitos y actualiza seeds/migraciones.
- Mejora CRUDs administrativos (subjects, Admin UI) con nuevas pruebas (`CrudSection`).
- Ajusta guías operativas y documentación para reflejar los cambios académicos.

## 2025-11-24 – 993e2a7 – Fix curriculum graph connector alignment
- Corrige el trazo de conectores en `CurriculumGraph` para alinear nodos dependientes.

## 2025-11-10 – 13686a5 – feat: sync latest academic updates
- Integra nuevos flujos académicos y sincroniza datos maestros con el optimizador.

## 2025-11-08 – c9aeaca – refactor: shift break controls into timeslot builder
- Centraliza la configuración de recesos dentro del generador de bloques (`timeslot builder`).

## 2025-11-08 – a23475b – feat: expand enrollment scheduling workflows
- Amplía los flujos de programación de matrículas para soportar más escenarios.

## 2025-11-08 – b526e77 – feat: reorganize student matriculation workflow
- Reorganiza la experiencia de matriculación estudiantil en el frontend.

## 2025-11-07 – 83de417 – feat(admin): show semester subjects in program drawer
- El panel administrativo ahora muestra asignaturas por semestre dentro del drawer de programa.

## 2025-10-23 – 08ee0f6 – fix: proxy api requests in frontend nginx
- Ajusta la configuración de Nginx en el frontend para asegurar el proxy de `/api`.

## 2025-10-23 – 545c954 – chore: merge alembic heads
- Unifica ramas divergentes de Alembic y mantiene el historial de migraciones limpio.

## 2025-10-23 – 66fd738 – feat: wait for db before starting api
- El backend espera la disponibilidad de la base de datos antes de exponer la API.

## 2025-10-21 – a00c5f0 – docs: actualizar README y documentación; traducir comentarios al español; agregar test de receso
- Actualiza README y comentarios técnicos al español e incorpora pruebas sobre recesos.

## 2025-10-18 – 40e43a1 – Enhance scheduling workflow and consolidate changelog
- Mejora el flujo completo de programación y documenta el proceso.

## 2025-10-15 – 46e0407 – Consider teacher conflicts across schedule and add UI tests
- El optimizador contempla conflictos docentes globales y se agregan pruebas UI.

## 2025-10-15 – 0f4c34b – Refine scheduler partial blocks and planner support
- Refinamiento de bloques parciales y del planner asociado.

## 2025-10-14 – efc402d – feat: soporta horas variables en planner
- El planner acepta cursos con horas semanales variables.

## 2025-10-14 – 192c737 – Reapply "feat: soporta horarios por programa y semestre"
- Restablece la funcionalidad de horarios por programa/semestre tras el revert.

## 2025-10-14 – f4692e7 – Revert "feat: soporta horarios por programa y semestre"
- Revierte temporalmente la función para corregir regresiones detectadas.

## 2025-10-13 – 73fef3c – feat: soporta horarios por programa y semestre
- Primer despliegue del soporte por programa/semestre tanto en backend como en UI.

## 2025-10-11 – 76e1c19 – Amplía seeders con datos demo
- Amplía los semillas para incluir datos demo adicionales (programas, cursos, etc.).

## 2025-10-11 – 04933ad – Refina panel admin y actualiza guías
- Perfecciona el panel administrativo y la documentación de referencia.

## 2025-10-11 – c7bfda8 – docs: guía para agentes
- Añade `.github/instructions/copilot.instructions.md` con lineamientos para asistentes.

## 2025-09-12 – 52f8926 – chore: initial commit
- Crea la estructura base del monorepo con FastAPI, SQLModel, React y Vite.
