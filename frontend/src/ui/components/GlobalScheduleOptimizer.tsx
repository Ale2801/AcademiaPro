import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconBuilding,
  IconCalendarCog,
  IconCalendarEvent,
  IconCheck,
  IconClockHour4,
  IconDeviceFloppy,
  IconFilter,
  IconRefresh,
  IconUsersGroup,
} from '@tabler/icons-react'
import { api } from '../../lib/api'
import ScheduleTimeline, { ScheduleEntry } from './ScheduleTimeline'

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

function minutesToTimeString(totalMinutes: number | null): string | null {
  if (totalMinutes == null || Number.isNaN(totalMinutes)) return null
  const normalized = ((Math.floor(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function durationBetween(start?: string | null, end?: string | null): number {
  const startMinutes = timeStringToMinutes(start)
  const endMinutes = timeStringToMinutes(end)
  if (startMinutes == null || endMinutes == null) return 0
  const diff = endMinutes - startMinutes
  return diff > 0 ? diff : 0
}

function formatMinutesLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0m'
  const minutes = Math.round(value)
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (remainder > 0) parts.push(`${remainder}m`)
  if (parts.length === 0) return '0m'
  return parts.join(' ')
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
  is_active?: boolean | null
}

type Course = {
  id: number
  subject_id: number
  teacher_id: number | null
  program_semester_id: number | null
  term: string | null
  group?: string | null
  weekly_hours: number | null
}

type Room = {
  id: number
  code: string
  capacity: number | null
}

type Timeslot = {
  id: number
  day_of_week: number
  start_time: string
  end_time: string
}

type Subject = {
  id: number
  name: string
}

type Teacher = {
  id: number
  user_id: number | null
}

type User = {
  id: number
  full_name: string
}

type OptimizerAssignment = {
  course_id: number
  room_id: number
  timeslot_id: number
  duration_minutes?: number | null
  start_offset_minutes?: number | null
}

type OptimizerUnassigned = {
  course_id: number
  remaining_minutes: number
}

type QualityMetrics = {
  total_assigned: number
  total_unassigned: number
  lunch_violations: number
  consecutive_blocks_violations: number
  gap_violations: number
  balance_score: number
  daily_overload_count: number
  avg_daily_load: number
  max_daily_load: number
  timeslot_utilization: number
  unassigned_count: number
}

type PerformanceMetrics = {
  runtime_seconds: number
  requested_courses: number
  assigned_courses: number
  requested_minutes: number
  assigned_minutes: number
  fill_rate: number
}

type OptimizerDiagnostics = {
  messages?: string[]
  unassigned_causes?: Record<string, string>
}

type OptimizerResponse = {
  assignments: OptimizerAssignment[]
  unassigned?: OptimizerUnassigned[]
  quality_metrics?: QualityMetrics
  performance_metrics?: PerformanceMetrics
  diagnostics?: OptimizerDiagnostics
}

type StatCard = {
  label: string
  value: string
  hint: string
  icon: React.ComponentType<{ size?: number | string }>
}

type SemesterOption = {
  value: string
  label: string
  programId: number
}

type SemesterPreview = {
  key: string
  semesterId: number | null
  semesterLabel: string
  entries: ScheduleEntry[]
}

type ProgramPreview = {
  key: string
  programId: number | null
  programLabel: string
  total: number
  semesters: SemesterPreview[]
}

export default function GlobalScheduleOptimizer() {
  const [loading, setLoading] = useState(true)
  const [optimizerLoading, setOptimizerLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [courses, setCourses] = useState<Course[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [timeslots, setTimeslots] = useState<Timeslot[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [programSemesters, setProgramSemesters] = useState<ProgramSemester[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [users, setUsers] = useState<User[]>([])

  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([])
  const [selectedSemesters, setSelectedSemesters] = useState<string[]>([])
  const [selectedTerms, setSelectedTerms] = useState<string[]>([])

  const [previewEntries, setPreviewEntries] = useState<ScheduleEntry[]>([])
  const [optimizerAssignments, setOptimizerAssignments] = useState<OptimizerAssignment[]>([])
  const [unassigned, setUnassigned] = useState<OptimizerUnassigned[]>([])
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(null)
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null)
  const [diagnostics, setDiagnostics] = useState<OptimizerDiagnostics | null>(null)

  const [maxDailyHours, setMaxDailyHours] = useState(6)
  const [saving, setSaving] = useState(false)

  const loadCatalogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [programsRes, semestersRes, coursesRes, roomsRes, timeslotsRes, subjectsRes, teachersRes, usersRes] = await Promise.all([
        api.get('/programs/'),
        api.get('/program-semesters/'),
        api.get('/courses/'),
        api.get('/rooms/'),
        api.get('/timeslots/'),
        api.get('/subjects/'),
        api.get('/teachers/'),
        api.get('/users/'),
      ])
      setPrograms(programsRes.data as Program[])
      setProgramSemesters(semestersRes.data as ProgramSemester[])
      setCourses(coursesRes.data as Course[])
      setRooms(roomsRes.data as Room[])
      setTimeslots(timeslotsRes.data as Timeslot[])
      setSubjects(subjectsRes.data as Subject[])
      setTeachers(teachersRes.data as Teacher[])
    setUsers(usersRes.data as User[])
  setPreviewEntries([])
  setOptimizerAssignments([])
      setUnassigned([])
      setQualityMetrics(null)
      setPerformanceMetrics(null)
      setDiagnostics(null)
      setSuccess(null)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudieron cargar los catálogos globales'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalogs()
  }, [loadCatalogs])

  const programMap = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs])
  const semesterMap = useMemo(() => new Map(programSemesters.map((semester) => [semester.id, semester])), [programSemesters])
  const subjectMap = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects])
  const teacherMap = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers])
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user.full_name])), [users])
  const roomMap = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const timeslotMap = useMemo(() => new Map(timeslots.map((slot) => [slot.id, slot])), [timeslots])
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])

  const programOptions = useMemo(
    () =>
      programs.map((program) => ({
        value: String(program.id),
        label: program.name || program.code || `Programa #${program.id}`,
      })),
    [programs],
  )

  const semesterOptions: SemesterOption[] = useMemo(
    () =>
      programSemesters.map((semester) => {
        const program = programMap.get(semester.program_id)
        const semesterLabel = semester.label || `Semestre ${semester.semester_number}`
        const programLabel = program?.name || program?.code || `Programa #${semester.program_id}`
        return {
          value: String(semester.id),
          label: `${programLabel} · ${semesterLabel}`,
          programId: semester.program_id,
        }
      }),
    [programMap, programSemesters],
  )

  const filteredSemesterOptions = useMemo(() => {
    if (selectedPrograms.length === 0) return semesterOptions
    const allowed = new Set(selectedPrograms.map((value) => Number(value)))
    return semesterOptions.filter((option) => allowed.has(option.programId))
  }, [selectedPrograms, semesterOptions])

  const termOptions = useMemo(() => {
    const set = new Set<string>()
    for (const course of courses) {
      if (course.term) {
        set.add(course.term)
      }
    }
    return Array.from(set).sort().map((term) => ({ value: term, label: term }))
  }, [courses])

  const filteredCourses = useMemo(() => {
    let result = courses.slice()
    if (selectedPrograms.length > 0) {
      const allowed = new Set(selectedPrograms.map((value) => Number(value)))
      result = result.filter((course) => {
        if (course.program_semester_id == null) return false
        const semester = semesterMap.get(course.program_semester_id)
        if (!semester) return false
        return allowed.has(semester.program_id)
      })
    }
    if (selectedSemesters.length > 0) {
      const allowedSemesters = new Set(selectedSemesters.map((value) => Number(value)))
      result = result.filter((course) => course.program_semester_id != null && allowedSemesters.has(course.program_semester_id))
    }
    if (selectedTerms.length > 0) {
      const allowedTerms = new Set(selectedTerms)
      result = result.filter((course) => course.term != null && allowedTerms.has(course.term))
    }
    return result
  }, [courses, selectedPrograms, selectedSemesters, selectedTerms, semesterMap])

  const totalWeeklyHours = useMemo(() =>
    filteredCourses.reduce((acc, course) => {
      const hours = Number(course.weekly_hours ?? 0)
      if (!Number.isFinite(hours) || hours < 0) return acc
      return acc + hours
    }, 0),
  [filteredCourses])

  const uniqueTeachers = useMemo(() => {
    const set = new Set<number>()
    for (const course of filteredCourses) {
      if (course.teacher_id != null) {
        set.add(course.teacher_id)
      }
    }
    return set.size
  }, [filteredCourses])

  const stats: StatCard[] = useMemo(
    () => [
      {
        label: 'Cursos filtrados',
        value: String(filteredCourses.length),
        hint: 'Según los filtros activos',
        icon: IconCalendarEvent,
      },
      {
        label: 'Horas semanales',
        value: `${totalWeeklyHours}h`,
        hint: 'Carga total a programar',
        icon: IconClockHour4,
      },
      {
        label: 'Aulas disponibles',
        value: String(rooms.length),
        hint: 'Salas registradas',
        icon: IconBuilding,
      },
      {
        label: 'Docentes únicos',
        value: String(uniqueTeachers),
        hint: 'Asociados a los cursos',
        icon: IconUsersGroup,
      },
      {
        label: 'Bloques sugeridos',
  value: String(previewEntries.length),
        hint: 'Última ejecución',
        icon: IconCalendarCog,
      },
    ],
  [filteredCourses.length, previewEntries.length, rooms.length, totalWeeklyHours, uniqueTeachers],
  )

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

  const allTimeslotIds = useMemo(() => timeslots.map((slot) => slot.id), [timeslots])

  const runOptimizer = useCallback(async () => {
    if (filteredCourses.length === 0) {
      setError('No hay cursos que coincidan con los filtros actuales.')
      return
    }
    if (rooms.length === 0) {
      setError('Registra aulas antes de ejecutar el optimizador global.')
      return
    }
    if (timeslots.length === 0) {
      setError('Crea bloques horarios para habilitar el optimizador global.')
      return
    }

    setOptimizerLoading(true)
    setError(null)
    setSuccess(null)
    setQualityMetrics(null)
    setPerformanceMetrics(null)
    setDiagnostics(null)

    try {
      const coursesPayload = filteredCourses.map((course) => ({
        course_id: course.id,
        teacher_id: course.teacher_id ?? -course.id,
        weekly_hours: Math.max(Number(course.weekly_hours ?? 0) || 0, 1),
        program_semester_id: course.program_semester_id ?? undefined,
      }))

      const roomsPayload = rooms.map((room) => ({
        room_id: room.id,
        capacity: Number.isFinite(room.capacity) && room.capacity != null ? room.capacity : 0,
      }))

      const timeslotPayload = buildTimeslotBlocks()

      const teacherAvailability: Record<number, number[]> = {}
      for (const course of filteredCourses) {
        if (course.teacher_id != null && course.teacher_id >= 0) {
          if (!teacherAvailability[course.teacher_id]) {
            teacherAvailability[course.teacher_id] = [...allTimeslotIds]
          }
        }
      }

      const payload = {
        courses: coursesPayload,
        rooms: roomsPayload,
        timeslots: timeslotPayload,
        constraints: {
          teacher_availability: teacherAvailability,
          max_daily_hours_per_program: maxDailyHours,
        },
      }

      const { data } = await api.post<OptimizerResponse>('/schedule/optimize', payload)
  const assignments = data.assignments ?? []
  setOptimizerAssignments(assignments)
  const entries: ScheduleEntry[] = assignments.map((assignment) => {
        const course = courseMap.get(assignment.course_id)
        const subjectName = course ? subjectMap.get(course.subject_id) : undefined
        const semester = course?.program_semester_id != null ? semesterMap.get(course.program_semester_id) : undefined
        const program = semester ? programMap.get(semester.program_id) : undefined
        const teacher = course?.teacher_id != null ? teacherMap.get(course.teacher_id) : undefined
        const teacherName = teacher?.user_id != null ? userMap.get(teacher.user_id) : undefined
        const courseLabelParts: string[] = []
        if (subjectName) courseLabelParts.push(subjectName)
        if (course?.group) courseLabelParts.push(`Grupo ${course.group}`)
        const courseLabel = courseLabelParts.length > 0 ? courseLabelParts.join(' · ') : `Curso #${assignment.course_id}`
        const semesterLabel = semester?.label || (semester?.semester_number != null ? `Semestre ${semester.semester_number}` : undefined)
        const timeslot = timeslotMap.get(assignment.timeslot_id)
        const room = roomMap.get(assignment.room_id)
        const slotStart = timeslot ? timeStringToMinutes(timeslot.start_time) : null
        const durationMinutes = assignment.duration_minutes ?? (timeslot ? durationBetween(timeslot.start_time, timeslot.end_time) : 0)
        const offset = assignment.start_offset_minutes ?? 0
        const startLabel = minutesToTimeString(slotStart != null ? slotStart + offset : null) || (timeslot ? timeslot.start_time.slice(0, 5) : undefined)
        const endLabel = minutesToTimeString(slotStart != null ? slotStart + offset + durationMinutes : null) || (timeslot ? timeslot.end_time.slice(0, 5) : undefined)
        return {
          course_id: assignment.course_id,
          course_name: courseLabel,
          subject_name: subjectName,
          room_id: assignment.room_id,
          room_code: room?.code,
          timeslot_id: assignment.timeslot_id,
          day_of_week: timeslot?.day_of_week,
          start_time: startLabel ?? undefined,
          end_time: endLabel ?? undefined,
          duration_minutes: durationMinutes,
          start_offset_minutes: assignment.start_offset_minutes ?? 0,
          teacher_name: teacherName,
          program_id: program?.id ?? null,
          program_semester_id: semester?.id ?? null,
          program_semester_label: semesterLabel ?? undefined,
        }
      })

      setPreviewEntries(entries)
      setUnassigned(data.unassigned ?? [])
      setQualityMetrics(data.quality_metrics ?? null)
      setPerformanceMetrics(data.performance_metrics ?? null)
      setDiagnostics(data.diagnostics ?? null)

      const assignmentCount = entries.length
      const assignmentLabel = assignmentCount === 1 ? 'bloque' : 'bloques'
      const assignmentSuffix = assignmentCount === 1 ? 'sugerido' : 'sugeridos'
      const readySuffix = assignmentCount === 1 ? 'listo' : 'listos'
      const pendingCount = data.unassigned?.length ?? 0
      if (pendingCount > 0) {
        const pendingLabel = pendingCount === 1 ? 'curso' : 'cursos'
        const pendingVerb = pendingCount === 1 ? 'sigue' : 'siguen'
        setSuccess(`Optimizador global: ${assignmentCount} ${assignmentLabel} ${assignmentSuffix}. ${pendingCount} ${pendingLabel} ${pendingVerb} pendientes.`)
      } else {
        setSuccess(`Optimizador global: ${assignmentCount} ${assignmentLabel} ${assignmentSuffix} ${readySuffix} para revisión.`)
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo ejecutar el optimizador global'
      setError(detail)
      setOptimizerAssignments([])
      setPreviewEntries([])
      setUnassigned([])
    } finally {
      setOptimizerLoading(false)
    }
  }, [
    allTimeslotIds,
    buildTimeslotBlocks,
    courseMap,
    filteredCourses,
    maxDailyHours,
    programMap,
    roomMap,
    rooms,
    semesterMap,
    subjectMap,
    teacherMap,
    timeslotMap,
    timeslots,
    userMap,
  ])

  const previewStructure = useMemo<ProgramPreview[]>(() => {
    if (previewEntries.length === 0) return []
    const buckets = new Map<string, { programId: number | null; programLabel: string; semesters: Map<string, { semesterId: number | null; semesterLabel: string; entries: ScheduleEntry[] }> }>()

    for (const entry of previewEntries) {
      const programId = entry.program_id ?? null
      const programKey = programId != null ? String(programId) : 'none'
      const program = programId != null ? programMap.get(programId) : undefined
      const programLabel = programId != null
        ? program?.name || program?.code || `Programa #${programId}`
        : 'Programas sin asignar'
      let programBucket = buckets.get(programKey)
      if (!programBucket) {
        programBucket = { programId, programLabel, semesters: new Map() }
        buckets.set(programKey, programBucket)
      }

      const semesterId = entry.program_semester_id ?? null
      const semesterKey = semesterId != null ? String(semesterId) : `${programKey}-none`
      const semester = semesterId != null ? semesterMap.get(semesterId) : undefined
      const fallbackLabel = semester?.semester_number != null ? `Semestre ${semester.semester_number}` : 'Semestre sin asignar'
      const semesterLabel = entry.program_semester_label || semester?.label || fallbackLabel
      let semesterBucket = programBucket.semesters.get(semesterKey)
      if (!semesterBucket) {
        semesterBucket = { semesterId, semesterLabel, entries: [] }
        programBucket.semesters.set(semesterKey, semesterBucket)
      }
      semesterBucket.entries.push(entry)
    }

    return Array.from(buckets.values())
      .map((program) => {
        const semesters = Array.from(program.semesters.values()).map((semester) => ({
          key: semester.semesterId != null ? String(semester.semesterId) : `program-${program.programId ?? 'none'}-semester-none`,
          semesterId: semester.semesterId,
          semesterLabel: semester.semesterLabel,
          entries: semester.entries
            .slice()
            .sort((a, b) => {
              const dayDiff = (a.day_of_week ?? 0) - (b.day_of_week ?? 0)
              if (dayDiff !== 0) return dayDiff
              const startA = a.start_time ?? ''
              const startB = b.start_time ?? ''
              return startA.localeCompare(startB)
            }),
        }))
        return {
          key: program.programId != null ? String(program.programId) : `program-${program.programLabel}`,
          programId: program.programId,
          programLabel: program.programLabel,
          total: semesters.reduce((acc, semester) => acc + semester.entries.length, 0),
          semesters: semesters.sort((a, b) => a.semesterLabel.localeCompare(b.semesterLabel, 'es', { numeric: true })),
        }
      })
      .sort((a, b) => a.programLabel.localeCompare(b.programLabel, 'es', { numeric: true }))
  }, [previewEntries, programMap, semesterMap])

  const resolvedGlobalCauses = useMemo(() => {
    if (!diagnostics || !diagnostics.unassigned_causes) return []
    return Object.entries(diagnostics.unassigned_causes).map(([courseId, reason]) => {
      const numericId = Number(courseId)
      const course = courseMap.get(numericId)
      const subjectName = course ? subjectMap.get(course.subject_id) : undefined
      const parts: string[] = []
      if (subjectName) parts.push(subjectName)
      if (course?.group) parts.push(`Grupo ${course.group}`)
      const label = parts.length > 0 ? parts.join(' · ') : `Curso #${courseId}`
      return { courseId: numericId, label, reason }
    })
  }, [diagnostics, courseMap, subjectMap])

  const aggregatedGlobalCauses = useMemo(() => {
    if (!diagnostics || !diagnostics.unassigned_causes) return []
    const counts = new Map<string, number>()
    for (const cause of Object.values(diagnostics.unassigned_causes)) {
      counts.set(cause, (counts.get(cause) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count)
  }, [diagnostics])

  const formatCauseCountLabel = (count: number) => (count === 1 ? '1 curso' : `${count} cursos`)

  const runDisabled = optimizerLoading || loading || filteredCourses.length === 0 || rooms.length === 0 || timeslots.length === 0
  const hasPerformanceInsights = Boolean(
    performanceMetrics ||
      (diagnostics && ((diagnostics.messages?.length ?? 0) > 0 || (diagnostics.unassigned_causes && Object.keys(diagnostics.unassigned_causes).length > 0)))
  )

  const applyProposal = useCallback(async () => {
    if (optimizerAssignments.length === 0) {
      setError('Genera una propuesta antes de aplicarla al horario institucional.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        assignments: optimizerAssignments.map((assignment) => ({
          course_id: assignment.course_id,
          room_id: assignment.room_id,
          timeslot_id: assignment.timeslot_id,
          duration_minutes: assignment.duration_minutes,
          start_offset_minutes: assignment.start_offset_minutes,
        })),
        replace_existing: true,
      }
      await api.post('/schedule/assignments/save', payload)
      setSuccess('Propuesta global aplicada y publicada en el horario institucional.')
      setPreviewEntries([])
      setOptimizerAssignments([])
      setUnassigned([])
      setQualityMetrics(null)
      setPerformanceMetrics(null)
      setDiagnostics(null)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo aplicar la propuesta global'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [optimizerAssignments])

  const metricsEntries = useMemo(() => {
    if (!qualityMetrics) return []
    return [
      { label: 'Asignaciones', value: String(qualityMetrics.total_assigned) },
      { label: 'Pendientes', value: String(qualityMetrics.unassigned_count) },
      { label: 'Balance', value: `${qualityMetrics.balance_score.toFixed(1)}%` },
      { label: 'Uso de bloques', value: `${(qualityMetrics.timeslot_utilization * 100).toFixed(1)}%` },
      { label: 'Promedio diario', value: `${qualityMetrics.avg_daily_load.toFixed(1)}h` },
      { label: 'Máximo diario', value: `${qualityMetrics.max_daily_load.toFixed(1)}h` },
      { label: 'Violaciones almuerzo', value: String(qualityMetrics.lunch_violations) },
      { label: 'Violaciones consecutivas', value: String(qualityMetrics.consecutive_blocks_violations) },
      { label: 'Violaciones descanso', value: String(qualityMetrics.gap_violations) },
      { label: 'Sobrecargas diarias', value: String(qualityMetrics.daily_overload_count) },
      { label: 'Total sin asignar', value: String(qualityMetrics.total_unassigned) },
    ]
  }, [qualityMetrics])

  return (
    <Stack gap="lg">
      <Card withBorder radius="lg" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                Orquestador institucional
              </Text>
              <Title order={3}>Optimizador global de horarios</Title>
              <Text size="sm" c="dimmed">
                Ejecuta una optimización que considera todos los programas y semestres activos para detectar solapamientos, cargas y uso de aulas.
              </Text>
            </div>
            <Badge color="indigo" variant="light">
              {filteredCourses.length} curso{filteredCourses.length === 1 ? '' : 's'}
            </Badge>
          </Group>
          <Group gap="sm">
            <Button
              leftSection={<IconCalendarCog size={16} />}
              onClick={() => void runOptimizer()}
              loading={optimizerLoading}
              disabled={runDisabled}
            >
              Optimizar horarios globales
            </Button>
            {optimizerAssignments.length > 0 ? (
              <Button
                color="teal"
                leftSection={<IconDeviceFloppy size={16} />}
                loading={saving}
                onClick={() => void applyProposal()}
                disabled={saving}
              >
                Aplicar propuesta global
              </Button>
            ) : null}
            <Button
              variant="subtle"
              leftSection={<IconRefresh size={16} />}
              onClick={() => void loadCatalogs()}
              disabled={loading || optimizerLoading}
            >
              Actualizar catálogos
            </Button>
          </Group>
          {runDisabled && !optimizerLoading && !loading && filteredCourses.length === 0 ? (
            <Text size="sm" c="dimmed">
              Ajusta los filtros para incluir al menos un curso antes de ejecutar el optimizador.
            </Text>
          ) : null}
        </Stack>
      </Card>

      {error ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} variant="light">
          {error}
        </Alert>
      ) : null}

      {success ? (
        <Alert color="teal" icon={<IconCheck size={16} />} variant="light">
          {success}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {stats.map((stat) => (
          <Card key={stat.label} radius="lg" padding="lg" withBorder>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  {stat.label}
                </Text>
                <Title order={3} mt={4}>
                  {stat.value}
                </Title>
                <Text size="xs" c="dimmed" mt={4}>
                  {stat.hint}
                </Text>
              </div>
              <ActionIcon variant="light" size="lg" radius="md" color="dark" aria-label={stat.label}>
                <stat.icon size={18} />
              </ActionIcon>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder radius="lg" padding="lg">
        <Stack gap="md">
          <Group gap="xs">
            <IconFilter size={18} />
            <Text fw={600}>Filtros globales</Text>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <MultiSelect
              label="Programas"
              placeholder="Todos los programas"
              data={programOptions}
              value={selectedPrograms}
              onChange={setSelectedPrograms}
              disabled={loading}
            />
            <MultiSelect
              label="Semestres"
              placeholder="Todos los semestres"
              data={filteredSemesterOptions}
              value={selectedSemesters}
              onChange={setSelectedSemesters}
              disabled={loading}
            />
            <MultiSelect
              label="Periodos"
              placeholder="Todos los periodos"
              data={termOptions}
              value={selectedTerms}
              onChange={setSelectedTerms}
              disabled={loading}
            />
          </SimpleGrid>
        </Stack>
      </Card>

      <Card withBorder radius="lg" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600}>Restricciones del optimizador</Text>
            <Text size="xs" c="dimmed">
              Ajusta los límites generales antes de optimizar
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            Los descansos, recreos y ventanas de almuerzo se configuran ahora al generar los bloques horarios. El optimizador respetará esa estructura de forma automática.
          </Text>
          <NumberInput
            label="Horas máximas por programa al día"
            min={1}
            max={12}
            value={maxDailyHours}
            onChange={(value) => setMaxDailyHours(typeof value === 'number' ? value : 6)}
            disabled={loading}
            maw={260}
          />
        </Stack>
      </Card>

      <Card withBorder radius="lg" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text fw={600}>Vista jerárquica de la propuesta</Text>
            <Badge color="blue" variant="light">
              {previewEntries.length} bloque{previewEntries.length === 1 ? '' : 's'} sugerido{previewEntries.length === 1 ? '' : 's'}
            </Badge>
          </Group>
          {optimizerLoading ? (
            <Center py="lg">
              <Loader />
            </Center>
          ) : previewEntries.length === 0 ? (
            <Text size="sm" c="dimmed">
              Ejecuta el optimizador para obtener una propuesta global y revisa aquí los resultados clasificados por programa y semestre.
            </Text>
          ) : (
            <Stack gap="lg">
              {previewStructure.map((program) => (
                <Card key={program.key} withBorder radius="md" padding="lg">
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                          Programa
                        </Text>
                        <Title order={4}>{program.programLabel}</Title>
                        <Text size="xs" c="dimmed">
                          {program.total} bloque{program.total === 1 ? '' : 's'} propuesta{program.total === 1 ? '' : 's'} para este programa
                        </Text>
                      </div>
                      <Badge color="indigo" variant="light">
                        {program.total}
                      </Badge>
                    </Group>
                    <Accordion
                      multiple
                      radius="md"
                      variant="separated"
                    >
                      {program.semesters.map((semester) => (
                        <Accordion.Item key={semester.key} value={semester.key}>
                          <Accordion.Control>
                            <Group justify="space-between" align="center">
                              <div>
                                <Text fw={600}>{semester.semesterLabel}</Text>
                                <Text size="xs" c="dimmed">
                                  {semester.entries.length} bloque{semester.entries.length === 1 ? '' : 's'} sugerido{semester.entries.length === 1 ? '' : 's'}
                                </Text>
                              </div>
                              <Badge color="blue" variant="light">
                                {semester.entries.length}
                              </Badge>
                            </Group>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <ScheduleTimeline entries={semester.entries} />
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      {metricsEntries.length > 0 ? (
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Text fw={600}>Métricas de calidad</Text>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {metricsEntries.map((metric) => (
                <Card key={metric.label} withBorder radius="md" padding="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    {metric.label}
                  </Text>
                  <Title order={4} mt={4}>
                    {metric.value}
                  </Title>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        </Card>
      ) : null}

      {hasPerformanceInsights ? (
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            {performanceMetrics ? (
              <>
                <Group justify="space-between" align="center">
                  <Text fw={600}>Desempeño del optimizador global</Text>
                  <Badge color="indigo" variant="light">
                    Cobertura {(performanceMetrics.fill_rate * 100).toFixed(1)}%
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                  <Card withBorder radius="md" padding="md">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Tiempo de ejecución
                    </Text>
                    <Title order={4} mt={4}>
                      {performanceMetrics.runtime_seconds.toFixed(3)} s
                    </Title>
                  </Card>
                  <Card withBorder radius="md" padding="md">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Cursos cubiertos
                    </Text>
                    <Title order={4} mt={4}>
                      {performanceMetrics.assigned_courses}/{performanceMetrics.requested_courses}
                    </Title>
                  </Card>
                  <Card withBorder radius="md" padding="md">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Carga asignada
                    </Text>
                    <Title order={4} mt={4}>
                      {formatMinutesLabel(performanceMetrics.assigned_minutes)} / {formatMinutesLabel(performanceMetrics.requested_minutes)}
                    </Title>
                  </Card>
                  <Card withBorder radius="md" padding="md">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      Cobertura de horas
                    </Text>
                    <Title order={4} mt={4}>
                      {(performanceMetrics.fill_rate * 100).toFixed(1)}%
                    </Title>
                  </Card>
                </SimpleGrid>
              </>
            ) : null}

            {diagnostics?.messages && diagnostics.messages.length > 0 ? (
              <Alert color="indigo" variant="light">
                <Stack gap={4}>
                  {diagnostics.messages.map((message, index) => (
                    <Text size="sm" key={`global-diag-${index}`}>
                      {message}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : null}

            {aggregatedGlobalCauses.length > 0 ? (
              <Alert color="yellow" variant="light">
                <Stack gap={4}>
                  <Text fw={600}>Causas principales detectadas</Text>
                  {aggregatedGlobalCauses.slice(0, 3).map((item, index) => (
                    <Text size="sm" key={`global-cause-summary-${index}`}>
                      {item.cause} · {formatCauseCountLabel(item.count)}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : null}

            {resolvedGlobalCauses.length > 0 ? (
              <Alert color="orange" variant="light">
                <Stack gap={4}>
                  {resolvedGlobalCauses.map((item) => (
                    <div key={`global-cause-${item.courseId}`}>
                      <Text fw={600}>{item.label}</Text>
                      <Text size="sm" c="dimmed">
                        {item.reason}
                      </Text>
                    </div>
                  ))}
                </Stack>
              </Alert>
            ) : null}
          </Stack>
        </Card>
      ) : null}

      {unassigned.length > 0 ? (
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="sm">
            <Text fw={600}>Cursos pendientes por asignar</Text>
            {unassigned.map((item) => {
              const course = courseMap.get(item.course_id)
              const subjectName = course ? subjectMap.get(course.subject_id) : undefined
              const courseLabelParts: string[] = []
              if (subjectName) courseLabelParts.push(subjectName)
              if (course?.group) courseLabelParts.push(`Grupo ${course.group}`)
              const label = courseLabelParts.length > 0 ? courseLabelParts.join(' · ') : `Curso #${item.course_id}`
              return (
                <Group key={item.course_id} justify="space-between" align="center">
                  <Text>{label}</Text>
                  <Badge color="orange" variant="light">
                    {formatMinutesLabel(item.remaining_minutes)} pendientes
                  </Badge>
                </Group>
              )
            })}
          </Stack>
        </Card>
      ) : null}
    </Stack>
  )
}
