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
  IconBook2,
  IconCalendarEvent,
  IconCalendarStats,
  IconClockHour4,
  IconRefresh,
  IconSchool,
  IconUsersGroup,
} from '@tabler/icons-react'
import DashboardLayout from '../dashboards/DashboardLayout'
import { api } from '../../lib/api'
import { WEEKDAY_LABELS } from '../admin/constants'
import { minutesToTimeLabel } from '../admin/utils'
import { WeeklyScheduleGrid } from '../components/WeeklyScheduleGrid'

type StudentRecord = {
  id: number
  user_id: number
  enrollment_year: number
  registration_number?: string | null
  program_id: number
  grade_level?: string | null
  section?: string | null
  modality?: string | null
  status: string
  study_shift?: string | null
  admission_type?: string | null
  financing_type?: string | null
  cohort_year?: number | null
  admission_date?: string | null
  expected_graduation_date?: string | null
  current_term?: string | null
}

type UserRecord = {
  id: number
  email: string
  full_name: string
  phone?: string | null
  role: string
  is_active: boolean
}

type ProgramRecord = {
  id: number
  code?: string | null
  name?: string | null
  level?: string | null
  duration_semesters?: number | null
  description?: string | null
  is_active?: boolean
}

type EnrollmentRecord = {
  id: number
  student_id: number
  course_id: number
  status: string
  final_grade?: number | null
  enrolled_at?: string | null
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

type StudentScheduleEntry = {
  id: number
  courseId: number
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

const SHIFT_LABELS: Record<string, string> = {
  diurna: 'Diurna',
  vespertina: 'Vespertina',
  mixta: 'Mixta',
  ejecutiva: 'Ejecutiva',
}

const ADMISSION_LABELS: Record<string, string> = {
  paes: 'PAES / PSU',
  pace: 'PACE',
  traslado: 'Traslado',
  especial: 'Vía especial',
  otra: 'Otro',
}

const FINANCING_LABELS: Record<string, string> = {
  gratuidad: 'Gratuidad',
  beca: 'Beca',
  credito: 'Crédito',
  particular: 'Autofinanciado',
  empresa: 'Convenio empresa',
}

const MODALITY_LABELS: Record<string, string> = {
  in_person: 'Presencial',
  online: 'Online',
  hybrid: 'Híbrida',
}

const STUDENT_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  graduated: 'Titulado',
  withdrawn: 'Retirado',
}

const STUDENT_STATUS_COLORS: Record<string, string> = {
  active: 'teal',
  suspended: 'yellow',
  graduated: 'indigo',
  withdrawn: 'red',
}

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  enrolled: 'Inscrito',
  dropped: 'Retirado',
  completed: 'Completado',
  failed: 'Reprobado',
  withdrawn: 'Retirado',
}

const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  enrolled: 'teal',
  dropped: 'yellow',
  completed: 'indigo',
  failed: 'red',
  withdrawn: 'red',
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

