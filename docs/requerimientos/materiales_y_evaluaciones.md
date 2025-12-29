# Requerimientos - Gestión de Materiales y Evaluaciones

## Alcance General
- Construir un módulo académico compartido para estudiantes y profesores con materiales, tareas y evaluaciones por curso.
- Garantizar que el panel de administradores/coordinadores tenga visibilidad y control total sobre todas las clases.
- Restringir el acceso de estudiantes y profesores únicamente a los cursos en los que están inscritos o asignados.

## Casos de Uso Estudiante
1. Listar cursos inscritos y acceder al detalle de cada clase.
2. Visualizar y descargar materiales (PDF, enlaces, videos, etc.) organizados por clase/unidad.
3. Consultar evaluaciones/tareas pendientes, entregadas y calificadas con fechas límite, estado y calificación.
4. Realizar entregas: subir archivos, adjuntar enlaces o responder formularios en línea.
5. Ver retroalimentación, rúbricas y calificaciones publicadas por el profesor.

## Casos de Uso Profesor
1. Crear y organizar recursos para cada clase (carpetas, etiquetas, versiones de archivos).
2. Publicar tareas/evaluaciones con instrucciones, adjuntos, criterios de calificación y ventanas de disponibilidad.
3. Revisar entregas, calificar con rúbricas o notas simples, adjuntar comentarios y archivos de retroalimentación.
4. Consultar analíticas resumidas (participación, retrasos, promedios) y exportar resultados.

## Casos de Uso Administrador / Coordinador
1. Acceder a un panel con todas las clases/cursos sin restricciones basadas en asignación.
2. Crear, editar y eliminar cursos, materiales, evaluaciones y asignaciones de docentes/estudiantes.
3. Realizar ajustes globales (configuraciones, calendarios, políticas) y auditar actividades.

## Requisitos Técnicos
- **Backend**:
  - Nuevas entidades: `CourseMaterial`, `Assignment`, `Submission`, `Evaluation`, `Grade` (si no existen).
  - Endpoints CRUD diferenciados por rol con validaciones de pertenencia al curso.
  - Policies para garantizar que estudiantes/profesores solo accedan a cursos asignados.
- **Almacenamiento de archivos**:
  - Controlar el proveedor mediante `.env` (`FILE_STORAGE_DRIVER=local|docker_volume|s3`).
  - `local`: usa `FILE_STORAGE_LOCAL_PATH` para guardar adjuntos.
  - `docker_volume`: usa `FILE_STORAGE_DOCKER_PATH` como path dentro del contenedor (espera un volumen montado).
  - `s3`: requiere `FILE_STORAGE_S3_BUCKET`, `FILE_STORAGE_S3_REGION`, endpoint y credenciales (`*_ACCESS_KEY_*`, `FILE_STORAGE_S3_USE_SSL`).
  - Establecer límites de tamaño y, para S3, usar URLs firmadas para descargas/subidas.
- **Frontend**:
  - Secciones específicas en dashboards de estudiante y profesor (tabs "Materiales", "Evaluaciones", "Tareas").
  - Formularios de creación/edición para profesores y vistas de entrega para estudiantes.
  - Componentes de subida de archivos (drag & drop), estados de progreso y alertas.
- **Notificaciones**:
  - Hooks para avisar a estudiantes sobre nuevas tareas y a profesores sobre nuevas entregas.
- **Seguridad y permisos**:
  - Roles admin/coordinador con acceso total.
  - Profesores y estudiantes limitados a sus cursos.
  - Auditoría/versionado de cambios críticos (evaluaciones, calificaciones, materiales).
- **Integraciones futuras**:
  - Mantener la arquitectura lista para sincronizar con LMS externos (ej. Moodle) si se aprueba.
