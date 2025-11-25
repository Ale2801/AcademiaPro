import React, { useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Badge,
  Card,
  Group,
  Progress,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import {
  IconClockHour3,
  IconMapPin,
  IconPencil,
  IconSearch,
  IconTrash,
  IconUser,
} from '@tabler/icons-react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { Transform } from '@dnd-kit/utilities'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ScheduleEntry } from './ScheduleTimeline'

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const HOUR_EPSILON = 1 / 60 // ~1 minuto

function hoursToParts(hoursValue: number) {
  if (!Number.isFinite(hoursValue)) {
    return { hours: 0, minutes: 0 }
  }
  const totalMinutes = Math.max(Math.round(hoursValue * 60), 0)
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  }
}

function formatHoursCompact(value: number) {
  const { hours, minutes } = hoursToParts(value)
  if (hours === 0 && minutes === 0) return '0h'
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

function formatHoursVerbose(value: number) {
  const { hours, minutes } = hoursToParts(value)
  if (hours === 0 && minutes === 0) return '0 minutos'
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`)
  if (minutes > 0) parts.push(`${minutes} minuto${minutes === 1 ? '' : 's'}`)
  return parts.join(' ')
}

type CourseSummary = {
  id: number
  label: string
  subjectName?: string
  teacherName?: string
  weeklyHours: number
  assignedHours: number
}

type TimeslotSummary = {
  id: number
  start: string | null
  end: string | null
}

type TimeslotColumn = {
  day: number
  label: string
  slots: TimeslotSummary[]
}

type ActiveDrag =
  | { type: 'course'; course: CourseSummary }
  | { type: 'assignment'; assignment: ScheduleEntry }

export type ScheduleDesignerProps = {
  courses: CourseSummary[]
  timeslots: TimeslotColumn[]
  assignmentsByTimeslot: Map<number, ScheduleEntry[]>
  onCourseDrop: (courseId: number, timeslotId: number) => void
  onAssignmentDrop: (assignmentId: number, timeslotId: number) => void | Promise<void>
  onEditAssignment: (assignment: ScheduleEntry) => void
  onDeleteAssignment: (assignment: ScheduleEntry) => void | Promise<void>
  loading?: boolean
  highlightCourseId?: number | null
  onHighlightConsumed?: () => void
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return 'Sin horario definido'
  return [start, end].filter(Boolean).join(' - ')
}

function translateStyle(transform: Transform | null) {
  if (!transform) return undefined
  return {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
  }
}

function CourseCard({ course, disabled, highlighted }: { course: CourseSummary; disabled?: boolean; highlighted?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `course-${course.id}`,
    data: { type: 'course', course },
    disabled,
  })

  const hasTarget = course.weeklyHours > HOUR_EPSILON
  const remainingHours = Math.max(course.weeklyHours - course.assignedHours, 0)
  const overage = Math.max(course.assignedHours - course.weeklyHours, 0)
  const isExceeded = hasTarget && overage > HOUR_EPSILON
  const isComplete = hasTarget && !isExceeded && remainingHours <= HOUR_EPSILON

  const badgeColor = hasTarget ? (isExceeded ? 'red' : isComplete ? 'teal' : 'blue') : 'gray'
  const progressColor = badgeColor
  const progressValue = hasTarget ? Math.min((course.assignedHours / course.weeklyHours) * 100, 100) : 0
  const progressAnimated = hasTarget && !isComplete && !isExceeded && remainingHours > HOUR_EPSILON

  let statusLabel: string
  if (!hasTarget) {
    statusLabel = 'Sin objetivo de horas definido'
  } else if (isExceeded) {
    statusLabel = `Excedido por ${formatHoursVerbose(overage)}`
  } else if (isComplete) {
    statusLabel = 'Horario cubierto'
  } else {
    statusLabel = `Faltan ${formatHoursVerbose(remainingHours)}`
  }
  const statusColor = isExceeded ? 'red' : hasTarget ? 'dimmed' : 'dimmed'

  const badgeLabel = hasTarget
    ? `${formatHoursCompact(course.assignedHours)} / ${formatHoursCompact(course.weeklyHours)}`
    : `${formatHoursCompact(course.assignedHours)} programadas`

  return (
    <Card
      id={`planner-course-${course.id}`}
      ref={setNodeRef}
      padding="md"
      radius="lg"
      withBorder
      {...attributes}
      {...listeners}
      style={{
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: disabled ? 0.5 : isDragging ? 0.6 : 1,
        boxShadow: highlighted ? '0 0 0 2px var(--mantine-color-yellow-5)' : undefined,
        backgroundColor: highlighted ? 'var(--mantine-color-yellow-light)' : undefined,
        transition: 'box-shadow 160ms ease, background-color 160ms ease, opacity 120ms ease',
        ...translateStyle(transform),
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Stack gap={0}>
            <Text fw={600}>{course.label}</Text>
            {course.teacherName && (
              <Group gap={6} align="center">
                <IconUser size={14} />
                <Text size="sm" c="dimmed">{course.teacherName}</Text>
              </Group>
            )}
          </Stack>
          <Badge color={badgeColor} variant="light">
            {badgeLabel}
          </Badge>
        </Group>
        <Progress value={progressValue} radius="xl" size="sm" color={progressColor} animated={progressAnimated} />
        <Text size="xs" c={statusColor}>
          {statusLabel}
        </Text>
      </Stack>
    </Card>
  )
}

function AssignmentCard({
  assignment,
  onEdit,
  onDelete,
  disabled,
}: {
  assignment: ScheduleEntry
  onEdit: (assignment: ScheduleEntry) => void
  onDelete: (assignment: ScheduleEntry) => void
  disabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: assignment.id ? `assignment-${assignment.id}` : `assignment-${assignment.course_id}-${assignment.timeslot_id}`,
    data: { type: 'assignment', assignment },
    disabled,
  })

  return (
    <Card
      ref={setNodeRef}
      padding="sm"
      radius="md"
      withBorder
      shadow={isDragging ? 'md' : undefined}
      {...attributes}
      {...listeners}
      style={{
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: disabled ? 0.5 : isDragging ? 0.65 : 1,
        ...translateStyle(transform),
      }}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" lineClamp={2}>
              {assignment.course_name ?? `Curso #${assignment.course_id}`}
            </Text>
            {assignment.teacher_name && (
              <Text size="xs" c="dimmed" truncate>
                {assignment.teacher_name}
              </Text>
            )}
            <Group gap={6} align="center">
              <IconMapPin size={14} />
              <Text size="xs">{assignment.room_code ?? 'Sala por definir'}</Text>
            </Group>
                      <Group gap={6} align="center">
                        <IconClockHour3 size={14} />
                        <Text size="xs">
                          {formatRange(assignment.start_time ?? null, assignment.end_time ?? null)}
                          {assignment.duration_minutes ? ` · ${formatHoursCompact(assignment.duration_minutes / 60)}` : ''}
                        </Text>
                      </Group>
          </Stack>
          <Group gap={4} wrap="nowrap">
            <ActionIcon
              size="sm"
              variant="default"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onEdit(assignment)
              }}
            >
              <IconPencil size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="light"
              color="red"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDelete(assignment)
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Group>
      </Stack>
    </Card>
  )
}

