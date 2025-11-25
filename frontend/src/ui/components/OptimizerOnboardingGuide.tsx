import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Card, Group, List, Loader, Modal, Stack, Text } from '@mantine/core'
import { IconAlertCircle, IconCalendarCog, IconCircleCheck, IconCircleDashed } from '@tabler/icons-react'
import { api } from '../../lib/api'

type Props = {
  opened: boolean
  onClose: () => void
  onNavigateToSection?: (sectionKey: string) => void
  onNavigateToOptimizer?: () => void
}

type CourseRecord = {
  id: number
  teacher_id?: number | null
  program_semester_id?: number | null
}

type CatalogCounts = {
  programs: number
  programSemesters: number
  subjects: number
  teachers: number
  rooms: number
  timeslots: number
  courses: number
  coursesReady: number
}

const emptyCounts: CatalogCounts = {
  programs: 0,
  programSemesters: 0,
  subjects: 0,
  teachers: 0,
  rooms: 0,
  timeslots: 0,
  courses: 0,
  coursesReady: 0,
}

const requirementTargets: Record<string, string[]> = {
  structure: ['programs', 'program_semesters'],
  subjects: ['subjects'],
  teachers: ['teachers'],
  rooms: ['rooms'],
  timeslots: ['timeslots'],
  courses: ['courses'],
}

const sectionLabels: Record<string, string> = {
  programs: 'Programas',
  program_semesters: 'Semestres de Programa',
  subjects: 'Asignaturas',
  teachers: 'Profesores',
  rooms: 'Salas',
  timeslots: 'Bloques Horarios',
  courses: 'Cursos',
}

