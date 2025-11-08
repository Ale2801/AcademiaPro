import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconClockHour3, IconGripVertical, IconMail, IconRefresh, IconSchool, IconUsers } from '@tabler/icons-react'
import { DndContext, DragEndEvent, rectIntersection, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

import { api } from '../../lib/api'
import ScheduleTimeline, { ScheduleEntry, TimeslotSummary } from '../components/ScheduleTimeline'
import { useStudentSemesters, ProgramSemesterSummary } from './StudentSemesterContext'

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const
const SCHEDULE_DROP_ID = 'student-schedule-dropzone'

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const detail = (error as any)?.response?.data?.detail
    if (typeof detail === 'string') return detail
    const message = (error as any)?.message
    if (typeof message === 'string') return message
  }
  return 'Ocurrió un error inesperado'
}

type CourseSchedulePreview = {
  timeslot_id: number
  day_of_week?: number | null
  start_time?: string | null
  end_time?: string | null
  room_id?: number | null
  room_code?: string | null
}

type CourseOption = {
  course_id: number
  term: string
  group?: string | null
  capacity?: number | null
  enrolled: number
  available?: number | null
  is_full: boolean
  is_selected: boolean
  schedule: CourseSchedulePreview[]
}

type SubjectOption = {
  subject_id: number
  subject_code?: string | null
  subject_name: string
  program_semester_id: number
  courses: CourseOption[]
  selected_course_id?: number | null
  all_groups_full: boolean
}

type StudentScheduleOptionsResponse = {
  subjects: SubjectOption[]
  schedule: ScheduleEntry[]
  timeslots: TimeslotSummary[]
  active_program_semester?: ProgramSemesterSummary | null
}

type FeedbackState = {
  color: 'teal' | 'red' | 'yellow'
  text: string
}

type ContactState = {
  subject: SubjectOption
  message: string
}

type CourseOptionCardProps = {
  subject: SubjectOption
  course: CourseOption
  onAssign: (subject: SubjectOption, course: CourseOption) => void
  busyCourseId: number | null
}

function formatCourseSlot(slot: CourseSchedulePreview): string {
  const day = slot.day_of_week != null && slot.day_of_week >= 0 ? DAY_LABELS[slot.day_of_week] : 'Por asignar'
  const range = [slot.start_time, slot.end_time].filter(Boolean).join(' - ')
  return range ? `${day} · ${range}` : day
}