function TimeslotDropZone({
  slot,
  assignments,
  loading,
  onEdit,
  onDelete,
}: {
  slot: TimeslotSummary
  assignments: ScheduleEntry[]
  loading?: boolean
  onEdit: (assignment: ScheduleEntry) => void
  onDelete: (assignment: ScheduleEntry) => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `timeslot-${slot.id}`,
    data: { type: 'timeslot', timeslotId: slot.id },
    disabled: loading,
  })

  return (
    <Card
      ref={setNodeRef}
      padding="sm"
      radius="md"
      withBorder
      style={{
        borderStyle: isOver ? 'solid' : 'dashed',
        borderColor: isOver ? 'var(--mantine-color-teal-5)' : 'var(--mantine-color-gray-4)',
        backgroundColor: isOver ? 'var(--mantine-color-teal-light)' : undefined,
        transition: 'background-color 120ms ease',
        minHeight: assignments.length > 0 ? 'auto' : '96px',
      }}
    >
      <Stack gap="xs">
        <Group gap={6} align="center">
          <IconClockHour3 size={14} />
          <Text size="sm">{formatRange(slot.start, slot.end)}</Text>
        </Group>
        <Stack gap="xs">
          {assignments.length === 0 && (
            <Text size="xs" c="dimmed" ta="center">
              Arrastra una clase a este bloque
            </Text>
          )}
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id ?? `${assignment.course_id}-${assignment.timeslot_id}-${assignment.room_code ?? 'room'}`}
              assignment={assignment}
              onEdit={onEdit}
              onDelete={onDelete}
              disabled={loading}
            />
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}

