import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionIcon, Button, Card, Group, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core'
import {
  IconAward,
  IconBuilding,
  IconCalendarCog,
  IconCalendarEvent,
  IconCalendarPlus,
  IconChalkboard,
  IconClipboardList,
  IconClockHour4,
  IconDatabase,
  IconInfoCircle,
  IconRefresh,
  IconSchool,
  IconUsersGroup,
  IconTopologyStar3,
} from '@tabler/icons-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CrudSection } from './admin/CrudSection'
import type { Section } from './admin/types'
import GlobalScheduleOptimizer from './components/GlobalScheduleOptimizer'
import SchedulePlanner from './components/SchedulePlanner'
import CurriculumGraph from './components/CurriculumGraph'
import OptimizerOnboardingGuide from './components/OptimizerOnboardingGuide'

export const crudSections: Section[] = [
  {
    key: 'programs',
    title: 'Programas',
    description: 'Define la estructura académica por nivel, código y duración.',
    endpoint: '/programs/',
    icon: IconSchool,
    fields: [
      { name: 'code', type: 'text', required: true, label: 'Código' },
      { name: 'name', type: 'text', required: true, label: 'Nombre' },
      { name: 'level', type: 'text', label: 'Nivel' },
      { name: 'duration_semesters', type: 'number', label: 'Duración (semestres)' },
      { name: 'description', type: 'text', label: 'Descripción' },
    ],
  },
  {
    key: 'program_semesters',
    title: 'Semestres de Programa',
    description: 'Organiza los semestres asociados a cada programa académico.',
    endpoint: '/program-semesters/',
    icon: IconCalendarEvent,
    fields: [
      { name: 'program_id', type: 'number', required: true, label: 'Programa' },
      { name: 'semester_number', type: 'number', required: true, label: 'Número de semestre' },
      { name: 'label', type: 'text', label: 'Etiqueta' },
      { name: 'description', type: 'text', label: 'Descripción' },
      { name: 'is_active', type: 'checkbox', label: 'Activo' },
    ],
  },
  {
    key: 'students',
    title: 'Estudiantes',
    description: 'Alta y vinculación de estudiantes con su cohorte y programa.',
    endpoint: '/students/',
    icon: IconUsersGroup,
    fields: [
      { name: 'user_id', type: 'number', required: true, label: 'Usuario', placeholder: 'Selecciona un usuario' },
      { name: 'enrollment_year', type: 'number', required: true, label: 'Año de ingreso', placeholder: 'Ej. 2024' },
      { name: 'cohort_year', type: 'number', label: 'Año cohorte', placeholder: 'Ej. 2024' },
      { name: 'registration_number', type: 'text', label: 'Matrícula', placeholder: 'Ej. 2024-000123' },
      { name: 'program_id', type: 'number', required: true, label: 'Programa', placeholder: 'Selecciona un programa' },
      { name: 'grade_level', type: 'text', label: 'Nivel académico', placeholder: 'Ej. 3.er año' },
      { name: 'section', type: 'text', label: 'Sección', placeholder: 'Ej. A' },
      {
        name: 'study_shift',
        type: 'select',
        label: 'Jornada',
        placeholder: 'Selecciona jornada',
        options: [
          { value: 'diurna', label: 'Diurna' },
          { value: 'vespertina', label: 'Vespertina' },
          { value: 'mixta', label: 'Mixta' },
          { value: 'ejecutiva', label: 'Ejecutiva' },
        ],
      },
      {
        name: 'modality',
        type: 'select',
        label: 'Modalidad',
        placeholder: 'Selecciona modalidad',
        options: [
          { value: 'in_person', label: 'Presencial' },
          { value: 'online', label: 'Online' },
          { value: 'hybrid', label: 'Híbrida' },
        ],
      },
      {
        name: 'status',
        type: 'select',
        label: 'Estado académico',
        placeholder: 'Selecciona estado',
        options: [
          { value: 'active', label: 'Activo' },
          { value: 'suspended', label: 'Suspendido' },
          { value: 'graduated', label: 'Titulado' },
          { value: 'withdrawn', label: 'Retirado' },
        ],
      },
      {
        name: 'admission_type',
        type: 'select',
        label: 'Tipo de ingreso',
        placeholder: 'Selecciona tipo de ingreso',
        options: [
          { value: 'paes', label: 'PAES / PSU' },
          { value: 'pace', label: 'PACE' },
          { value: 'traslado', label: 'Traslado' },
          { value: 'especial', label: 'Vía especial' },
          { value: 'otra', label: 'Otro' },
        ],
      },
      {
        name: 'financing_type',
        type: 'select',
        label: 'Financiamiento',
        placeholder: 'Selecciona financiamiento',
        options: [
          { value: 'gratuidad', label: 'Gratuidad' },
          { value: 'beca', label: 'Beca' },
          { value: 'credito', label: 'Crédito' },
          { value: 'particular', label: 'Autofinanciado' },
          { value: 'empresa', label: 'Convenio empresa' },
        ],
      },
      { name: 'admission_date', type: 'date', label: 'Fecha de admisión', placeholder: 'Selecciona una fecha' },
      { name: 'expected_graduation_date', type: 'date', label: 'Fecha de egreso estimada', placeholder: 'Selecciona una fecha' },
      { name: 'current_term', type: 'text', label: 'Semestre en curso', placeholder: 'Ej. 2025-1' },
    ],
  },
  {
    key: 'teachers',
    title: 'Profesores',
    description: 'Gestiona docentes y sus departamentos asociados.',
    endpoint: '/teachers/',
    icon: IconChalkboard,
    fields: [
      { name: 'user_id', type: 'number', required: true, label: 'Usuario', placeholder: 'Selecciona un usuario' },
      { name: 'department', type: 'text', label: 'Departamento', placeholder: 'Ej. Departamento de Matemáticas' },
      { name: 'phone', type: 'text', label: 'Teléfono', placeholder: 'Ej. +56 9 1234 5678' },
      { name: 'hire_date', type: 'date', label: 'Fecha de contratación', placeholder: 'Selecciona una fecha' },
      {
        name: 'employment_type',
        type: 'select',
        label: 'Tipo de contrato',
        placeholder: 'Selecciona tipo de contrato',
        options: [
          { value: 'full_time', label: 'Jornada completa' },
          { value: 'part_time', label: 'Medio tiempo' },
          { value: 'contract', label: 'Por contrato' },
        ],
      },
      { name: 'office', type: 'text', label: 'Oficina', placeholder: 'Ej. Oficina B-204' },
      { name: 'specialty', type: 'text', label: 'Especialidad', placeholder: 'Ej. Matemática aplicada' },
      { name: 'bio', type: 'text', label: 'Biografía', placeholder: 'Resumen profesional en español' },
    ],
  },
  {
    key: 'subjects',
    title: 'Asignaturas',
    description: 'Malla curricular por asignatura, cargas horarias y programa base.',
    endpoint: '/subjects/',
    icon: IconClipboardList,
    fields: [
      { name: 'code', type: 'text', required: true, label: 'Código', placeholder: 'Ej. MAT101' },
      { name: 'name', type: 'text', required: true, label: 'Nombre', placeholder: 'Ej. Cálculo Diferencial' },
      { name: 'program_id', type: 'number', label: 'Programa', placeholder: 'ID del programa' },
      { name: 'department', type: 'text', label: 'Departamento', placeholder: 'Ej. Departamento de Matemáticas' },
      { name: 'level', type: 'text', label: 'Nivel', placeholder: 'Ej. Básico' },
      { name: 'description', type: 'text', label: 'Descripción', placeholder: 'Resumen en español de la asignatura' },
      {
        name: 'pedagogical_hours_per_week',
        type: 'number',
        required: true,
        label: 'Horas pedagógicas semanales',
        placeholder: 'Ej. 5',
      },
      { name: 'theoretical_hours_per_week', type: 'number', label: 'Horas teóricas semanales', placeholder: 'Ej. 0' },
      { name: 'practical_hours_per_week', type: 'number', label: 'Horas prácticas semanales', placeholder: 'Ej. 0' },
      { name: 'laboratory_hours_per_week', type: 'number', label: 'Horas de laboratorio semanales', placeholder: 'Ej. 0' },
      { name: 'weekly_autonomous_work_hours', type: 'number', label: 'Trabajo autónomo semanal', placeholder: 'Ej. 0' },
      {
        name: 'prerequisite_subject_ids',
        type: 'multiselect',
        label: 'Prerrequisitos',
        placeholder: 'Selecciona asignaturas previas',
      },
    ],
  },
  {
    key: 'rooms',
    title: 'Salas',
    description: 'Inventario de aulas, su capacidad y ubicación física.',
    endpoint: '/rooms/',
    icon: IconBuilding,
    fields: [
      { name: 'code', type: 'text', required: true, label: 'Código' },
      { name: 'capacity', type: 'number', required: true, label: 'Capacidad' },
      { name: 'building', type: 'text', label: 'Edificio' },
      { name: 'campus', type: 'text', label: 'Campus' },
      { name: 'floor', type: 'text', label: 'Piso' },
  { name: 'room_type', type: 'text', label: 'Tipo de sala', placeholder: 'sala / laboratorio / auditorio / oficina' },
      { name: 'has_projector', type: 'checkbox', label: 'Tiene proyector' },
      { name: 'has_computers', type: 'checkbox', label: 'Tiene computadores' },
      { name: 'notes', type: 'text', label: 'Notas' },
    ],
  },
  {
    key: 'courses',
    title: 'Cursos',
    description: 'Planificación de cursos por periodo, sección y docente titular.',
    endpoint: '/courses/',
    icon: IconCalendarEvent,
    fields: [
      { name: 'subject_id', type: 'number', required: true, label: 'Asignatura' },
      { name: 'teacher_id', type: 'number', required: true, label: 'Profesor' },
      { name: 'program_semester_id', type: 'number', required: true, label: 'Semestre de programa' },
      { name: 'term', type: 'text', required: true, label: 'Periodo', placeholder: '2025-2' },
      { name: 'group', type: 'text', label: 'Grupo', placeholder: 'A' },
      { name: 'weekly_hours', type: 'number', label: 'Horas semanales' },
      { name: 'capacity', type: 'number', label: 'Capacidad' },
      {
        name: 'language',
        type: 'select',
        label: 'Idioma',
        placeholder: 'Selecciona idioma',
        options: [
          { value: 'es', label: 'Español' },
          { value: 'en', label: 'Inglés' },
          { value: 'pt', label: 'Portugués' },
        ],
      },
      {
        name: 'modality',
        type: 'select',
        label: 'Modalidad',
        placeholder: 'Selecciona modalidad',
        options: [
          { value: 'presencial', label: 'Presencial' },
          { value: 'online', label: 'Online' },
          { value: 'híbrida', label: 'Híbrida' },
        ],
      },
      { name: 'start_date', type: 'date', label: 'Fecha de inicio' },
      { name: 'end_date', type: 'date', label: 'Fecha de término' },
      { name: 'syllabus_url', type: 'text', label: 'URL syllabus' },
      { name: 'location_notes', type: 'text', label: 'Notas ubicación' },
    ],
  },
  {
    key: 'timeslots',
    title: 'Bloques Horarios',
    description: 'Definición de bloques lectivos con día y horario válido.',
    endpoint: '/timeslots/',
    icon: IconClockHour4,
    fields: [
      { name: 'day_of_week', type: 'number', required: true, label: 'Día (0-6)', placeholder: '0=Lunes' },
      { name: 'start_time', type: 'time', required: true, label: 'Hora inicio' },
      { name: 'end_time', type: 'time', required: true, label: 'Hora fin' },
      { name: 'campus', type: 'text', label: 'Campus' },
      { name: 'comment', type: 'text', label: 'Comentario' },
    ],
  },
  {
    key: 'course_schedules',
    title: 'Horarios de Curso',
    description: 'Asignación de aula y bloque para cada curso ofertado.',
    endpoint: '/course-schedules/',
    icon: IconCalendarEvent,
    fields: [
      { name: 'course_id', type: 'number', required: true, label: 'Curso' },
      { name: 'room_id', type: 'number', required: true, label: 'Sala' },
      { name: 'timeslot_id', type: 'number', required: true, label: 'Bloque' },
    ],
  },
  {
    key: 'enrollments',
    title: 'Matrículas',
    description: 'Relación estudiante-curso con seguimiento de inscripción.',
    endpoint: '/enrollments/',
    icon: IconSchool,
    fields: [
      { name: 'student_id', type: 'number', required: true, label: 'Estudiante' },
      { name: 'course_id', type: 'number', required: true, label: 'Curso' },
      { name: 'status', type: 'text', label: 'Estado', placeholder: 'enrolled / dropped / completed / failed / withdrawn' },
      { name: 'final_grade', type: 'number', label: 'Nota final' },
      { name: 'dropped_at', type: 'text', label: 'Fecha de retiro', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
      { name: 'notes', type: 'text', label: 'Notas' },
    ],
  },
  {
    key: 'evaluations',
    title: 'Evaluaciones',
    description: 'Configura actividades evaluativas y su ponderación.',
    endpoint: '/evaluations/',
    icon: IconAward,
    fields: [
      { name: 'course_id', type: 'number', required: true, label: 'Curso' },
      { name: 'name', type: 'text', required: true, label: 'Nombre' },
      { name: 'weight', type: 'number', required: true, label: 'Ponderación' },
      { name: 'scheduled_at', type: 'text', label: 'Programado para', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
      { name: 'max_score', type: 'number', label: 'Puntaje máximo' },
      { name: 'due_date', type: 'text', label: 'Fecha límite', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
      { name: 'description', type: 'text', label: 'Descripción' },
    ],
  },
  {
    key: 'grades',
    title: 'Notas',
    description: 'Registro de calificaciones por evaluación y matrícula.',
    endpoint: '/grades/',
    icon: IconClipboardList,
    fields: [
      { name: 'enrollment_id', type: 'number', required: true, label: 'Matrícula' },
      { name: 'evaluation_id', type: 'number', required: true, label: 'Evaluación' },
      { name: 'score', type: 'number', required: true, label: 'Nota' },
      { name: 'graded_at', type: 'text', label: 'Calificado en', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
      { name: 'feedback', type: 'text', label: 'Retroalimentación' },
    ],
  },
  {
    key: 'attendance',
    title: 'Asistencia',
    description: 'Control de asistencia por sesión programada.',
    endpoint: '/attendance/',
    icon: IconClipboardList,
    fields: [
      { name: 'enrollment_id', type: 'number', required: true, label: 'Matrícula' },
      { name: 'session_date', type: 'date', required: true, label: 'Fecha' },
      { name: 'present', type: 'checkbox', label: 'Presente' },
      { name: 'arrival_time', type: 'time', label: 'Hora de llegada' },
      { name: 'notes', type: 'text', label: 'Notas' },
    ],
  },
]

const plannerTabKey = 'planner'
const globalPlannerTabKey = 'global-planner'
const curriculumGraphTabKey = 'curriculum-graph'

export function Admin() {
  const location = useLocation()
  const navigate = useNavigate()
  const defaultTab = crudSections[0]?.key ?? plannerTabKey
  const validTabs = useMemo(
    () => new Set<string>([...crudSections.map((section) => section.key), plannerTabKey, globalPlannerTabKey, curriculumGraphTabKey]),
    [],
  )
  const deriveTabFromSearch = useCallback((search: string) => {
    const params = new URLSearchParams(search)
    const sectionParam = params.get('section')
    if (sectionParam && validTabs.has(sectionParam)) {
      return sectionParam
    }
    return defaultTab
  }, [defaultTab, validTabs])
  const [active, setActive] = useState(() => deriveTabFromSearch(location.search))
  const current = crudSections.find((section) => section.key === active)
  const isPlanner = active === plannerTabKey
  const isGlobalPlanner = active === globalPlannerTabKey
  const isCurriculumGraph = active === curriculumGraphTabKey
  const [introOpen, setIntroOpen] = useState(false)

  useEffect(() => {
    const nextTab = deriveTabFromSearch(location.search)
    setActive((prev) => (prev === nextTab ? prev : nextTab))
  }, [deriveTabFromSearch, location.search])

  const quickStats = useMemo(() => ([
    { label: 'Catálogos activos', value: crudSections.length, hint: 'Dominios conectados', icon: IconDatabase },
    { label: 'Último refresh', value: 'Hace 5 min', hint: 'Sincronización API estable', icon: IconRefresh },
    { label: 'Tareas pendientes', value: '3', hint: 'Solicitudes de actualización', icon: IconClipboardList },
  ]), [])

  const handleTabChange = useCallback((value: string | null) => {
    if (!value) return
    if (!validTabs.has(value)) return
    setActive(value)
    const params = new URLSearchParams(location.search)
    if (value === defaultTab) {
      params.delete('section')
    } else {
      params.set('section', value)
    }
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true })
  }, [defaultTab, location.pathname, location.search, navigate, validTabs])

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs">
          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
            Centro de datos maestros
          </Text>
          <Title order={2}>Panel administrativo avanzado</Title>
          <Text size="sm" c="dimmed">
            Orquesta los catálogos centrales de la institución y mantén la coherencia visual con la nueva intranet.
          </Text>
        </Stack>
        <Button
          variant="light"
          leftSection={<IconInfoCircle size={16} />}
          onClick={() => setIntroOpen(true)}
        >
          Introducción al optimizador
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
        {quickStats.map((stat) => (
          <Card key={stat.label} radius="lg" padding="lg" withBorder>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{stat.label}</Text>
                <Title order={3} mt={4}>{stat.value}</Title>
                <Text size="xs" c="dimmed" mt={4}>{stat.hint}</Text>
              </div>
              <ActionIcon variant="light" size="lg" radius="md" color="dark" aria-label={stat.label}>
                <stat.icon size={18} />
              </ActionIcon>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder radius="lg" padding="md" style={{ background: 'rgba(15, 23, 42, 0.85)', color: 'white' }}>
        <Tabs value={active} onChange={handleTabChange} variant="pills" radius="md" keepMounted={false}>
          <Tabs.List style={{ flexWrap: 'wrap', gap: 8 }}>
            {crudSections.map((section) => (
              <Tabs.Tab key={section.key} value={section.key} leftSection={<section.icon size={16} />}>
                {section.title}
              </Tabs.Tab>
            ))}
            <Tabs.Tab value={plannerTabKey} leftSection={<IconCalendarCog size={16} />}>
              Planificador por programa
            </Tabs.Tab>
            <Tabs.Tab value={globalPlannerTabKey} leftSection={<IconCalendarPlus size={16} />}>
              Optimizador global
            </Tabs.Tab>
            <Tabs.Tab value={curriculumGraphTabKey} leftSection={<IconTopologyStar3 size={16} />}>
              Malla académica
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Card>

      {isPlanner ? (
        <SchedulePlanner />
      ) : isGlobalPlanner ? (
        <GlobalScheduleOptimizer />
      ) : isCurriculumGraph ? (
        <CurriculumGraph />
      ) : (
        current && <CrudSection section={current} />
      )}
      <OptimizerOnboardingGuide
        opened={introOpen}
        onClose={() => setIntroOpen(false)}
        onNavigateToSection={(sectionKey) => handleTabChange(sectionKey)}
        onNavigateToOptimizer={() => handleTabChange(globalPlannerTabKey)}
      />
    </Stack>
  )
}

export default Admin
