import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import {
  IconCalendarCog,
  IconCalendarPlus,
  IconDeviceFloppy,
  IconRefresh,
  IconRun,
  IconUsersGroup,
} from '@tabler/icons-react'
import { api } from '../../lib/api'
import ScheduleTimeline, { ScheduleEntry } from './ScheduleTimeline'

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function timeLabel(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 5)
}

type Course = {
  id: number
  subject_id: number
  teacher_id: number | null
  term: string
  group: string | null
  weekly_hours: number
}

type Room = {
  id: number
  code: string
  capacity: number
}

type Timeslot = {
  id: number
  day_of_week: number
  start_time: string
  end_time: string
}

type Teacher = {
  id: number
  user_id: number
}

type Student = {
  id: number
  user_id: number
}

type Enrollment = {
  id: number
  student_id: number
  course_id: number
}

type Program = {
  id: number
  code: string
  name: string
}

type ProgramSemester = {
  id: number
  program_id: number
  semester_number: number
  label?: string | null
  is_active?: boolean
}

type Subject = {
  id: number
  name: string
}

type User = {
  id: number
  full_name: string
}

type Assignment = {
  course_id: number
  room_id: number
  timeslot_id: number
}

type OptimizerResponse = {
  assignments: [number, number, number][]
}

export default function SchedulePlanner() {
  const [loading, setLoading] = useState(false)
  const [optimizerLoading, setOptimizerLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [courses, setCourses] = useState<Course[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [timeslots, setTimeslots] = useState<Timeslot[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [programSemesters, setProgramSemesters] = useState<ProgramSemester[]>([])
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null)
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null)
  const [courseStudentMap, setCourseStudentMap] = useState<Record<number, number[]>>({})
  const [optimizerAssignments, setOptimizerAssignments] = useState<Assignment[]>([])
  const [optimizerPreview, setOptimizerPreview] = useState<ScheduleEntry[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])

  const [requireBreaks, setRequireBreaks] = useState(true)
  const [maxConsecutiveBlocks, setMaxConsecutiveBlocks] = useState(3)

  const [manualCourse, setManualCourse] = useState<string | null>(null)
  const [manualRoom, setManualRoom] = useState<string | null>(null)
  const [manualTimeslot, setManualTimeslot] = useState<string | null>(null)

  const [selectedCourseForStudents, setSelectedCourseForStudents] = useState<string | null>(null)
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users])
  const subjectMap = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects])
  const roomMap = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const timeslotMap = useMemo(() => new Map(timeslots.map((slot) => [slot.id, slot])), [timeslots])
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])

  useEffect(() => {
    if (selectedCourseForStudents) {
      const courseId = Number(selectedCourseForStudents)
      const enrolled = courseStudentMap[courseId] ?? []
      setSelectedStudents(enrolled.map((id) => String(id)))
    } else {
      setSelectedStudents([])
    }
  }, [selectedCourseForStudents, courseStudentMap])

  const loadCatalogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [programsRes, semestersRes, roomsRes, timeslotsRes, teachersRes, studentsRes, subjectsRes, usersRes] = await Promise.all([
        api.get('/programs/'),
        api.get('/program-semesters/'),
        api.get('/rooms/'),
        api.get('/timeslots/'),
        api.get('/teachers/'),
        api.get('/students/'),
        api.get('/subjects/'),
        api.get('/users/'),
      ])
      setPrograms(programsRes.data as Program[])
      setProgramSemesters(semestersRes.data as ProgramSemester[])
      setRooms(roomsRes.data as Room[])
      setTimeslots(timeslotsRes.data as Timeslot[])
      setTeachers(teachersRes.data as Teacher[])
      setStudents(studentsRes.data as Student[])
      setSubjects(subjectsRes.data as Subject[])
      setUsers(usersRes.data as User[])
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo cargar catálogos base'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSemesterData = useCallback(async (semesterId: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = { params: { program_semester_id: semesterId } }
      const [coursesRes, scheduleRes, enrollmentsRes] = await Promise.all([
        api.get('/courses/', params),
        api.get('/schedule/overview', params),
        api.get('/enrollments/'),
      ])
      const coursesData = coursesRes.data as Course[]
      const scheduleData = scheduleRes.data as ScheduleEntry[]
      const enrollmentsData = enrollmentsRes.data as Enrollment[]

      const relevantCourseIds = new Set(coursesData.map((course) => course.id))
      const map: Record<number, number[]> = {}
      for (const enrollment of enrollmentsData) {
        if (!relevantCourseIds.has(enrollment.course_id)) continue
        if (!map[enrollment.course_id]) {
          map[enrollment.course_id] = []
        }
        map[enrollment.course_id].push(enrollment.student_id)
      }

      setCourses(coursesData)
      setSchedule(scheduleData)
      setCourseStudentMap(map)
      setOptimizerAssignments([])
      setOptimizerPreview([])
      setManualCourse(null)
      setManualRoom(null)
      setManualTimeslot(null)
      if (selectedCourseForStudents && !relevantCourseIds.has(Number(selectedCourseForStudents))) {
        setSelectedCourseForStudents(null)
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo cargar la información del semestre'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [selectedCourseForStudents])

  useEffect(() => {
    void loadCatalogs()
  }, [loadCatalogs])

  useEffect(() => {
    if (!selectedProgram && programs.length > 0) {
      setSelectedProgram(String(programs[0].id))
    }
  }, [programs, selectedProgram])

  useEffect(() => {
    const available = programSemesters.filter((semester) =>
      selectedProgram ? semester.program_id === Number(selectedProgram) : true
    )
    if (available.length === 0) {
      if (selectedSemester !== null) {
        setSelectedSemester(null)
      }
      return
    }
    if (!selectedSemester || !available.some((semester) => String(semester.id) === selectedSemester)) {
      setSelectedSemester(String(available[0].id))
    }
  }, [programSemesters, selectedProgram, selectedSemester])

  useEffect(() => {
    if (selectedSemester) {
      void loadSemesterData(Number(selectedSemester))
    } else {
      setCourses([])
      setSchedule([])
      setCourseStudentMap({})
    }
  }, [selectedSemester, loadSemesterData])

  const teacherOptions = useMemo(() => teachers.map((teacher) => ({
    value: String(teacher.id),
    label: userMap.get(teacher.user_id) ?? `Profesor #${teacher.id}`,
  })), [teachers, userMap])

  const teacherMap = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers])

  const studentOptions = useMemo(() => students.map((student) => ({
    value: String(student.id),
    label: userMap.get(student.user_id) ?? `Estudiante #${student.id}`,
  })), [students, userMap])

  const courseOptions = useMemo(() => courses.map((course) => {
    const subjectName = subjectMap.get(course.subject_id) ?? `Curso #${course.id}`
    return {
      value: String(course.id),
      label: `${subjectName} · ${course.term}${course.group ? ` · Grupo ${course.group}` : ''}`,
    }
  }), [courses, subjectMap])

  const timeslotOptions = useMemo(() => timeslots.map((slot) => ({
    value: String(slot.id),
    label: `${DAY_LABELS[slot.day_of_week] || 'Día'} · ${timeLabel(slot.start_time)}-${timeLabel(slot.end_time)}`,
  })), [timeslots])

  const roomOptions = useMemo(() => rooms.map((room) => ({
    value: String(room.id),
    label: `${room.code} (${room.capacity} personas)`
  })), [rooms])

  const buildTimeslotBlocks = useCallback(() => {
    const dayBuckets = new Map<number, Timeslot[]>()
    for (const slot of timeslots) {
      const bucket = dayBuckets.get(slot.day_of_week) ?? []
      bucket.push(slot)
      dayBuckets.set(slot.day_of_week, bucket)
    }
    const result: { timeslot_id: number; day: number; block: number }[] = []
    for (const [day, bucket] of dayBuckets.entries()) {
      const ordered = bucket.sort((a, b) => a.start_time.localeCompare(b.start_time))
      ordered.forEach((slot, index) => {
        result.push({ timeslot_id: slot.id, day, block: index })
      })
    }
    return result
  }, [timeslots])

  const runOptimizer = useCallback(async () => {
    if (!selectedSemester) {
      setError('Selecciona un programa y semestre antes de optimizar')
      return
    }
    setOptimizerLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const coursesPayload = courses.map((course) => ({
        course_id: course.id,
        teacher_id: course.teacher_id ?? -course.id,
        weekly_hours: Math.max(course.weekly_hours ?? 1, 1),
      }))

      const roomsPayload = rooms.map((room) => ({ room_id: room.id, capacity: room.capacity }))
      const timeslotPayload = buildTimeslotBlocks()

      const allTimeslotIds = timeslots.map((slot) => slot.id)
      const availability: Record<number, number[]> = {}
      for (const course of courses) {
        if (!course.teacher_id) continue
        if (!availability[course.teacher_id]) {
          availability[course.teacher_id] = [...allTimeslotIds]
        }
      }

      const payload = {
        courses: coursesPayload,
        rooms: roomsPayload,
        timeslots: timeslotPayload,
        constraints: {
          teacher_availability: availability,
          max_consecutive_blocks: maxConsecutiveBlocks,
          min_gap_blocks: requireBreaks ? 1 : 0,
        },
      }

      const { data } = await api.post<OptimizerResponse>('/schedule/optimize', payload)
      const parsedAssignments: Assignment[] = data.assignments.map(([course_id, room_id, timeslot_id]) => ({
        course_id,
        room_id,
        timeslot_id,
      }))
      const preview: ScheduleEntry[] = parsedAssignments.map((assignment) => {
        const course = courseMap.get(assignment.course_id)
        const timeslot = timeslotMap.get(assignment.timeslot_id)
        const room = roomMap.get(assignment.room_id)
        const subjectName = course ? subjectMap.get(course.subject_id) : undefined
        const teacherName = course?.teacher_id ? userMap.get(teacherMap.get(course.teacher_id)?.user_id ?? 0) : null
        return {
          course_id: assignment.course_id,
          course_name: subjectName ? `${subjectName}${course?.group ? ` · Grupo ${course.group}` : ''}` : `Curso #${assignment.course_id}`,
          subject_name: subjectName,
          room_code: room?.code,
          day_of_week: timeslot?.day_of_week,
          start_time: timeslot ? timeLabel(timeslot.start_time) : undefined,
          end_time: timeslot ? timeLabel(timeslot.end_time) : undefined,
          teacher_name: teacherName ?? undefined,
        }
      })
      setOptimizerAssignments(parsedAssignments)
      setOptimizerPreview(preview)
      setSuccess(`Optimización generó ${parsedAssignments.length} bloques sugeridos.`)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo optimizar el horario'
      setError(detail)
    } finally {
      setOptimizerLoading(false)
    }
  }, [selectedSemester, courses, rooms, timeslots, maxConsecutiveBlocks, requireBreaks, buildTimeslotBlocks, courseMap, timeslotMap, roomMap, subjectMap, userMap, teacherMap])

  const handleApplyOptimized = useCallback(async () => {
    if (optimizerAssignments.length === 0) return
    if (!selectedSemester) {
      setError('Selecciona un programa y semestre para actualizar el horario')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = { assignments: optimizerAssignments, replace_existing: true }
      await api.post<ScheduleEntry[]>('/schedule/assignments/save', payload)
      await loadSemesterData(Number(selectedSemester))
      setOptimizerAssignments([])
      setOptimizerPreview([])
      setSuccess('Horario aplicado correctamente')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo guardar el horario sugerido'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [optimizerAssignments, selectedSemester, loadSemesterData])

  const handleTeacherChange = useCallback(async (courseId: number, teacherId: string | null) => {
    if (!teacherId) return
    if (!selectedSemester) {
      setError('Selecciona un semestre para actualizar asignaciones')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post('/schedule/assignments/teacher', {
        course_id: courseId,
        teacher_id: Number(teacherId),
      })
      await loadSemesterData(Number(selectedSemester))
      setSuccess('Profesor asignado correctamente')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo asignar el profesor'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [selectedSemester, loadSemesterData])

  const handleStudentSave = useCallback(async () => {
    if (!selectedCourseForStudents) return
    if (!selectedSemester) {
      setError('Selecciona un semestre para actualizar la matrícula del curso')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post('/schedule/assignments/students', {
        course_id: Number(selectedCourseForStudents),
        student_ids: selectedStudents.map((value) => Number(value)),
        replace_existing: true,
      })
      await loadSemesterData(Number(selectedSemester))
      setSuccess('Estudiantes actualizados para el curso seleccionado')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo actualizar la asignación de estudiantes'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [selectedCourseForStudents, selectedStudents, selectedSemester, loadSemesterData])

  const handleManualAdd = useCallback(async () => {
    if (!manualCourse || !manualRoom || !manualTimeslot) return
    if (!selectedSemester) {
      setError('Selecciona un semestre para agregar bloques manuales')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post('/schedule/assignments/save', {
        assignments: [{
          course_id: Number(manualCourse),
          room_id: Number(manualRoom),
          timeslot_id: Number(manualTimeslot),
        }],
        replace_existing: false,
      })
      setManualCourse(null)
      setManualRoom(null)
      setManualTimeslot(null)
      await loadSemesterData(Number(selectedSemester))
      setSuccess('Bloque agregado al horario')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo crear el bloque manualmente'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [manualCourse, manualRoom, manualTimeslot, selectedSemester, loadSemesterData])

  return (
    <Stack gap="xl">
      <Card withBorder radius="lg" padding="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">Optimizador inteligente</Text>
              <Title order={3}>Generador de horario académico</Title>
              <Text size="sm" c="dimmed">Configura las reglas, ejecuta el optimizador y aplica la propuesta en un clic.</Text>
            </div>
            <ActionIcon
              variant="light"
              color="indigo"
              onClick={() => {
                if (selectedSemester) {
                  void loadSemesterData(Number(selectedSemester))
                } else {
                  void loadCatalogs()
                }
              }}
              aria-label="Actualizar"
              disabled={loading}
            >
              {loading ? <Loader size="sm" /> : <IconRefresh size={18} />}
            </ActionIcon>
          </Group>
          {error && (
            <Alert color="red" variant="light" title="Error">
              {error}
            </Alert>
          )}
          {success && (
            <Alert color="teal" variant="outline" title="Listo">
              {success}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
            <NumberInput
              label="Máximo de bloques consecutivos"
              value={maxConsecutiveBlocks}
              min={1}
              max={6}
              onChange={(value) => setMaxConsecutiveBlocks(Number(value) || 1)}
            />
            <Checkbox
              label="Requerir ventana entre clases del mismo docente"
              checked={requireBreaks}
              onChange={(event) => setRequireBreaks(event.currentTarget.checked)}
            />
            <Badge color="dark" variant="light" size="lg" radius="md" leftSection={<IconCalendarCog size={16} />}>
              {courses.length} cursos en planificación
            </Badge>
            <Badge color="grape" variant="light" size="lg" radius="md" leftSection={<IconUsersGroup size={16} />}>
              {students.length} estudiantes matriculados
            </Badge>
          </SimpleGrid>
          <Group gap="sm">
            <Button leftSection={<IconRun size={18} />} loading={optimizerLoading} onClick={() => runOptimizer()}>
              Optimizar horario
            </Button>
            {optimizerAssignments.length > 0 && (
              <Button
                color="teal"
                leftSection={<IconDeviceFloppy size={18} />}
                loading={saving}
                onClick={handleApplyOptimized}
              >
                Aplicar propuesta
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      {optimizerPreview.length > 0 && (
        <Card withBorder radius="lg" padding="xl">
          <ScheduleTimeline entries={optimizerPreview} title="Propuesta optimizada" />
        </Card>
      )}

      <Card withBorder radius="lg" padding="xl">
        {loading ? (
          <Stack align="center" gap="sm">
            <Loader color="indigo" />
            <Text c="dimmed">Cargando horario...</Text>
          </Stack>
        ) : (
          <ScheduleTimeline entries={schedule} title="Horario oficial" />
        )}
      </Card>

      <Card withBorder radius="lg" padding="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <Title order={4}>Gestión de profesores por curso</Title>
            <Badge color="teal" variant="light">{courses.length} cursos</Badge>
          </Group>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Curso</Table.Th>
                <Table.Th>Período</Table.Th>
                <Table.Th>Profesor asignado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {courses.map((course) => {
                const subjectName = subjectMap.get(course.subject_id) ?? `Curso #${course.id}`
                const teacher = course.teacher_id ? teacherMap.get(course.teacher_id) : undefined
                const currentTeacherName = teacher ? userMap.get(teacher.user_id) : 'Sin asignar'
                return (
                  <Table.Tr key={course.id}>
                    <Table.Td>
                      <Stack gap={0}>
                        <Text fw={600}>{subjectName}</Text>
                        <Text size="xs" c="dimmed">Grupo {course.group ?? 'A'}</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{course.term}</Table.Td>
                    <Table.Td>
                      <Select
                        value={course.teacher_id ? String(course.teacher_id) : undefined}
                        data={teacherOptions}
                        placeholder={currentTeacherName}
                        onChange={(value) => value && handleTeacherChange(course.id, value)}
                      />
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      <Card withBorder radius="lg" padding="xl">
        <Stack gap="lg">
          <Title order={4}>Asignación de estudiantes a cursos</Title>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Select
              label="Curso"
              data={courseOptions}
              value={selectedCourseForStudents}
              onChange={setSelectedCourseForStudents}
              placeholder="Selecciona un curso"
            />
            <MultiSelect
              label="Estudiantes"
              data={studentOptions}
              value={selectedStudents}
              onChange={setSelectedStudents}
              searchable
              disabled={!selectedCourseForStudents}
              placeholder={selectedCourseForStudents ? 'Selecciona estudiantes' : 'Elige un curso primero'}
            />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button
              leftSection={<IconDeviceFloppy size={18} />}
              disabled={!selectedCourseForStudents}
              loading={saving}
              onClick={handleStudentSave}
            >
              Guardar asignación
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="lg" padding="xl">
        <Stack gap="lg">
          <Title order={4}>Agregar bloque manual</Title>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            <Select
              label="Curso"
              data={courseOptions}
              value={manualCourse}
              onChange={setManualCourse}
              placeholder="Curso"
            />
            <Select
              label="Sala"
              data={roomOptions}
              value={manualRoom}
              onChange={setManualRoom}
              placeholder="Sala"
            />
            <Select
              label="Bloque horario"
              data={timeslotOptions}
              value={manualTimeslot}
              onChange={setManualTimeslot}
              placeholder="Bloque"
            />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button leftSection={<IconCalendarPlus size={18} />} loading={saving} onClick={handleManualAdd}>
              Agregar al horario
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  )
}