export function ScheduleDesigner({
  courses,
  timeslots,
  assignmentsByTimeslot,
  onCourseDrop,
  onAssignmentDrop,
  onEditAssignment,
  onDeleteAssignment,
  loading,
  highlightCourseId,
  onHighlightConsumed,
}: ScheduleDesignerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  )

  const [filter, setFilter] = useState('')
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const dayPanels = useMemo(() => timeslots.map((column) => `day-${column.day}`), [timeslots])
  const [expandedDays, setExpandedDays] = useState<string[]>([])

  useEffect(() => {
    setExpandedDays((current) => current.filter((value) => dayPanels.includes(value)))
  }, [dayPanels])

  const filteredCourses = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return courses
    return courses.filter((course) =>
      [course.label, course.teacherName, course.subjectName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    )
  }, [courses, filter])

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as ActiveDrag | undefined
    if (data) {
      setActiveDrag(data)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDrag(null)
    if (!over) return

    const overData = over.data.current as { type?: string; timeslotId?: number } | undefined
    if (!overData || overData.type !== 'timeslot' || typeof overData.timeslotId !== 'number') return

    const activeData = active.data.current as ActiveDrag | undefined
    if (!activeData) return

    if (activeData.type === 'course') {
      onCourseDrop(activeData.course.id, overData.timeslotId)
      return
    }

    if (activeData.type === 'assignment') {
      const assignmentId = activeData.assignment.id
      if (assignmentId) {
        onAssignmentDrop(assignmentId, overData.timeslotId)
      }
    }
  }

  useEffect(() => {
    if (highlightCourseId == null) return
    const element = document.getElementById(`planner-course-${highlightCourseId}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightCourseId, courses])

  useEffect(() => {
    if (highlightCourseId == null) return
    if (typeof window === 'undefined') return
    const element = document.getElementById(`planner-course-${highlightCourseId}`)
    if (!element) return

    let timeoutId: number | null = null
    let hasTriggered = false

    const observer = new IntersectionObserver((entries) => {
      if (hasTriggered) return
      if (entries.some((entry) => entry.isIntersecting)) {
        hasTriggered = true
        observer.disconnect()
        timeoutId = window.setTimeout(() => {
          onHighlightConsumed?.()
        }, 2500)
      }
    }, { threshold: 0.35 })

    observer.observe(element)

    return () => {
      observer.disconnect()
      if (timeoutId != null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [highlightCourseId, courses, onHighlightConsumed])

  const renderOverlay = () => {
    if (!activeDrag) return null
    if (activeDrag.type === 'course') {
      return <CourseCard course={activeDrag.course} />
    }
    return <AssignmentCard assignment={activeDrag.assignment} onEdit={() => {}} onDelete={() => {}} />
  }

  return (
    <Card withBorder radius="lg" padding="xl" shadow="sm">
      <Stack gap="xl">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <Group align="stretch" gap="xl" wrap="wrap">
            <Stack
              gap="md"
              style={{ flex: '0 0 340px', minWidth: '280px', maxWidth: '360px', alignSelf: 'stretch' }}
            >
              <Group justify="space-between" align="center">
                <div>
                  <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                    Biblioteca de clases
                  </Text>
                  <Title order={4}>Planifica por arrastre</Title>
                </div>
                <Badge color="blue" variant="light">
                  {courses.length}
                </Badge>
              </Group>
              <TextInput
                placeholder="Buscar por nombre o docente"
                leftSection={<IconSearch size={16} />}
                value={filter}
                onChange={(event) => setFilter(event.currentTarget.value)}
              />
              <ScrollArea.Autosize mah="60vh" type="always" offsetScrollbars>
                <Stack gap="md">
                  {filteredCourses.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No se encontraron cursos con el criterio indicado.
                    </Text>
                  ) : (
                    filteredCourses.map((course) => {
                      const fulfilled =
                        course.weeklyHours > HOUR_EPSILON &&
                        course.assignedHours >= course.weeklyHours - HOUR_EPSILON
                      return (
                        <CourseCard
                          key={course.id}
                          course={course}
                          disabled={loading || fulfilled}
                          highlighted={highlightCourseId === course.id}
                        />
                      )
                    })
                  )}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>

            <ScrollArea.Autosize
              mah="70vh"
              style={{ flex: 1, minWidth: '360px' }}
              type="always"
              offsetScrollbars
            >
              <Stack gap="lg">
                <Group align="center" justify="space-between">
                  <Title order={4}>Horario semanal</Title>
                  <Badge color="gray" variant="light">
                    Arrastra cursos y reubica bloques existentes
                  </Badge>
                </Group>
                <Stack gap="lg">
                  {timeslots.length === 0 ? (
                    <Card padding="xl" radius="lg" withBorder>
                      <Stack gap="sm" align="center">
                        <Text fw={600}>No hay bloques horarios configurados</Text>
                        <Text size="sm" c="dimmed" ta="center">
                          Crea bloques desde la administración de Bloques Horarios para comenzar a planificar.
                        </Text>
                      </Stack>
                    </Card>
                  ) : (
                    <Accordion
                      multiple
                      value={expandedDays}
                      onChange={setExpandedDays}
                      variant="contained"
                      radius="lg"
                    >
                      {timeslots.map((column) => (
                        <Accordion.Item value={`day-${column.day}`} key={column.day}>
                          <Accordion.Control>
                            <Group justify="space-between" align="center">
                              <Text fw={600}>{column.label}</Text>
                              <Badge color="blue" variant="light">
                                {column.slots.length} bloque{column.slots.length === 1 ? '' : 's'}
                              </Badge>
                            </Group>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="sm">
                              {column.slots.map((slot) => (
                                <TimeslotDropZone
                                  key={slot.id}
                                  slot={slot}
                                  assignments={assignmentsByTimeslot.get(slot.id) ?? []}
                                  loading={loading}
                                  onEdit={onEditAssignment}
                                  onDelete={onDeleteAssignment}
                                />
                              ))}
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  )}
                </Stack>
              </Stack>
            </ScrollArea.Autosize>
          </Group>
          <DragOverlay dropAnimation={null}>{renderOverlay()}</DragOverlay>
        </DndContext>
      </Stack>
    </Card>
  )
}

export default ScheduleDesigner