function CourseOptionCard({ subject, course, onAssign, busyCourseId }: CourseOptionCardProps) {
  const disabled = course.is_full || busyCourseId !== null
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `course-${course.course_id}`,
    disabled,
    data: {
      courseId: course.course_id,
      subjectId: subject.subject_id,
    },
  })

  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  const capacityLabel = course.capacity != null ? `${course.enrolled}/${course.capacity}` : `${course.enrolled}`
  const availableLabel = course.available != null ? `${course.available} disponibles` : 'Cupos ilimitados'
  const statusBadge = course.is_full ? (
    <Badge color="red" variant="light">Sin cupos</Badge>
  ) : course.is_selected ? (
    <Badge color="teal" variant="light">Asignado</Badge>
  ) : (
    <Badge color="blue" variant="light">{availableLabel}</Badge>
  )

  return (
    <Card
      ref={setNodeRef}
      withBorder
      padding="md"
      radius="md"
      style={{
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: disabled && !course.is_selected ? 0.55 : 1,
        boxShadow: isDragging
          ? '0 0 0 1px var(--mantine-color-blue-5)'
          : course.is_selected
            ? '0 0 0 1px var(--mantine-color-teal-5)'
            : undefined,
        borderColor: course.is_selected ? 'var(--mantine-color-teal-5)' : undefined,
        backgroundColor: course.is_full ? 'var(--mantine-color-dark-6)' : undefined,
        position: 'relative',
        zIndex: isDragging ? 1000 : undefined,
        ...dragStyle,
      }}
      {...(!disabled ? listeners : {})}
      {...(!disabled ? attributes : {})}
    >
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <ActionIcon
              size="sm"
              variant="transparent"
              color="gray"
              aria-label="Arrastrar alternativa"
              style={{ cursor: disabled ? 'not-allowed' : 'grab', pointerEvents: 'none' }}
              tabIndex={-1}
            >
              <IconGripVertical size={16} />
            </ActionIcon>
            <div>
              <Text fw={600} size="sm">
                Grupo {course.group ?? 'Sin asignar'}
              </Text>
              <Text size="xs" c="dimmed">
                {subject.subject_name} · {course.term}
              </Text>
            </div>
          </Group>
          {statusBadge}
        </Group>
        <Group gap="xs" align="center">
          <IconUsers size={16} />
          <Text size="sm">Inscritos: {capacityLabel}</Text>
        </Group>
        <Stack gap={4}>
          {course.schedule.length > 0 ? (
            course.schedule.map((slot) => (
              <Group key={`${course.course_id}-${slot.timeslot_id}`} gap="xs" align="center">
                <IconClockHour3 size={14} />
                <Text size="xs">{formatCourseSlot(slot)}</Text>
              </Group>
            ))
          ) : (
            <Text size="xs" c="dimmed">
              Horario aún no asignado
            </Text>
          )}
        </Stack>
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            Arrastra al horario o usa el botón para asignar.
          </Text>
          <Button
            size="xs"
            variant={course.is_selected ? 'light' : 'filled'}
            color="teal"
            onClick={(event) => {
              event.stopPropagation()
              onAssign(subject, course)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={disabled || course.is_selected}
          >
            {course.is_selected ? 'Asignado' : 'Asignar'}
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

export default function StudentSchedulePlanner(): React.ReactElement {
  const [data, setData] = useState<StudentScheduleOptionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [busyCourseId, setBusyCourseId] = useState<number | null>(null)
  const [contact, setContact] = useState<ContactState | null>(null)
  const [contactLoading, setContactLoading] = useState(false)
  const {
    data: semesterData,
    loading: semesterLoading,
    error: semesterError,
    needsSelection,
    selecting: selectingSemester,
    selectSemester,
    refresh: refreshSemesters,
  } = useStudentSemesters()
  const dropZoneRef = useRef<HTMLDivElement | null>(null)

  const activeSemesterId = semesterData?.current?.program_semester.id ?? null

  const fetchOptions = useCallback(async (opts?: { silent?: boolean }) => {
    if (!activeSemesterId) {
      if (opts?.silent) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
      return
    }
    if (opts?.silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const response = await api.get<StudentScheduleOptionsResponse>('/student-schedule/options')
      setData(response.data)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 409) {
        await refreshSemesters()
      }
      setError(getErrorMessage(err))
    } finally {
      if (opts?.silent) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [activeSemesterId, refreshSemesters])

  useEffect(() => {
    if (activeSemesterId) {
      void fetchOptions()
    } else {
      setData(null)
      if (!semesterLoading) {
        setLoading(false)
      }
    }
  }, [activeSemesterId, semesterLoading, fetchOptions])

  const handleSemesterChange = useCallback(
    async (value: string | null) => {
      if (!value) return
      setFeedback(null)
      try {
        await selectSemester(Number(value))
      } catch (err) {
        const message = err instanceof Error ? err.message : getErrorMessage(err)
        setFeedback({ color: 'red', text: message })
      }
    },
    [selectSemester],
  )

  const { setNodeRef, isOver } = useDroppable({ id: SCHEDULE_DROP_ID })
  const handleDropZoneRef = useCallback(
    (node: HTMLDivElement | null) => {
      dropZoneRef.current = node
      setNodeRef(node)
    },
    [setNodeRef],
  )

  const handleAssign = useCallback(
    async (subject: SubjectOption, course: CourseOption) => {
      if (course.is_full) {
        setFeedback({ color: 'yellow', text: 'El grupo seleccionado no tiene cupos disponibles.' })
        return
      }
      if (course.is_selected) {
        setFeedback({ color: 'teal', text: 'Este grupo ya forma parte de tu horario.' })
        return
      }
      if (!activeSemesterId) {
        setFeedback({ color: 'yellow', text: 'Selecciona un semestre activo para tu programa antes de asignar cursos.' })
        return
      }
      setBusyCourseId(course.course_id)
      try {
        if (subject.selected_course_id && subject.selected_course_id !== course.course_id) {
          await api.delete(`/student-schedule/enroll/${subject.selected_course_id}`)
        }
        await api.post('/student-schedule/enroll', { course_id: course.course_id })
        await fetchOptions({ silent: true })
        const groupLabel = course.group ? `Grupo ${course.group}` : 'Nuevo grupo'
        setFeedback({ color: 'teal', text: `Agregaste ${groupLabel} de ${subject.subject_name} a tu horario.` })
      } catch (err) {
        setFeedback({ color: 'red', text: getErrorMessage(err) })
        await fetchOptions({ silent: true })
      } finally {
        setBusyCourseId(null)
      }
    },
  [fetchOptions, activeSemesterId],
  )

  const handleRemove = useCallback(
    async (entry: ScheduleEntry) => {
      if (!activeSemesterId) {
        setFeedback({ color: 'yellow', text: 'Selecciona un semestre activo antes de modificar tu horario.' })
        return
      }
      setBusyCourseId(entry.course_id)
      try {
        await api.delete(`/student-schedule/enroll/${entry.course_id}`)
        await fetchOptions({ silent: true })
        setFeedback({ color: 'teal', text: 'Curso eliminado del horario.' })
      } catch (err) {
        setFeedback({ color: 'red', text: getErrorMessage(err) })
        await fetchOptions({ silent: true })
      } finally {
        setBusyCourseId(null)
      }
    },
  [fetchOptions, activeSemesterId],
  )

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      let intersectsDrop = event.over?.id === SCHEDULE_DROP_ID
      if (!intersectsDrop && dropZoneRef.current) {
        const activeRect = event.active.rect.current?.translated ?? event.active.rect.current?.initial
        if (activeRect) {
          const dropRect = dropZoneRef.current.getBoundingClientRect()
          intersectsDrop =
            activeRect.left < dropRect.right &&
            activeRect.right > dropRect.left &&
            activeRect.top < dropRect.bottom &&
            activeRect.bottom > dropRect.top
        }
      }
      if (!intersectsDrop) return
      const courseId = event.active.data.current?.courseId as number | undefined
      const subjectId = event.active.data.current?.subjectId as number | undefined
      if (!courseId || !subjectId || !data) return
      const subject = data.subjects.find((item) => item.subject_id === subjectId)
      const course = subject?.courses.find((item) => item.course_id === courseId)
      if (!subject || !course) return
      void handleAssign(subject, course)
    },
    [data, handleAssign],
  )

  const semesterOptions = useMemo(
    () =>
      (semesterData?.available ?? []).map((item) => ({
        value: String(item.id),
        label: item.label ?? `Semestre ${item.semester_number}`,
      })),
    [semesterData],
  )

  const currentSemesterValue = activeSemesterId ? String(activeSemesterId) : null
  const activeSemesterLabel = semesterData?.current
    ? semesterData.current.program_semester.label ?? `Semestre ${semesterData.current.program_semester.semester_number}`
    : null

  const selectedCourseIds = useMemo(() => new Set((data?.schedule ?? []).map((item) => item.course_id)), [data])

  const scheduleBusyIds = useMemo(() => (busyCourseId != null ? [busyCourseId] : undefined), [busyCourseId])
  const unscheduledEntries = useMemo(
    () =>
      (data?.schedule ?? []).filter(
        (entry) => entry.day_of_week == null || !entry.start_time || !entry.end_time,
      ),
    [data],
  )

  const handleContactSubmit = useCallback(async () => {
    if (!contact) return
    const trimmed = contact.message.trim()
    if (trimmed.length < 5) {
      setFeedback({ color: 'yellow', text: 'Por favor, añade un mensaje con al menos 5 caracteres.' })
      return
    }
    setContactLoading(true)
    try {
      await api.post('/student-schedule/contact', {
        subject_id: contact.subject.subject_id,
        message: trimmed,
        preferred_course_ids: contact.subject.courses.map((item) => item.course_id),
      })
      setFeedback({ color: 'teal', text: 'Tu mensaje fue enviado a la administración.' })
      setContact(null)
    } catch (err) {
      setFeedback({ color: 'red', text: getErrorMessage(err) })
    } finally {
      setContactLoading(false)
    }
  }, [contact])

  if ((loading || semesterLoading) && !data && !needsSelection) {
    return (
      <Card withBorder radius="lg" padding="xl">
        <Group justify="center" align="center">
          <Loader color="teal" />
        </Group>
      </Card>
    )
  }

  return (
    <Card withBorder radius="lg" padding="xl">
      <Stack gap="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Title order={4}>Planificador de horario</Title>
              <Text size="sm" c="dimmed">
                Arrastra las alternativas disponibles hacia tu horario semanal.
              </Text>
            </Stack>
            <ActionIcon
              variant="light"
              color="teal"
              onClick={() => void fetchOptions()}
              disabled={loading || refreshing || !activeSemesterId}
              aria-label="Actualizar opciones"
            >
              {refreshing || loading ? <Loader size="sm" color="teal" /> : <IconRefresh size={18} />}
            </ActionIcon>
          </Group>
          <Group align="center" gap="xs" wrap="wrap">
            <Group gap={6} align="center" wrap="nowrap">
              <IconSchool size={18} />
              <Text size="sm" fw={600}>
                Semestre activo
              </Text>
            </Group>
            <Select
              style={{ minWidth: 220, maxWidth: 320 }}
              data={semesterOptions}
              value={currentSemesterValue}
              placeholder="Selecciona un semestre"
              onChange={handleSemesterChange}
              disabled={semesterLoading || selectingSemester || semesterOptions.length === 0}
              nothingFoundMessage="Sin semestres disponibles"
              radius="md"
            />
            {activeSemesterLabel && (
              <Badge color="gray" variant="light">
                {activeSemesterLabel}
              </Badge>
            )}
            {selectingSemester && <Loader size="sm" color="teal" />}
          </Group>
        </Stack>

        {semesterError && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
            {semesterError}
          </Alert>
        )}
  {needsSelection && !activeSemesterId && !semesterError && (
          <Alert color="blue" variant="light" icon={<IconSchool size={18} />}>
            Selecciona un semestre habilitado para tu programa antes de confeccionar el horario.
          </Alert>
        )}
        {error && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
            {error}
          </Alert>
        )}

        {feedback && (
          <Alert
            color={feedback.color === 'teal' ? 'teal' : feedback.color === 'red' ? 'red' : 'yellow'}
            variant="light"
            withCloseButton
            onClose={() => setFeedback(null)}
          >
            {feedback.text}
          </Alert>
        )}

        {activeSemesterId ? (
          <DndContext collisionDetection={rectIntersection} onDragEnd={onDragEnd}>
            <Grid gutter={{ base: 'lg', md: 'xl' }}>
              <Grid.Col span={{ base: 12, lg: 2 }} order={{ base: 2, lg: 1 }}>
              <Stack gap="md">
                <Accordion variant="separated" radius="md" multiple={false} chevronPosition="left">
                  {(data?.subjects ?? []).map((subject) => {
                    const hasCupos = !subject.all_groups_full
                    const selectedLabel = subject.selected_course_id
                      ? subject.courses.find((c) => c.course_id === subject.selected_course_id)?.group ?? 'Asignado'
                      : null
                    return (
                      <Accordion.Item key={subject.subject_id} value={String(subject.subject_id)}>
                        <Accordion.Control>
                          <Group justify="space-between" align="center">
                            <Stack gap={2}>
                              <Text fw={600}>{subject.subject_name}</Text>
                              {subject.subject_code && (
                                <Text size="xs" c="dimmed">
                                  {subject.subject_code}
                                </Text>
                              )}
                            </Stack>
                            <Group gap="xs">
                              {selectedLabel && <Badge color="teal" variant="light">Grupo {selectedLabel}</Badge>}
                              {!hasCupos && <Badge color="red" variant="light">Sin cupos</Badge>}
                            </Group>
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel style={{ overflow: 'visible' }}>
                          <Stack gap="sm">
                            {subject.courses.map((course) => (
                              <CourseOptionCard
                                key={course.course_id}
                                subject={subject}
                                course={course}
                                onAssign={handleAssign}
                                busyCourseId={busyCourseId}
                              />
                            ))}
                            {!hasCupos && (
                              <Alert
                                color="yellow"
                                variant="light"
                                icon={<IconMail size={18} />}
                                title="Sin cupos disponibles"
                              >
                                <Stack gap="xs">
                                  <Text size="sm">
                                    Envíanos un mensaje para buscar una alternativa personalizada.
                                  </Text>
                                  <Button
                                    size="xs"
                                    variant="filled"
                                    color="yellow"
                                    onClick={() => setContact({ subject, message: '' })}
                                  >
                                    Contactar administración
                                  </Button>
                                </Stack>
                              </Alert>
                            )}
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    )
                  })}
                </Accordion>
                {data && data.subjects.length === 0 && (
                  <Alert color="gray" variant="light">
                    Aún no hay materias disponibles para tu programa.
                  </Alert>
                )}
              </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 10 }} order={{ base: 1, lg: 2 }}>
              <Stack gap="md">
                <Box
                  ref={handleDropZoneRef}
                  style={{
                    borderRadius: 'var(--mantine-radius-lg)',
                    border: `2px ${isOver ? 'solid' : 'dashed'} ${
                      isOver ? 'var(--mantine-color-teal-5)' : 'var(--mantine-color-dark-4)'
                    }`,
                    padding: 'var(--mantine-spacing-lg)',
                    transition: 'border-color 120ms ease',
                    backgroundColor: isOver ? 'var(--mantine-color-dark-6)' : 'transparent',
                    minHeight: '420px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Stack gap="md" style={{ flex: 1 }}>
                    <Group justify="space-between" align="center">
                      <Stack gap={0}>
                        <Text fw={600}>Mi horario</Text>
                        <Text size="sm" c="dimmed">
                          Arrastra aquí un grupo disponible para asignarlo.
                        </Text>
                      </Stack>
                      {selectedCourseIds.size > 0 && (
                        <Badge color="teal" variant="light">
                          {selectedCourseIds.size} cursos asignados
                        </Badge>
                      )}
                    </Group>
                    {data ? (
                      <ScheduleTimeline
                        entries={data.schedule}
                        onRemove={handleRemove}
                        busyCourseIds={scheduleBusyIds}
                        timeslots={data.timeslots}
                      />
                    ) : (
                      <Group justify="center" py="lg">
                        <Loader color="teal" />
                      </Group>
                    )}
                  </Stack>
                </Box>
                {unscheduledEntries.length > 0 && (
                  <Card withBorder radius="md" padding="md">
                    <Stack gap="sm">
                      <Group justify="space-between" align="center">
                        <Stack gap={2}>
                          <Text fw={600}>Asignaciones sin horario definido</Text>
                          <Text size="sm" c="dimmed">
                            Estas clases ya forman parte de tu horario pero aún no tienen día u hora confirmados.
                          </Text>
                        </Stack>
                        <Badge color="yellow" variant="light">
                          {unscheduledEntries.length}
                        </Badge>
                      </Group>
                      <Stack gap="sm">
                        {unscheduledEntries.map((entry) => (
                          <Card key={`${entry.course_id}-unscheduled`} withBorder radius="md" padding="sm">
                            <Stack gap={6}>
                              <Group justify="space-between" align="flex-start">
                                <Stack gap={2}>
                                  <Text fw={600}>{entry.course_name ?? `Curso #${entry.course_id}`}</Text>
                                  {entry.subject_name && (
                                    <Text size="xs" c="dimmed">{entry.subject_name}</Text>
                                  )}
                                  {entry.teacher_name && (
                                    <Text size="xs" c="dimmed">Docente: {entry.teacher_name}</Text>
                                  )}
                                </Stack>
                                <Badge color="yellow" variant="outline">Pendiente</Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                Aún no se registra un horario para este curso. Puedes consultar a coordinación o retirarlo mientras tanto.
                              </Text>
                              <Group justify="flex-end" gap="xs">
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => void handleRemove(entry)}
                                  disabled={busyCourseId === entry.course_id}
                                >
                                  Quitar del horario
                                </Button>
                              </Group>
                            </Stack>
                          </Card>
                        ))}
                      </Stack>
                    </Stack>
                  </Card>
                )}
              </Stack>
              </Grid.Col>
            </Grid>
          </DndContext>
        ) : (
          <Alert color="gray" variant="light">
            Selecciona un semestre para visualizar las materias disponibles de tu programa.
          </Alert>
        )}
      </Stack>

      <Modal
        opened={contact !== null}
        onClose={() => setContact(null)}
        title={contact ? `Contactar sobre ${contact.subject.subject_name}` : ''}
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Cuéntanos el motivo por el que necesitas ayuda para asignar esta materia.
          </Text>
          <Textarea
            minRows={4}
            maxRows={6}
            placeholder="Escribe tu mensaje..."
            value={contact?.message ?? ''}
            onChange={(event) =>
              setContact((current) => (current ? { ...current, message: event.currentTarget.value } : current))
            }
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setContact(null)} disabled={contactLoading}>
              Cancelar
            </Button>
            <Button color="teal" onClick={() => void handleContactSubmit()} loading={contactLoading}>
              Enviar mensaje
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  )
}
