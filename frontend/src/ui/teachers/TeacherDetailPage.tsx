import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBuilding,
  IconCalendarEvent,
  IconChalkboard,
  IconClockHour4,
  IconMail,
  IconPhone,
  IconRefresh,
} from '@tabler/icons-react'
import DashboardLayout from '../dashboards/DashboardLayout'
import { api } from '../../lib/api'
import { WEEKDAY_LABELS } from '../admin/constants'
import { minutesToTimeLabel } from '../admin/utils'
import { WeeklyScheduleGrid } from '../components/WeeklyScheduleGrid'

type TeacherRecord = {
  id: number
  user_id: number
  department?: string | null
  phone?: string | null
  hire_date?: string | null
  employment_type?: string | null
  office?: string | null
  specialty?: string | null
  bio?: string | null
}

type UserRecord = {
  id: number
  email: string
  full_name: string
  role: string
  is_active: boolean
}

type CourseRecord = {
  id: number
  subject_id: number
  teacher_id: number
  program_semester_id: number
  term?: string | null
  group?: string | null
  weekly_hours?: number | null
}

type CourseScheduleRecord = {
  id: number
  course_id: number
  room_id: number
  timeslot_id: number
  duration_minutes?: number | null
  start_offset_minutes?: number | null
}

type TimeslotRecord = {
  id: number
  day_of_week: number
  start_time: string
  end_time: string
  campus?: string | null
  comment?: string | null
}

type RoomRecord = {
  id: number
  code: string
  campus?: string | null
  building?: string | null
}

type SubjectRecord = {
  id: number
  name?: string | null
  code?: string | null
}

type TeacherScheduleEntry = {
  id: number
  courseId: number
  subjectId: number
  subjectName: string
  subjectCode?: string | null
  term?: string | null
  group?: string | null
  dayIndex: number
  dayLabel: string
  startMinutes: number
  endMinutes: number
  startLabel: string
  endLabel: string
  roomCode?: string | null
  campus?: string | null
  building?: string | null
  note?: string | null
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Jornada completa',
  part_time: 'Medio tiempo',
  contract: 'Por contrato',
}

const EMPLOYMENT_COLORS: Record<string, string> = {
  full_time: 'teal',
  part_time: 'indigo',
  contract: 'orange',
}