function formatDate(value?: string | null, fallback = 'Sin registro') {
  if (!value) return fallback
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export default function StudentDetailPage() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState<StudentRecord | null>(null)
  const [user, setUser] = useState<UserRecord | null>(null)
  const [program, setProgram] = useState<ProgramRecord | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([])
  const [courses, setCourses] = useState<CourseRecord[]>([])
  const [subjects, setSubjects] = useState<SubjectRecord[]>([])
  const [scheduleEntries, setScheduleEntries] = useState<StudentScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const studentIdNumber = useMemo(() => {
    if (!studentId) return null
    const parsed = Number(studentId)
    return Number.isFinite(parsed) ? parsed : null
  }, [studentId])

  const subjectMap = useMemo(() => {
    const map = new Map<number, SubjectRecord>()
    for (const subject of subjects) {
      map.set(subject.id, subject)
    }
    return map
  }, [subjects])

  const courseMap = useMemo(() => {
    const map = new Map<number, CourseRecord>()
    for (const course of courses) {
      map.set(course.id, course)
    }
    return map
  }, [courses])

  const loadData = useCallback(async () => {
    if (studentIdNumber == null) {
      setError('Identificador de estudiante inválido')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const studentRes = await api.get(`/students/${studentIdNumber}`)
      const studentData = studentRes.data as StudentRecord

      const [usersRes, programsRes, enrollmentsRes, coursesRes, schedulesRes, timeslotsRes, roomsRes, subjectsRes] = await Promise.all([
        api.get('/users/'),
        api.get('/programs/'),
        api.get('/enrollments/'),
        api.get('/courses/'),
        api.get('/course-schedules/'),
        api.get('/timeslots/'),
        api.get('/rooms/'),
        api.get('/subjects/'),
      ])

      const users = Array.isArray(usersRes.data) ? (usersRes.data as UserRecord[]) : []
      const programs = Array.isArray(programsRes.data) ? (programsRes.data as ProgramRecord[]) : []
      const allEnrollments = Array.isArray(enrollmentsRes.data) ? (enrollmentsRes.data as EnrollmentRecord[]) : []
      const allCourses = Array.isArray(coursesRes.data) ? (coursesRes.data as CourseRecord[]) : []
      const allSchedules = Array.isArray(schedulesRes.data) ? (schedulesRes.data as CourseScheduleRecord[]) : []
      const timeslots = Array.isArray(timeslotsRes.data) ? (timeslotsRes.data as TimeslotRecord[]) : []
      const rooms = Array.isArray(roomsRes.data) ? (roomsRes.data as RoomRecord[]) : []
      const subjectsData = Array.isArray(subjectsRes.data) ? (subjectsRes.data as SubjectRecord[]) : []

      const userData = users.find((item) => item.id === studentData.user_id) ?? null
      const programData = programs.find((item) => item.id === studentData.program_id) ?? null

      const studentEnrollments = allEnrollments.filter((enrollment) => Number(enrollment.student_id) === studentIdNumber)
      const courseIds = new Set(studentEnrollments.map((enrollment) => Number(enrollment.course_id)))
      const studentCourses = allCourses.filter((course) => courseIds.has(Number(course.id)))
      const studentSchedules = allSchedules.filter((schedule) => courseIds.has(Number(schedule.course_id)))

      const timeslotMap = new Map<number, TimeslotRecord>()
      for (const slot of timeslots) timeslotMap.set(slot.id, slot)
      const roomMap = new Map<number, RoomRecord>()
      for (const room of rooms) roomMap.set(room.id, room)
      const subjectLookup = new Map<number, SubjectRecord>()
      for (const subject of subjectsData) subjectLookup.set(subject.id, subject)

      const entries: StudentScheduleEntry[] = []
      for (const schedule of studentSchedules) {
        const timeslot = timeslotMap.get(schedule.timeslot_id)
        if (!timeslot) continue
        const courseId = Number(schedule.course_id)
        const course = studentCourses.find((item) => item.id === courseId)
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

      setStudent(studentData)
      setUser(userData)
      setProgram(programData)
      setEnrollments(studentEnrollments)
      setCourses(studentCourses)
      setSubjects(subjectsData)
      setScheduleEntries(entries)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo cargar la información del estudiante'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [studentIdNumber])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleBack = useCallback(() => {
    navigate('/dashboard/admin?section=students')
  }, [navigate])

  const studentName = useMemo(() => {
    if (user?.full_name) return user.full_name
    if (student) return `Estudiante ${student.id}`
    return 'Estudiante'
  }, [student, user])

  const statusKey = student?.status ? String(student.status).toLowerCase() : 'active'
  const statusLabel = STUDENT_STATUS_LABELS[statusKey] ?? statusKey
  const statusColor = STUDENT_STATUS_COLORS[statusKey] ?? 'gray'
  const shiftLabel = student?.study_shift ? SHIFT_LABELS[student.study_shift] ?? student.study_shift : null
  const admissionLabel = student?.admission_type ? ADMISSION_LABELS[student.admission_type] ?? student.admission_type : null
  const financingLabel = student?.financing_type ? FINANCING_LABELS[student.financing_type] ?? student.financing_type : null
  const modalityLabel = student?.modality ? MODALITY_LABELS[student.modality] ?? student.modality : null

  const metrics = useMemo(() => ([
    {
      label: 'Cursos enrolados',
      value: enrollments.length,
      hint: 'Matrículas vigentes en el sistema',
      icon: IconBook2,
    },
    {
      label: 'Bloques planificados',
      value: scheduleEntries.length,
      hint: 'Sesiones asignadas en el horario',
      icon: IconClockHour4,
    },
    {
      label: 'Año de ingreso',
      value: student?.enrollment_year ?? '—',
      hint: `Cohorte ${student?.cohort_year ?? 'sin definir'}`,
      icon: IconCalendarEvent,
    },
  ]), [enrollments.length, scheduleEntries.length, student?.cohort_year, student?.enrollment_year])

  const campusList = useMemo(() => {
    const set = new Set<string>()
    for (const entry of scheduleEntries) {
      if (entry.campus) set.add(entry.campus)
    }
    return Array.from(set)
  }, [scheduleEntries])

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

  const scheduleGridEntries = useMemo(
    () =>
      scheduleEntries.map((entry) => {
        const subtitleParts = [
          entry.term ?? 'Periodo sin definir',
          entry.group ? `Grupo ${entry.group}` : null,
          entry.subjectCode ? `Código ${entry.subjectCode}` : null,
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

  if (loading) {
    return (
      <DashboardLayout title="Cargando estudiante" subtitle="">
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

  if (!student) {
    return (
      <DashboardLayout title="Estudiante no encontrado" subtitle="" actions={actions}>
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          No se encontró el estudiante solicitado. Regresa al panel y selecciona otro registro.
        </Alert>
      </DashboardLayout>
    )
  }

  const programBadges = (
    <Group gap="xs" wrap="wrap">
      {program?.code ? <Badge color="dark" variant="light">Código {program.code}</Badge> : null}
      {program?.name ? <Badge color="indigo" variant="light">{program.name}</Badge> : null}
      {program?.level ? <Badge color="gray" variant="outline">Nivel {program.level}</Badge> : null}
      {typeof program?.duration_semesters === 'number' ? (
        <Badge color="gray" variant="light">Duración {program.duration_semesters} semestres</Badge>
      ) : null}
      <Badge color={program?.is_active ? 'teal' : 'gray'} variant="outline">
        {program?.is_active ? 'Programa activo' : 'Programa inactivo'}
      </Badge>
    </Group>
  )

  return (
    <DashboardLayout
      title={`Estudiante: ${studentName}`}
      subtitle="Perfil académico y trayectoria en la institución"
      actions={actions}
    >
      <Stack gap="xl">
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={6}>
                <Group gap="xs" wrap="wrap">
                  <Badge color={statusColor} variant="light">{statusLabel}</Badge>
                  {shiftLabel ? <Badge color="indigo" variant="light">Jornada {shiftLabel}</Badge> : null}
                  {modalityLabel ? <Badge color="blue" variant="outline">Modalidad {modalityLabel}</Badge> : null}
                </Group>
                <Title order={3}>{studentName}</Title>
                <Stack gap={4}>
                  <Text size="sm" c="dimmed">Matrícula: {student.registration_number ?? 'Sin asignar'}</Text>
                  <Text size="sm" c="dimmed">Programa principal</Text>
                  {programBadges}
                </Stack>
              </Stack>
              <Stack gap={12} align="flex-end">
                {student.current_term ? (
                  <Badge color="dark" variant="light">Semestre actual {student.current_term}</Badge>
                ) : null}
                {student.expected_graduation_date ? (
                  <Badge color="violet" variant="light">
                    Egreso estimado {formatDate(student.expected_graduation_date, 'Sin fecha')}
                  </Badge>
                ) : null}
              </Stack>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconUsersGroup size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Correo institucional</Text>
                    <Text>{user?.email ?? 'Sin correo registrado'}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconCalendarStats size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Ingreso</Text>
                    <Text>
                      {student.enrollment_year}
                      {student.cohort_year ? ` · Cohorte ${student.cohort_year}` : ''}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconSchool size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Financiamiento</Text>
                    <Text>{financingLabel ?? 'No informado'}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconCalendarEvent size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Admisión</Text>
                    <Text>{admissionLabel ?? 'Proceso estándar'}</Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconCalendarStats size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Sección y nivel</Text>
                    <Text>
                      {student.section ? `Sección ${student.section}` : 'Sección sin asignar'}
                      {student.grade_level ? ` · ${student.grade_level}` : ''}
                    </Text>
                  </Stack>
                </Group>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Group gap="sm">
                  <IconUsersGroup size={18} color="var(--mantine-color-gray-6)" />
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Campus frecuentes</Text>
                    <Text>{campusList.length > 0 ? campusList.join(', ') : 'Sin registros'}</Text>
                  </Stack>
                </Group>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Panorama académico</Text>
                <Title order={4}>Indicadores clave del estudiante</Title>
              </div>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              {metrics.map((metric) => (
                <Paper key={metric.label} withBorder radius="md" p="md">
                  <Group gap="md">
                    <metric.icon size={18} color="var(--mantine-color-indigo-6)" />
                    <Stack gap={2}>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{metric.label}</Text>
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
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Horario semanal</Text>
                <Title order={4}>Bloques académicos asignados</Title>
              </div>
              <Badge color="indigo" variant="light">
                {scheduleEntries.length} bloque{scheduleEntries.length === 1 ? '' : 's'}
              </Badge>
            </Group>
            {scheduleEntries.length === 0 ? (
              <Alert color="blue" variant="light" icon={<IconAlertTriangle size={16} />}>
                Este estudiante aún no tiene bloques asignados en su horario.
              </Alert>
            ) : (
              <WeeklyScheduleGrid
                entries={scheduleGridEntries}
                emptyDayLabel="Sin clases asignadas"
                emptyStateLabel="Este estudiante no tiene bloques asignados en la semana"
              />
            )}
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Historial de matrículas</Text>
                <Title order={4}>Cursos inscritos</Title>
              </div>
              <Badge color="dark" variant="light">
                {enrollments.length} curso{enrollments.length === 1 ? '' : 's'}
              </Badge>
            </Group>
            {enrollments.length === 0 ? (
              <Alert color="gray" variant="light" icon={<IconAlertTriangle size={16} />}>
                No se encontraron matrículas para este estudiante.
              </Alert>
            ) : (
              <ScrollArea.Autosize mah="50vh" offsetScrollbars>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: '40%' }}>Asignatura</Table.Th>
                      <Table.Th style={{ width: '18%' }}>Periodo</Table.Th>
                      <Table.Th style={{ width: '18%' }}>Estado</Table.Th>
                      <Table.Th style={{ width: '12%' }}>Nota final</Table.Th>
                      <Table.Th style={{ width: '12%' }}>Inscrito en</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {enrollments.map((enrollment) => {
                      const course = courseMap.get(enrollment.course_id)
                      const subject = course ? subjectMap.get(course.subject_id) : undefined
                      const statusKey = String(enrollment.status)
                      const statusLabel = ENROLLMENT_STATUS_LABELS[statusKey] ?? statusKey
                      const statusColor = ENROLLMENT_STATUS_COLORS[statusKey] ?? 'gray'
                      return (
                        <Table.Tr key={enrollment.id}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={600}>{subject?.name ?? subject?.code ?? `Curso ${enrollment.course_id}`}</Text>
                              {subject?.code ? <Text size="xs" c="dimmed">Código {subject.code}</Text> : null}
                            </Stack>
                          </Table.Td>
                          <Table.Td>{course?.term ?? 'Sin periodo'}</Table.Td>
                          <Table.Td>
                            <Badge color={statusColor} variant="light">{statusLabel}</Badge>
                          </Table.Td>
                          <Table.Td>{enrollment.final_grade ?? '—'}</Table.Td>
                          <Table.Td>{formatDate(enrollment.enrolled_at, 'Sin fecha')}</Table.Td>
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
