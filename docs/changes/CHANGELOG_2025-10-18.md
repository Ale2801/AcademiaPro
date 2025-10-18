# AcademiaPro – Bitácora de Cambios

**Fecha:** 2025-10-18

## Panorama General

- Se consolidó la gestión de bloques horarios con soporte para recreaciones masivas, validación estricta de tiempos y limpieza automática de horarios dependientes.
- El optimizador académico evolucionó para producir agendas realistas, reportar métricas de calidad y exponer nuevas restricciones configurables desde la API y el panel administrativo.
- La experiencia de administración incorporó flujos guiados para generar jornadas completas, visualizar la ocupación semanal y depurar conflictos directamente desde la interfaz.
- La semilla de datos se reescribió para reflejar jornadas continuas de 08:00 a 22:00 con bloques de una hora y casos de uso alineados a las nuevas reglas.
- Se amplió la cobertura automática con pruebas dedicadas a los nuevos escenarios de horarios y a la lógica de optimización realista.

## Backend

### Autenticación y sesiones
- `src/config.py` ahora interpreta `ACCESS_TOKEN_EXPIRE_MINUTES` como opcional; al omitirlo los JWT se emiten sin expiración para sesiones persistentes.
- `src/security.py` sólo incluye la reclamación `exp` cuando existe un tiempo positivo, alineando la vigencia del token con la configuración.

### Administración de bloques horarios
- `src/routers/timeslots.py` incorpora el endpoint `/timeslots/bulk` con validaciones Pydantic, deduplicación y un modo `replace_existing` que elimina bloques previos y sus `CourseSchedule` asociados.
- Se normaliza la conversión de strings a `datetime.time` en operaciones de creación y actualización para garantizar compatibilidad con SQLite y Postgres.

### Optimizador académico
- `src/scheduler/optimizer.py` amplía el modelo de restricciones con configuraciones de almuerzo, brechas mínimas, balance semanal, límites diarios por programa y puntuaciones de calidad.
- El algoritmo registra métricas como `balance_score`, cargas promedio/máxima, utilización de bloques y cursos sin asignar; la información vuelve al cliente a través del contrato extendido.
- `src/routers/schedule.py` valida los nuevos parámetros y propaga las métricas en la respuesta de `/schedule/optimize`.

### Semilla de datos y utilidades
- `src/seed.py` genera bloques para lunes a viernes cada hora entre 08:00 y 22:00, actualiza asignaciones de cursos al nuevo mapa de tiempos y mantiene coherencia con las restricciones realistas.
- Se reorganizaron programas, cursos, inscripciones y evaluaciones para aprovechar los bloques homogéneos y ofrecer escenarios variados a las pruebas.
- `run_seeder.py` se prepara como punto de entrada para rehidratar datos de demostración desde la línea de comandos.

### Cobertura automática
- `tests/test_timeslots.py` agrega casos para la recreación masiva de bloques y la limpieza de horarios dependientes.
- `tests/test_scheduler_realistic.py` valida límites diarios, bloques de almuerzo, equilibrio semanal y cálculo de métricas del optimizador.

## Frontend

### Panel administrativo
- `src/ui/Admin.tsx` estrena el generador semanal con controles de jornada, recreos, fines de semana y modo de reemplazo que advierte sobre la eliminación de horarios existentes.
- Se añadió la tarjeta `TimeslotOverview` que agrupa bloques por día, permite eliminarlos en línea y muestra contadores dinámicos.
- La ayuda de formato del campo “Hora de inicio” se reposicionó bajo el input para mantener los controles en la misma fila en vista de escritorio.
- `Admin.test.tsx` cubre flujos de generación masiva, reemplazo completo y eliminación desde la vista resumida.

### Planificador y diseñador de horarios
- `SchedulePlanner.tsx` consume las métricas de calidad, habilita la configuración de almuerzos, recreos, balance y límites diarios, y ofrece vista previa inmediata de asignaciones propuestas.
- `ScheduleDesigner.tsx`, `ScheduleTimeline.tsx` y `DashboardLayout.tsx` recibieron ajustes para sincronizar el nuevo planificador, destacar métricas y sostener la navegación con paneles adhesivos.
- Las pruebas `SchedulePlanner.test.tsx` se ampliaron para validar la experiencia completa, desde la carga de catálogos hasta la aplicación de propuestas del optimizador.

## Calidad y pruebas

- Backend: `python -m pytest -q`
- Frontend: `npm test -- --run`
- Ambas suites concluyen sin fallos, garantizando compatibilidad con los cambios.

## Consideraciones de despliegue

- Regenerar datos de demostración ejecutando el seeder tras desplegar para poblar los nuevos bloques horarios.
- Revisar variables de entorno: dejar `ACCESS_TOKEN_EXPIRE_MINUTES` vacío para mantener sesiones activas hasta el cierre manual.
- Comunicar a los administradores que el modo “Reemplazar bloques existentes” eliminará horarios de curso ligados a los bloques actuales.

---

Proyecto listo para integración continua con la nueva base horaria y controles realistas del planificador académico.