function parseTimeToMinutes(value?: string | null) {
  if (!value) return null
  const parts = value.split(':')
  if (parts.length < 2) return null
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin registro'
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export default function TeacherDetailPage() {
  const { teacherId } = useParams()
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState<TeacherRecord | null>(null)
  const [user, setUser] = useState<UserRecord | null>(null)
  const [courses, setCourses] = useState<CourseRecord[]>([])
  const [subjects, setSubjects] = useState<SubjectRecord[]>([])
  const [scheduleEntries, setScheduleEntries] = useState<TeacherScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const teacherIdNumber = useMemo(() => {
    if (!teacherId) return null
    const parsed = Number(teacherId)
    return Number.isFinite(parsed) ? parsed : null
  }, [teacherId])

  const subjectMap = useMemo(() => {
    const map = new Map<number, SubjectRecord>()
    for (const subject of subjects) {
      map.set(subject.id, subject)
    }
    return map
  }, [subjects])

  const loadData = useCallback(async () => {
    if (teacherIdNumber == null) {
      setError('Identificador de profesor inválido')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const teacherRes = await api.get(`/teachers/${teacherIdNumber}`)
      const teacherData = teacherRes.data as TeacherRecord
      const [usersRes, coursesRes, schedulesRes, timeslotsRes, roomsRes, subjectsRes] = await Promise.all([
        api.get('/users/'),
        api.get('/courses/'),
        api.get('/course-schedules/'),
        api.get('/timeslots/'),
        api.get('/rooms/'),
        api.get('/subjects/'),
      ])

      const users = Array.isArray(usersRes.data) ? (usersRes.data as UserRecord[]) : []
      const userData = users.find((item) => item.id === teacherData.user_id) ?? null

      const allCourses = Array.isArray(coursesRes.data) ? (coursesRes.data as CourseRecord[]) : []
      const teacherCourses = allCourses.filter((course) => Number(course.teacher_id) === teacherIdNumber)
      const courseIds = new Set(teacherCourses.map((course) => course.id))

      const allSchedules = Array.isArray(schedulesRes.data) ? (schedulesRes.data as CourseScheduleRecord[]) : []
      const teacherSchedules = allSchedules.filter((schedule) => courseIds.has(Number(schedule.course_id)))

      const timeslots = Array.isArray(timeslotsRes.data) ? (timeslotsRes.data as TimeslotRecord[]) : []
      const rooms = Array.isArray(roomsRes.data) ? (roomsRes.data as RoomRecord[]) : []
      const subjectsData = Array.isArray(subjectsRes.data) ? (subjectsRes.data as SubjectRecord[]) : []

      const timeslotMap = new Map<number, TimeslotRecord>()
      for (const slot of timeslots) {
        timeslotMap.set(slot.id, slot)
      }

      const roomMap = new Map<number, RoomRecord>()
      for (const room of rooms) {
        roomMap.set(room.id, room)
      }

      const subjectLookup = new Map<number, SubjectRecord>()
      for (const subject of subjectsData) {
        subjectLookup.set(subject.id, subject)
      }

      const entries: TeacherScheduleEntry[] = []
      for (const schedule of teacherSchedules) {
        const timeslot = timeslotMap.get(schedule.timeslot_id)
        if (!timeslot) continue
        const courseId = Number(schedule.course_id)
        const course = teacherCourses.find((item) => item.id === courseId)
        if (!course) continue
        const baseStart = parseTimeToMinutes(timeslot.start_time)
        const baseEnd = parseTimeToMinutes(timeslot.end_time)
        if (baseStart == null || baseEnd == null) continue
        const offset = schedule.start_offset_minutes ?? 0
        const startMinutes = baseStart + offset
        const duration = schedule.duration_minutes ?? (baseEnd - baseStart)
        const endMinutes = startMinutes + duration
        const dayIndex = Number(timeslot.day_of_week)
        const dayLabel = WEEKDAY_LABELS[dayIndex] ?? `Día ${dayIndex}`
        const subject = subjectLookup.get(course.subject_id)
        entries.push({
          id: schedule.id,
          courseId,
          subjectId: course.subject_id,
          subjectName: subject?.name ?? subject?.code ?? `Curso ${courseId}`,
          subjectCode: subject?.code ?? null,
          term: course.term ?? undefined,
          group: course.group ?? undefined,
          dayIndex,
          dayLabel,
          startMinutes,
          endMinutes,
          startLabel: minutesToTimeLabel(startMinutes),
          endLabel: minutesToTimeLabel(endMinutes),
          roomCode: roomMap.get(schedule.room_id)?.code ?? null,
          campus: roomMap.get(schedule.room_id)?.campus ?? timeslot.campus ?? null,
          building: roomMap.get(schedule.room_id)?.building ?? null,
          note: timeslot.comment ?? null,
        })
      }

      entries.sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex
        if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes
        return a.endMinutes - b.endMinutes
      })

      setTeacher(teacherData)
      setUser(userData)
      setCourses(teacherCourses)
      setSubjects(subjectsData)
      setScheduleEntries(entries)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo cargar la información del profesor'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [teacherIdNumber])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleBack = useCallback(() => {
    navigate('/dashboard/admin?section=teachers')
  }, [navigate])

  const teacherName = useMemo(() => {
    if (user?.full_name) return user.full_name
    if (teacher) return `Profesor ${teacher.id}`
    return 'Profesor'
  }, [teacher, user])

  const employmentKey = teacher?.employment_type ? String(teacher.employment_type) : null
  const employmentLabel = employmentKey ? EMPLOYMENT_LABELS[employmentKey] ?? employmentKey.replace(/_/g, ' ') : null
  const employmentColor = employmentKey ? EMPLOYMENT_COLORS[employmentKey] ?? 'gray' : 'gray'
  const hireDateLabel = formatDate(teacher?.hire_date)
  const teacherEmail = user?.email ?? 'Sin correo registrado'
  const teacherPhone = teacher?.phone ?? 'Sin teléfono registrado'
  const teacherOffice = teacher?.office ?? 'Sin oficina asignada'
  const teacherDepartment = teacher?.department ?? 'Sin departamento asignado'

  const weeklyHours = useMemo(() => {
    return courses.reduce((acc, course) => acc + (course.weekly_hours ?? 0), 0)
  }, [courses])

  const campuses = useMemo(() => {
    const set = new Set<string>()
    for (const entry of scheduleEntries) {
      if (entry.campus) set.add(entry.campus)
    }
    return Array.from(set)
  }, [scheduleEntries])

  const scheduleGridEntries = useMemo(
    () =>
      scheduleEntries.map((entry) => {
        const subtitleParts = [
          entry.term ?? null,
          entry.group ? `Grupo ${entry.group}` : null,
          entry.subjectCode ?? null,
        ].filter(Boolean)
        const locationParts = [entry.campus ?? null, entry.building ?? null].filter(Boolean)
        return {
          id: entry.id,
          dayIndex: entry.dayIndex,
          startMinutes: entry.startMinutes,
          endMinutes: entry.endMinutes,
          startLabel: entry.startLabel,
          endLabel: entry.endLabel,
          title: entry.subjectName,
          subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : null,
          room: entry.roomCode ?? null,
          location: locationParts.length > 0 ? locationParts.join(' · ') : null,
          note: entry.note ?? null,
        }
      }),
    [scheduleEntries],
  )

  const actions = (
    <Button
      variant="light"
      color="dark"
      leftSection={<IconArrowLeft size={16} />}
      onClick={handleBack}
    >
      Volver
    </Button>
  )

  const pageTitle = `Profesor: ${teacherName}`
  const pageSubtitle = employmentLabel ? `Perfil docente • ${employmentLabel}` : 'Perfil docente'

  const metrics = [
    {
      label: 'Cursos asignados',
      value: courses.length,
      hint: 'Cursos activos en el plan',
      icon: IconChalkboard,
    },
    {
      label: 'Bloques programados',
      value: scheduleEntries.length,
      hint: 'Sesiones con sala asignada',
      icon: IconClockHour4,
    },
    {
      label: 'Horas semanales (planificadas)',
      value: weeklyHours,
      hint: 'Suma de horas por curso',
      icon: IconCalendarEvent,
    },
  ]

  if (loading) {
    return (
      <DashboardLayout title="Cargando profesor" subtitle="">
        <Group justify="center" align="center" mih={320}>
          <Loader color="indigo" />
        </Group>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
  <DashboardLayout title="Error al cargar" subtitle="" actions={actions}>
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
          <Button leftSection={<IconRefresh size={16} />} variant="light" color="indigo" onClick={() => void loadData()}>
            Reintentar
          </Button>
        </Stack>
      </DashboardLayout>
    )
  }

  if (!teacher) {
    return (
  <DashboardLayout title="Profesor no encontrado" subtitle="" actions={actions}>
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          No se encontró el profesor solicitado. Regresa al panel y selecciona otro registro.
        </Alert>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title={pageTitle} subtitle={pageSubtitle} actions={actions}>
      <Stack gap="xl">
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Title order={3}>{teacherName}</Title>
                <Group gap="xs" wrap="wrap">
                  {employmentLabel ? (
                    <Badge color={employmentColor} variant="light">
                      {employmentLabel}
                    </Badge>
                  ) : null}
                  <Badge color={user?.is_active ? 'teal' : 'gray'} variant="outline">
                    {user?.is_active ? 'Usuario activo' : 'Usuario inactivo'}
                  </Badge>
                  <Badge color="gray" variant="light">
                    Departamento: {teacherDepartment}
                  </Badge>
                </Group>
              </Stack>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconMail size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Correo
                    </Text>
                    <Text>{teacherEmail}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconPhone size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Teléfono
                    </Text>
                    <Text>{teacherPhone}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconBuilding size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Oficina
                    </Text>
                    <Text>{teacherOffice}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconCalendarEvent size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Fecha de contratación
                    </Text>
                    <Text>{hireDateLabel}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconChalkboard size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Especialidad
                    </Text>
                    <Text>{teacher?.specialty ?? 'Sin especialidad registrada'}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconBuilding size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Campus frecuentes
                    </Text>
                    <Text>
                      {campuses.length > 0 ? campuses.join(', ') : 'Sin asignación registrada'}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
            </SimpleGrid>

            {teacher.bio ? (
              <Paper withBorder radius="md" p="md">
                <Stack gap={4}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Reseña profesional
                  </Text>
                  <Text size="sm">{teacher.bio}</Text>
                </Stack>
              </Paper>
            ) : null}
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Panorama docente
                </Text>
                <Title order={4}>Resumen rápido</Title>
              </div>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              {metrics.map((metric) => (
                <Paper key={metric.label} withBorder radius="md" p="md">
                  <Group gap="md">
                    <metric.icon size={18} color="var(--mantine-color-indigo-6)" />
                    <Stack gap={2}>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                        {metric.label}
                      </Text>
                      <Text fw={600}>{metric.value}</Text>
                      <Text size="xs" c="dimmed">{metric.hint}</Text>
                    </Stack>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Horario semanal
                </Text>
                <Title order={4}>Bloques programados</Title>
              </div>
              <Badge color="indigo" variant="light">
                {scheduleEntries.length} bloque{scheduleEntries.length === 1 ? '' : 's'}
              </Badge>
            </Group>
            {scheduleEntries.length === 0 ? (
              <Alert color="blue" variant="light" icon={<IconAlertTriangle size={16} />}>
                Este profesor aún no tiene bloques asignados en el horario institucional.
              </Alert>
            ) : (
              <WeeklyScheduleGrid
                entries={scheduleGridEntries}
                emptyDayLabel="Sin clases en este día"
                emptyStateLabel="Este profesor no tiene bloques programados durante la semana"
              />
            )}
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Cursos asignados
                </Text>
                <Title order={4}>Detalle de carga académica</Title>
              </div>
              <Badge color="dark" variant="light">
                {courses.length} curso{courses.length === 1 ? '' : 's'}
              </Badge>
            </Group>
            {courses.length === 0 ? (
              <Alert color="gray" variant="light" icon={<IconAlertTriangle size={16} />}>
                No se encontraron cursos asociados a este docente. Asigna cursos desde la tabla principal.
              </Alert>
            ) : (
              <ScrollArea.Autosize mah="50vh" offsetScrollbars>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: '40%' }}>Asignatura</Table.Th>
                      <Table.Th style={{ width: '20%' }}>Periodo</Table.Th>
                      <Table.Th style={{ width: '20%' }}>Grupo</Table.Th>
                      <Table.Th style={{ width: '20%' }}>Horas semanales</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {courses.map((course) => {
                      const subject = subjectMap.get(course.subject_id)
                      return (
                        <Table.Tr key={course.id}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={600}>{subject?.name ?? subject?.code ?? `Curso ${course.id}`}</Text>
                              {subject?.code ? (
                                <Text size="xs" c="dimmed">
                                  Código {subject.code}
                                </Text>
                              ) : null}
                            </Stack>
                          </Table.Td>
                          <Table.Td>{course.term ?? 'No definido'}</Table.Td>
                          <Table.Td>{course.group ?? 'A'}</Table.Td>
                          <Table.Td>{course.weekly_hours ?? '—'}</Table.Td>
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}
          </Stack>
        </Card>
      </Stack>
    </DashboardLayout>
  )
}