export default function OptimizerOnboardingGuide({ opened, onClose, onNavigateToSection, onNavigateToOptimizer }: Props) {
  const [counts, setCounts] = useState<CatalogCounts>(emptyCounts)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    let isMounted = true
    const loadCounts = async () => {
      setLoading(true)
      setError(null)
      try {
        const [programsRes, semestersRes, subjectsRes, teachersRes, roomsRes, timeslotsRes, coursesRes] = await Promise.all([
          api.get('/programs/'),
          api.get('/program-semesters/'),
          api.get('/subjects/'),
          api.get('/teachers/'),
          api.get('/rooms/'),
          api.get('/timeslots/'),
          api.get('/courses/'),
        ])
        if (!isMounted) return
        const coursesData = (Array.isArray(coursesRes.data) ? coursesRes.data : []) as CourseRecord[]
        const readyCourses = coursesData.filter((course) => course.teacher_id != null && course.program_semester_id != null).length
        setCounts({
          programs: Array.isArray(programsRes.data) ? programsRes.data.length : 0,
          programSemesters: Array.isArray(semestersRes.data) ? semestersRes.data.length : 0,
          subjects: Array.isArray(subjectsRes.data) ? subjectsRes.data.length : 0,
          teachers: Array.isArray(teachersRes.data) ? teachersRes.data.length : 0,
          rooms: Array.isArray(roomsRes.data) ? roomsRes.data.length : 0,
          timeslots: Array.isArray(timeslotsRes.data) ? timeslotsRes.data.length : 0,
          courses: coursesData.length,
          coursesReady: readyCourses,
        })
      } catch (err: any) {
        if (!isMounted) return
        const detail = err?.response?.data?.detail || err?.message || 'No se pudo cargar la información inicial'
        setError(detail)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }
    void loadCounts()
    return () => {
      isMounted = false
    }
  }, [opened])

  const requirements = useMemo(() => {
    const structureReady = counts.programs > 0 && counts.programSemesters > 0
    const subjectsReady = counts.subjects > 0
    const teachersReady = counts.teachers > 0
    const roomsReady = counts.rooms > 0
    const timeslotsReady = counts.timeslots > 0
    const coursesReady = counts.coursesReady > 0
    const optimizerReady = structureReady && subjectsReady && teachersReady && roomsReady && timeslotsReady && coursesReady
    return [
      {
        key: 'structure',
        title: 'Diseña la estructura académica',
        description: 'Registra al menos un programa y sus semestres activos para que el optimizador entienda la malla base.',
        status: structureReady ? 'complete' : 'pending',
        summary: `${counts.programs} programas · ${counts.programSemesters} semestres`,
      },
      {
        key: 'subjects',
        title: 'Define asignaturas y prerrequisitos',
        description: 'Carga las asignaturas con sus códigos, niveles y dependencias para alimentar los cursos.',
        status: subjectsReady ? 'complete' : 'pending',
        summary: `${counts.subjects} asignaturas registradas`,
      },
      {
        key: 'teachers',
        title: 'Asocia docentes y usuarios',
        description: 'Cada curso necesita un profesor titular vinculado a un usuario existente.',
        status: teachersReady ? 'complete' : 'pending',
        summary: `${counts.teachers} docentes disponibles`,
      },
      {
        key: 'rooms',
        title: 'Configura salas y capacidades',
        description: 'El optimizador asignará salas existentes con capacidad suficiente.',
        status: roomsReady ? 'complete' : 'pending',
        summary: `${counts.rooms} salas registradas`,
      },
      {
        key: 'timeslots',
        title: 'Define bloques horarios válidos',
        description: 'Cada bloque describe día, hora inicio y fin; es la grilla base del horario.',
        status: timeslotsReady ? 'complete' : 'pending',
        summary: `${counts.timeslots} bloques disponibles`,
      },
      {
        key: 'courses',
        title: 'Publica cursos listos para optimizar',
        description: 'Crea cursos vinculados a asignaturas, semestres y docentes; especifica sus horas semanales.',
        status: coursesReady ? 'complete' : 'pending',
        summary: `${counts.coursesReady}/${counts.courses} cursos con docente y semestre`,
      },
      {
        key: 'optimizer',
        title: 'Ejecuta el optimizador global',
        description: 'Cuando todos los pasos anteriores estén completos, podrás generar una propuesta automática y revisar métricas.',
        status: optimizerReady ? 'complete' : 'pending',
        summary: optimizerReady ? 'Listo para optimizar' : 'Pendiente por completar requisitos',
      },
    ]
  }, [counts])

  const handleNavigate = (targets: string[]) => {
    if (!targets || targets.length === 0 || !onNavigateToSection) return
    const firstTarget = targets[0]
    onClose()
    onNavigateToSection(firstTarget)
  }

  const handleOptimizerClick = () => {
    if (onNavigateToOptimizer) {
      onClose()
      onNavigateToOptimizer()
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Introducción al optimizador" size="xl" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Sigue estos pasos para cargar los catálogos mínimos antes de ejecutar el optimizador global de horarios.
        </Text>
        {loading ? (
          <Group justify="center" py="md">
            <Loader />
          </Group>
        ) : error ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        ) : (
          <Stack gap="md">
            {requirements.map((requirement) => {
              const completed = requirement.status === 'complete'
              const targets = requirementTargets[requirement.key] ?? []
              const showNavigate = requirement.key !== 'optimizer' && targets.length > 0 && onNavigateToSection
              return (
                <Card key={requirement.key} withBorder radius="md" padding="lg">
                  <Stack gap={8}>
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Group gap={8} align="center">
                          {completed ? <IconCircleCheck size={18} color="var(--mantine-color-teal-5)" /> : <IconCircleDashed size={18} color="var(--mantine-color-yellow-5)" />}
                          <Text fw={600}>{requirement.title}</Text>
                        </Group>
                        <Text size="sm" c="dimmed" mt={4}>
                          {requirement.description}
                        </Text>
                      </div>
                      <Badge color={completed ? 'teal' : 'yellow'} variant="light">
                        {completed ? 'Completado' : 'Pendiente'}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {requirement.summary}
                    </Text>
                    {requirement.key !== 'optimizer' ? (
                      <List spacing={2} size="sm">
                        {targets.map((target) => (
                          <List.Item key={target}>{sectionLabels[target] ?? target}</List.Item>
                        ))}
                      </List>
                    ) : null}
                    {showNavigate ? (
                      <Group justify="flex-end">
                        <Button size="xs" variant="light" onClick={() => handleNavigate(targets)}>
                          Ir a {sectionLabels[targets[0]] ?? 'sección'}
                        </Button>
                      </Group>
                    ) : requirement.key === 'optimizer' && onNavigateToOptimizer ? (
                      <Group justify="flex-end">
                        <Button size="sm" leftSection={<IconCalendarCog size={16} />} onClick={handleOptimizerClick}>
                          Abrir optimizador global
                        </Button>
                      </Group>
                    ) : null}
                  </Stack>
                </Card>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Modal>
  )
}
