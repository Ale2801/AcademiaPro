import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core'
import {
  IconCalendarCog,
  IconDeviceFloppy,
  IconRefresh,
  IconRun,
  IconUsersGroup,
} from '@tabler/icons-react'
import { api } from '../../lib/api'
import ScheduleTimeline, { ScheduleEntry } from './ScheduleTimeline'
import ScheduleDesigner from './ScheduleDesigner'

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

type PlannerDialog =
  | { type: 'create'; courseId: number; timeslotId: number }
  | { type: 'edit'; assignment: ScheduleEntry; targetTimeslotId?: number }

function timeStringToMinutes(value?: string | null): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length < 2) return null
  const [hoursStr, minutesStr, secondsStr] = parts
  const hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  const seconds = secondsStr != null ? Number(secondsStr) : 0
  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) return null
  return hours * 60 + minutes + seconds / 60
}

function durationInHours(start?: string | null, end?: string | null): number {
  const startMinutes = timeStringToMinutes(start)
  const endMinutes = timeStringToMinutes(end)
  if (startMinutes == null || endMinutes == null) return 0
  const diff = endMinutes - startMinutes
  if (diff <= 0) return 0
  return diff / 60
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

  const [selectedCourseForStudents, setSelectedCourseForStudents] = useState<string | null>(null)
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])

  const [dialog, setDialog] = useState<PlannerDialog | null>(null)
  const [dialogRoom, setDialogRoom] = useState<string | null>(null)
  const [dialogTimeslot, setDialogTimeslot] = useState<string | null>(null)

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users])
  const subjectMap = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects])
  const roomMap = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const timeslotMap = useMemo(() => new Map(timeslots.map((slot) => [slot.id, slot])), [timeslots])
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])
  const teacherMap = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers])
  const programMap = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs])
  const semesterMap = useMemo(() => new Map(programSemesters.map((semester) => [semester.id, semester])), [programSemesters])

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
      selectedProgram ? semester.program_id === Number(selectedProgram) : true,
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

  const teacherOptions = useMemo(
    () =>
      teachers.map((teacher) => ({
        value: String(teacher.id),
        label: userMap.get(teacher.user_id) ?? `Profesor #${teacher.id}`,
      })),
    [teachers, userMap],
  )

  const studentOptions = useMemo(
    () =>
      students.map((student) => ({
        value: String(student.id),
        label: userMap.get(student.user_id) ?? `Estudiante #${student.id}`,
      })),
    [students, userMap],
  )

  const courseOptions = useMemo(
    () =>
      courses.map((course) => {
        const subjectName = subjectMap.get(course.subject_id) ?? `Curso #${course.id}`
        return {
          value: String(course.id),
          label: `${subjectName} · ${course.term}${course.group ? ` · Grupo ${course.group}` : ''}`,
        }
      }),
    [courses, subjectMap],
  )

  const timeslotOptions = useMemo(
    () =>
      timeslots
        .slice()
        .sort((a, b) =>
          a.day_of_week === b.day_of_week
            ? a.start_time.localeCompare(b.start_time)
            : a.day_of_week - b.day_of_week,
        )
        .map((slot) => ({
          value: String(slot.id),
          label: `${DAY_LABELS[slot.day_of_week] || 'Día'} · ${timeLabel(slot.start_time)}-${timeLabel(slot.end_time)}`,
        })),
    [timeslots],
  )

  const roomOptions = useMemo(
    () =>
      rooms.map((room) => ({
        value: String(room.id),
        label: `${room.code} (${room.capacity} personas)`,
      })),
    [rooms],
  )

  const timeslotDurationMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const slot of timeslots) {
      map.set(slot.id, Math.max(durationInHours(slot.start_time, slot.end_time), 0))
    }
    return map
  }, [timeslots])

  const assignmentHours = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of schedule) {
      let hours = entry.timeslot_id != null ? timeslotDurationMap.get(entry.timeslot_id) ?? 0 : 0
      if ((hours == null || hours <= 0) && (entry.start_time || entry.end_time)) {
        hours = durationInHours(entry.start_time ?? null, entry.end_time ?? null)
      }
      if (hours == null || hours <= 0) continue
      map.set(entry.course_id, (map.get(entry.course_id) ?? 0) + hours)
    }
    return map
  }, [schedule, timeslotDurationMap])

  const assignmentMap = useMemo(() => {
    const map = new Map<number, ScheduleEntry>()
    for (const entry of schedule) {
      if (entry.id != null) {
        map.set(entry.id, entry)
      }
    }
    return map
  }, [schedule])

  const courseSummaries = useMemo(() => {
    return courses.map((course) => {
      const subjectName = subjectMap.get(course.subject_id) ?? `Curso #${course.id}`
      const teacher = course.teacher_id ? teacherMap.get(course.teacher_id) : undefined
      const teacherName = teacher ? userMap.get(teacher.user_id) : undefined
      const parts = [subjectName]
      if (course.group) parts.push(`Grupo ${course.group}`)
      const label = parts.join(' · ')
  const rawWeekly = typeof course.weekly_hours === 'number' ? course.weekly_hours : Number(course.weekly_hours ?? 0)
  const weeklyHours = Number.isFinite(rawWeekly) ? Math.max(rawWeekly, 0) : 0
      return {
        id: course.id,
        label,
        subjectName,
        teacherName,
        weeklyHours,
        assignedHours: assignmentHours.get(course.id) ?? 0,
      }
    })
  }, [courses, subjectMap, teacherMap, userMap, assignmentHours])

  const buildTimeslotBlocks = useCallback(() => {
    const dayBuckets = new Map<number, Timeslot[]>()
    for (const slot of timeslots) {
      const bucket = dayBuckets.get(slot.day_of_week) ?? []
      bucket.push(slot)
      dayBuckets.set(slot.day_of_week, bucket)
    }
    const result: { timeslot_id: number; day: number; block: number }[] = []
    for (const [day, bucket] of dayBuckets.entries()) {
      const ordered = bucket.slice().sort((a, b) => a.start_time.localeCompare(b.start_time))
      ordered.forEach((slot, index) => {
        result.push({ timeslot_id: slot.id, day, block: index })
      })
    }
    return result
  }, [timeslots])

  const timeslotColumns = useMemo(() => {
    const buckets = new Map<number, Timeslot[]>()
    for (const slot of timeslots) {
      const bucket = buckets.get(slot.day_of_week) ?? []
      bucket.push(slot)
      buckets.set(slot.day_of_week, bucket)
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, slots]) => ({
        day,
        label: DAY_LABELS[day] ?? 'Sin día',
        slots: slots
          .slice()
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
          .map((slot) => ({
            id: slot.id,
            start: timeLabel(slot.start_time),
            end: timeLabel(slot.end_time),
          })),
      }))
  }, [timeslots])

  const assignmentsByTimeslot = useMemo(() => {
    const map = new Map<number, ScheduleEntry[]>()
    for (const entry of schedule) {
      const key = entry.timeslot_id ?? -1
      const bucket = map.get(key) ?? []
      bucket.push(entry)
      map.set(key, bucket)
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.room_code ?? '').localeCompare(b.room_code ?? ''))
    }
    return map
  }, [schedule])

  const programOptions = useMemo(
    () =>
      programs.map((program) => ({
        value: String(program.id),
        label: `${program.code} · ${program.name}`,
      })),
    [programs],
  )

  const semesterOptions = useMemo(() => {
    const targetProgram = selectedProgram ? Number(selectedProgram) : null
    return programSemesters
      .filter((semester) => (targetProgram ? semester.program_id === targetProgram : true))
      .map((semester) => {
        const program = programMap.get(semester.program_id)
        const baseLabel = semester.label || `Semestre ${semester.semester_number}`
        const label = program ? `${program.name} · ${baseLabel}` : baseLabel
        return {
          value: String(semester.id),
          label,
        }
      })
  }, [programSemesters, programMap, selectedProgram])

  const selectedSemesterInfo = useMemo(() => {
    if (!selectedSemester) return null
    return semesterMap.get(Number(selectedSemester)) ?? null
  }, [selectedSemester, semesterMap])

  const selectedProgramInfo = useMemo(() => {
    if (!selectedSemesterInfo) return null
    return programMap.get(selectedSemesterInfo.program_id) ?? null
  }, [selectedSemesterInfo, programMap])

  useEffect(() => {
    if (!dialog) {
      setDialogRoom(null)
      setDialogTimeslot(null)
      return
    }
    if (dialog.type === 'create') {
      const existing = schedule.find((entry) => entry.course_id === dialog.courseId && entry.room_id)
      const defaultRoom = existing?.room_id ? String(existing.room_id) : roomOptions[0]?.value ?? null
      setDialogRoom(defaultRoom)
      setDialogTimeslot(String(dialog.timeslotId))
    } else {
      const defaultRoom = dialog.assignment.room_id ? String(dialog.assignment.room_id) : roomOptions[0]?.value ?? null
      const targetTimeslot = dialog.targetTimeslotId ?? dialog.assignment.timeslot_id
      setDialogRoom(defaultRoom)
      setDialogTimeslot(targetTimeslot != null ? String(targetTimeslot) : null)
    }
  }, [dialog, roomOptions, schedule])

  const courseLookup = useMemo(() => {
    const map = new Map<number, { label: string; term?: string }>()
    for (const summary of courseSummaries) {
      const base = courses.find((course) => course.id === summary.id)
      map.set(summary.id, { label: summary.label, term: base?.term })
    }
    return map
  }, [courseSummaries, courses])

  const dialogCourseLabel = useMemo(() => {
    if (!dialog) return ''
    if (dialog.type === 'create') {
      return courseLookup.get(dialog.courseId)?.label ?? `Curso #${dialog.courseId}`
    }
    return courseLookup.get(dialog.assignment.course_id)?.label ?? `Curso #${dialog.assignment.course_id}`
  }, [dialog, courseLookup])

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
          course_name: subjectName
            ? `${subjectName}${course?.group ? ` · Grupo ${course.group}` : ''}`
            : `Curso #${assignment.course_id}`,
          subject_name: subjectName,
          room_id: assignment.room_id,
          room_code: room?.code,
          timeslot_id: assignment.timeslot_id,
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
  }, [selectedSemester, courses, rooms, buildTimeslotBlocks, maxConsecutiveBlocks, requireBreaks, courseMap, timeslotMap, roomMap, subjectMap, userMap, teacherMap])

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

  const handleTeacherChange = useCallback(
    async (courseId: number, teacherId: string | null) => {
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
    },
    [selectedSemester, loadSemesterData],
  )

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

  const handleCourseDrop = useCallback((courseId: number, timeslotId: number) => {
    setDialog({ type: 'create', courseId, timeslotId })
  }, [])

  const handleAssignmentDrop = useCallback(
    async (assignmentId: number, timeslotId: number) => {
      const assignment = assignmentMap.get(assignmentId)
      if (!assignment) return
      if (assignment.timeslot_id === timeslotId) return
      if (!assignment.room_id) {
        setDialog({ type: 'edit', assignment, targetTimeslotId: timeslotId })
        return
      }
      setSaving(true)
      setError(null)
      try {
        await api.put(`/course-schedules/${assignmentId}`, {
          course_id: assignment.course_id,
          room_id: assignment.room_id,
          timeslot_id: timeslotId,
        })
        if (selectedSemester) {
          await loadSemesterData(Number(selectedSemester))
        } else if (assignment.program_semester_id) {
          await loadSemesterData(assignment.program_semester_id)
        }
        setSuccess('Bloque reubicado correctamente')
      } catch (e: any) {
        const detail = e?.response?.data?.detail || e?.message || 'No se pudo actualizar el bloque'
        setError(detail)
      } finally {
        setSaving(false)
      }
    },
    [assignmentMap, loadSemesterData, selectedSemester],
  )

  const handleAssignmentEdit = useCallback((assignment: ScheduleEntry) => {
    setDialog({ type: 'edit', assignment })
  }, [])

  const handleAssignmentDelete = useCallback(
    async (assignment: ScheduleEntry) => {
      if (!assignment.id) return
      if (typeof window !== 'undefined') {
        const confirm = window.confirm('¿Eliminar este bloque del horario?')
        if (!confirm) return
      }
      setSaving(true)
      setError(null)
      try {
        await api.delete(`/course-schedules/${assignment.id}`)
        if (selectedSemester) {
          await loadSemesterData(Number(selectedSemester))
        } else if (assignment.program_semester_id) {
          await loadSemesterData(assignment.program_semester_id)
        }
        setSuccess('Bloque eliminado')
      } catch (e: any) {
        const detail = e?.response?.data?.detail || e?.message || 'No se pudo eliminar el bloque'
        setError(detail)
      } finally {
        setSaving(false)
      }
    },
    [loadSemesterData, selectedSemester],
  )

  const closeDialog = () => setDialog(null)

  const handleDialogSubmit = useCallback(async () => {
    if (!dialog) return
    if (!dialogRoom || !dialogTimeslot) {
      setError('Selecciona sala y bloque horario')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (dialog.type === 'create') {
        await api.post('/course-schedules/', {
          course_id: dialog.courseId,
          room_id: Number(dialogRoom),
          timeslot_id: Number(dialogTimeslot),
        })
        setSuccess('Bloque agregado al horario')
      } else if (dialog.type === 'edit' && dialog.assignment.id != null) {
        await api.put(`/course-schedules/${dialog.assignment.id}`, {
          course_id: dialog.assignment.course_id,
          room_id: Number(dialogRoom),
          timeslot_id: Number(dialogTimeslot),
        })
        setSuccess('Bloque actualizado')
      }
      if (selectedSemester) {
        await loadSemesterData(Number(selectedSemester))
      }
      setDialog(null)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo guardar el bloque'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [dialog, dialogRoom, dialogTimeslot, loadSemesterData, selectedSemester])

  const totalAssignments = schedule.length

  return (
    <Stack gap="xl">
      <Card withBorder radius="lg" padding="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                Planificación académica
              </Text>
              <Title order={3}>Diseña el horario del semestre</Title>
              <Text size="sm" c="dimmed">
                Arrastra cursos a los bloques disponibles, edita o elimina bloques en tiempo real y mantén un horario elegante y responsivo.
              </Text>
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
            <Alert color="red" variant="light" title="Ocurrió un problema">
              {error}
            </Alert>
          )}
          {success && (
            <Alert color="teal" variant="outline" title="Acción completada">
              {success}
            </Alert>
          )}

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Select
              label="Programa académico"
              data={programOptions}
              value={selectedProgram}
              onChange={setSelectedProgram}
              placeholder="Selecciona un programa"
              searchable
              nothingFoundMessage="Sin programas"
            />
            <Select
              label="Semestre"
              data={semesterOptions}
              value={selectedSemester}
              onChange={setSelectedSemester}
              placeholder="Selecciona un semestre"
              searchable
              nothingFoundMessage="Sin semestres"
            />
          </SimpleGrid>

          <Group gap="sm" wrap="wrap">
            <Badge color="dark" variant="light" size="lg" radius="md" leftSection={<IconCalendarCog size={16} />}>
              {courses.length} cursos planificables
            </Badge>
            <Badge color="teal" variant="light" size="lg" radius="md" leftSection={<IconUsersGroup size={16} />}>
              {students.length} estudiantes vinculados
            </Badge>
            <Badge color="blue" variant="light" size="lg">
              {totalAssignments} bloques programados
            </Badge>
          </Group>

          {(selectedProgramInfo || selectedSemesterInfo) && (
            <Text size="sm" c="dimmed">
              {selectedProgramInfo ? `${selectedProgramInfo.name} ` : ''}
              {selectedSemesterInfo ? `· ${selectedSemesterInfo.label || `Semestre ${selectedSemesterInfo.semester_number}`}` : ''}
            </Text>
          )}
        </Stack>
      </Card>

      <Stack gap="md">
        {loading && (
          <Group gap="sm" justify="center">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Actualizando datos del horario...
            </Text>
          </Group>
        )}
        <ScheduleDesigner
          courses={courseSummaries}
          timeslots={timeslotColumns}
          assignmentsByTimeslot={assignmentsByTimeslot}
          onCourseDrop={handleCourseDrop}
          onAssignmentDrop={handleAssignmentDrop}
          onEditAssignment={handleAssignmentEdit}
          onDeleteAssignment={handleAssignmentDelete}
          loading={loading || saving}
        />
      </Stack>

      <Modal
        opened={dialog !== null}
        onClose={closeDialog}
        title={dialog?.type === 'create' ? 'Agregar bloque al horario' : 'Editar bloque'}
        centered
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm" fw={600}>
            {dialogCourseLabel}
          </Text>
          <Select
            label="Sala"
            data={roomOptions}
            value={dialogRoom}
            onChange={setDialogRoom}
            placeholder="Selecciona una sala"
            searchable
            nothingFoundMessage="Sin salas"
          />
          <Select
            label="Bloque horario"
            data={timeslotOptions}
            value={dialogTimeslot}
            onChange={setDialogTimeslot}
            placeholder="Selecciona un bloque"
            searchable
            nothingFoundMessage="Sin bloques"
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button leftSection={<IconDeviceFloppy size={16} />} loading={saving} onClick={handleDialogSubmit}>
              Guardar cambios
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Card withBorder radius="lg" padding="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <div>
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                Asistente inteligente
              </Text>
              <Title order={4}>Optimiza automáticamente tu horario</Title>
            </div>
            <Group gap="sm">
              <NumberInput
                label="Bloques consecutivos máx."
                value={maxConsecutiveBlocks}
                min={1}
                max={6}
                onChange={(value) => setMaxConsecutiveBlocks(Number(value) || 1)}
                maw={160}
              />
              <Switch
                label="Exigir pausas entre clases del mismo docente"
                checked={requireBreaks}
                onChange={(event) => setRequireBreaks(event.currentTarget.checked)}
              />
            </Group>
          </Group>
          <Group gap="sm">
            <Button leftSection={<IconRun size={18} />} loading={optimizerLoading} onClick={() => runOptimizer()}>
              Ejecutar optimizador
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
          <ScheduleTimeline entries={optimizerPreview} title="Previsualización optimizada" />
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
            <Title order={4}>Asignación de profesores</Title>
            <Badge color="teal" variant="light">
              {courses.length} cursos
            </Badge>
          </Group>
          <Stack gap="md">
            {courses.map((course) => {
              const subjectName = subjectMap.get(course.subject_id) ?? `Curso #${course.id}`
              const teacher = course.teacher_id ? teacherMap.get(course.teacher_id) : undefined
              const currentTeacherName = teacher ? userMap.get(teacher.user_id) : 'Sin asignar'
              return (
                <Card key={course.id} withBorder radius="md" padding="md">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={2}>
                      <Text fw={600}>{subjectName}</Text>
                      <Text size="xs" c="dimmed">
                        {course.term} · Grupo {course.group ?? 'A'}
                      </Text>
                    </Stack>
                    <Select
                      value={course.teacher_id ? String(course.teacher_id) : null}
                      data={teacherOptions}
                      placeholder={currentTeacherName}
                      onChange={(value) => value && handleTeacherChange(course.id, value)}
                      style={{ minWidth: 220 }}
                    />
                  </Group>
                </Card>
              )
            })}
          </Stack>
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
    </Stack>
  )
}
