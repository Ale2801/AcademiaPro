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
  duration_minutes?: number
  start_offset_minutes?: number
}

type RoomSegment = {
  start: number
  end: number
  assignmentId?: number | null
}

type RoomAllocation = {
  total: number
  segments: RoomSegment[]
}

type OptimizerAssignment = {
  course_id: number
  room_id: number
  timeslot_id: number
  duration_minutes: number
  start_offset_minutes: number
}

type OptimizerUnassigned = {
  course_id: number
  remaining_minutes: number
}

type OptimizerResponse = {
  assignments: OptimizerAssignment[]
  unassigned?: OptimizerUnassigned[]
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

function minutesToTimeString(totalMinutes: number | null): string | null {
  if (totalMinutes == null || Number.isNaN(totalMinutes)) return null
  const minutesNormalized = ((Math.floor(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(minutesNormalized / 60)
  const minutes = minutesNormalized % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function durationInHours(start?: string | null, end?: string | null): number {
  const startMinutes = timeStringToMinutes(start)
  const endMinutes = timeStringToMinutes(end)
  if (startMinutes == null || endMinutes == null) return 0
  const diff = endMinutes - startMinutes
  if (diff <= 0) return 0
  return diff / 60
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
  const [dialogDuration, setDialogDuration] = useState<number | null>(null)
  const [dialogOffset, setDialogOffset] = useState<number | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [dialogManualAdjust, setDialogManualAdjust] = useState(false)

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

  const timeslotDurationMinutesMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const [id, hours] of timeslotDurationMap.entries()) {
      map.set(id, Math.round(hours * 60))
    }
    return map
  }, [timeslotDurationMap])

  const assignmentHours = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of schedule) {
      let hours = 0
      if (entry.duration_minutes != null && entry.duration_minutes > 0) {
        hours = entry.duration_minutes / 60
      } else if (entry.start_time || entry.end_time) {
        hours = durationInHours(entry.start_time ?? null, entry.end_time ?? null)
      } else if (entry.timeslot_id != null) {
        hours = timeslotDurationMap.get(entry.timeslot_id) ?? 0
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

  const courseSummaryMap = useMemo(() => {
    const map = new Map<number, (typeof courseSummaries)[number]>()
    for (const summary of courseSummaries) {
      map.set(summary.id, summary)
    }
    return map
  }, [courseSummaries])

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
      list.sort((a, b) => {
        const roomCompare = (a.room_code ?? '').localeCompare(b.room_code ?? '')
        if (roomCompare !== 0) return roomCompare
        const offsetA = a.start_offset_minutes ?? Math.max(
          (timeStringToMinutes(a.start_time) ?? 0) - (timeStringToMinutes(a.start_time && a.timeslot_id != null ? timeslotMap.get(a.timeslot_id)?.start_time : undefined) ?? 0),
          0,
        )
        const offsetB = b.start_offset_minutes ?? Math.max(
          (timeStringToMinutes(b.start_time) ?? 0) - (timeStringToMinutes(b.start_time && b.timeslot_id != null ? timeslotMap.get(b.timeslot_id)?.start_time : undefined) ?? 0),
          0,
        )
        if (offsetA !== offsetB) return offsetA - offsetB
        const startLabelA = a.start_time ?? ''
        const startLabelB = b.start_time ?? ''
        if (startLabelA !== startLabelB) return startLabelA.localeCompare(startLabelB)
        return (a.course_name ?? '').localeCompare(b.course_name ?? '')
      })
    }
    return map
  }, [schedule, timeslotMap])

  const roomAllocationMap = useMemo(() => {
    const map = new Map<string, RoomAllocation>()
    for (const entry of schedule) {
      if (entry.timeslot_id == null || entry.room_id == null) continue
      const slot = timeslotMap.get(entry.timeslot_id)
      if (!slot) continue
      const total = timeslotDurationMinutesMap.get(entry.timeslot_id) ?? Math.round(durationInHours(slot.start_time, slot.end_time) * 60)
      if (!Number.isFinite(total) || total <= 0) continue
      const slotStartMinutes = timeStringToMinutes(slot.start_time) ?? 0
      let offsetMinutes = entry.start_offset_minutes ?? null
      if (offsetMinutes == null && entry.start_time) {
        const entryStart = timeStringToMinutes(entry.start_time)
        if (entryStart != null) {
          offsetMinutes = Math.max(Math.round(entryStart - slotStartMinutes), 0)
        }
      }
      const start = Math.max(0, Math.min(offsetMinutes ?? 0, total))
      let duration = entry.duration_minutes ?? null
      if ((duration == null || duration <= 0) && entry.start_time && entry.end_time) {
        const entryStart = timeStringToMinutes(entry.start_time)
        const entryEnd = timeStringToMinutes(entry.end_time)
        if (entryStart != null && entryEnd != null) {
          duration = Math.max(Math.round(entryEnd - entryStart), 0)
        }
      }
      if (duration == null || duration <= 0) {
        duration = total
      }
      const end = Math.max(start, Math.min(start + duration, total))
      const key = `${entry.room_id}-${entry.timeslot_id}`
      const allocation = map.get(key) ?? { total, segments: [] }
      allocation.total = total
      allocation.segments.push({ start, end, assignmentId: entry.id ?? null })
      map.set(key, allocation)
    }
    for (const allocation of map.values()) {
      allocation.segments.sort((a, b) => a.start - b.start)
    }
    return map
  }, [schedule, timeslotMap, timeslotDurationMinutesMap])

  const getRoomAvailability = useCallback(
    (roomId: number | null, timeslotId: number | null, ignoreAssignmentId?: number | null) => {
      if (roomId == null || timeslotId == null) return null
      const total = timeslotDurationMinutesMap.get(timeslotId) ?? 0
      if (!Number.isFinite(total) || total <= 0) {
        return { total: 0, freeSegments: [], usedSegments: [] }
      }
      const key = `${roomId}-${timeslotId}`
      const allocation = roomAllocationMap.get(key)
      const segments = allocation?.segments ?? []
      const filtered = segments.filter((segment) => segment.assignmentId !== (ignoreAssignmentId ?? null))
      filtered.sort((a, b) => a.start - b.start)
      const freeSegments: { start: number; end: number }[] = []
      let cursor = 0
      for (const segment of filtered) {
        if (segment.start > cursor) {
          freeSegments.push({ start: cursor, end: segment.start })
        }
        cursor = Math.max(cursor, segment.end)
      }
      if (cursor < total) {
        freeSegments.push({ start: cursor, end: total })
      }
      return { total, freeSegments, usedSegments: filtered }
    },
    [roomAllocationMap, timeslotDurationMinutesMap],
  )

  const computeEntryAllocation = useCallback(
    (entry: ScheduleEntry, timeslotId: number | null) => {
      if (timeslotId == null) {
        return { offset: entry.start_offset_minutes ?? 0, duration: entry.duration_minutes ?? 0 }
      }
      const total = timeslotDurationMinutesMap.get(timeslotId) ?? 0
      const slot = timeslotMap.get(timeslotId)
      const slotStartMinutes = slot ? timeStringToMinutes(slot.start_time) ?? 0 : 0
      let offset = entry.start_offset_minutes ?? null
      if ((offset == null || offset < 0) && entry.start_time) {
        const entryStart = timeStringToMinutes(entry.start_time)
        if (entryStart != null) {
          offset = Math.max(Math.round(entryStart - slotStartMinutes), 0)
        }
      }
      let duration = entry.duration_minutes ?? null
      if ((duration == null || duration <= 0) && entry.start_time && entry.end_time) {
        const entryStart = timeStringToMinutes(entry.start_time)
        const entryEnd = timeStringToMinutes(entry.end_time)
        if (entryStart != null && entryEnd != null) {
          duration = Math.max(Math.round(entryEnd - entryStart), 0)
        }
      }
      if (duration == null || duration <= 0) {
        duration = total
      }
      if (offset == null || offset < 0) {
        offset = 0
      }
      const end = Math.max(offset, Math.min(offset + duration, total))
      return { offset, duration: Math.max(end - offset, 0) }
    },
    [timeslotDurationMinutesMap, timeslotMap],
  )

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
      setDialogDuration(null)
      setDialogOffset(null)
      setDialogError(null)
      return
    }

    const courseId = dialog.type === 'create' ? dialog.courseId : dialog.assignment.course_id

    setDialogManualAdjust(false)

    let inferredRoom: string | null = null
    let inferredTimeslot: string | null = null

    if (dialog.type === 'create') {
      const existing = schedule.find((entry) => entry.course_id === dialog.courseId && entry.room_id)
      inferredRoom = existing?.room_id ? String(existing.room_id) : roomOptions[0]?.value ?? null
      inferredTimeslot = String(dialog.timeslotId)
    } else {
      const defaultRoom = dialog.assignment.room_id ? String(dialog.assignment.room_id) : roomOptions[0]?.value ?? null
      inferredRoom = defaultRoom
      const targetTimeslot = dialog.targetTimeslotId ?? dialog.assignment.timeslot_id
      inferredTimeslot = targetTimeslot != null ? String(targetTimeslot) : null
    }

    setDialogRoom(inferredRoom)
    setDialogTimeslot(inferredTimeslot)

    const roomIdNum = inferredRoom ? Number(inferredRoom) : null
    const timeslotIdNum = inferredTimeslot ? Number(inferredTimeslot) : null
    const assignmentId = dialog.type === 'edit' ? dialog.assignment.id ?? null : null

    let durationCandidate: number | null = null
    let offsetCandidate: number | null = null
    let error: string | null = null

    if (dialog.type === 'edit') {
      const baseAllocation = computeEntryAllocation(dialog.assignment, timeslotIdNum)
      durationCandidate = baseAllocation.duration
      offsetCandidate = baseAllocation.offset
    }

    if (roomIdNum != null && timeslotIdNum != null) {
      const availability = getRoomAvailability(roomIdNum, timeslotIdNum, assignmentId ?? null)
      if (!availability) {
        error = 'No se pudo calcular la disponibilidad del bloque.'
      } else {
        const gaps = availability.freeSegments
        if (dialog.type === 'create') {
          const summary = courseSummaryMap.get(courseId)
          const remainingMinutes = summary ? Math.max(Math.round((summary.weeklyHours - summary.assignedHours) * 60), 0) : availability.total
          const desiredDuration = remainingMinutes > 0 ? Math.min(remainingMinutes, availability.total) : availability.total
          const firstGap = gaps.find((gap) => gap.end - gap.start > 0)
          if (firstGap) {
            offsetCandidate = firstGap.start
            durationCandidate = Math.min(firstGap.end - firstGap.start, desiredDuration)
          } else {
            offsetCandidate = 0
            durationCandidate = 0
            error = 'El bloque seleccionado no tiene espacio disponible.'
          }
        } else {
          if (durationCandidate == null || durationCandidate <= 0) {
            durationCandidate = availability.total
          }
          if (offsetCandidate == null || offsetCandidate < 0) {
            offsetCandidate = gaps[0]?.start ?? 0
          }
          const fits = gaps.some((gap) =>
            offsetCandidate != null && durationCandidate != null
              ? offsetCandidate >= gap.start && offsetCandidate + durationCandidate <= gap.end + 0.001
              : false,
          )
          if (!fits) {
            const matchingGap = gaps.find((gap) => durationCandidate != null && gap.end - gap.start >= durationCandidate)
            if (matchingGap) {
              offsetCandidate = matchingGap.start
              durationCandidate = Math.min(durationCandidate ?? matchingGap.end - matchingGap.start, matchingGap.end - matchingGap.start)
            } else if (gaps.length > 0) {
              offsetCandidate = gaps[0].start
              durationCandidate = gaps[0].end - gaps[0].start
              error = 'Se ajustó la clase para caber en el espacio disponible.'
            } else {
              error = 'No hay espacio disponible en este bloque.'
              durationCandidate = 0
            }
          }
        }
      }
    }

    setDialogDuration(durationCandidate != null ? Math.max(Math.round(durationCandidate), 0) : null)
    setDialogOffset(offsetCandidate != null ? Math.max(Math.round(offsetCandidate), 0) : null)
    setDialogError(error)
  }, [dialog, schedule, roomOptions, computeEntryAllocation, getRoomAvailability, courseSummaryMap])

  useEffect(() => {
    if (!dialog) return
    if (!dialogRoom || !dialogTimeslot) {
      setDialogError('Selecciona una sala y bloque horario.')
      return
    }
    const roomIdNum = Number(dialogRoom)
    const timeslotIdNum = Number(dialogTimeslot)
    const assignmentId = dialog.type === 'edit' ? dialog.assignment.id ?? null : null
    const availability = getRoomAvailability(roomIdNum, timeslotIdNum, assignmentId ?? null)
    if (!availability) {
      setDialogError('No se pudo calcular la disponibilidad del bloque seleccionado.')
      return
    }
    const gaps = availability.freeSegments
    if (gaps.length === 0) {
      setDialogError('No hay espacio disponible en este bloque para la sala seleccionada.')
      if (!dialogManualAdjust) {
        if (dialogOffset !== 0) setDialogOffset(0)
        if (dialogDuration !== 0) setDialogDuration(0)
      }
      return
    }

    if (dialogDuration == null || dialogDuration <= 0 || dialogOffset == null || dialogOffset < 0) {
      if (!dialogManualAdjust) {
        const firstGap = gaps[0]
        setDialogOffset(firstGap.start)
        setDialogDuration(firstGap.end - firstGap.start)
        setDialogManualAdjust(false)
        setDialogError(null)
      }
      return
    }

    const fits = gaps.some((gap) => dialogOffset >= gap.start && dialogOffset + dialogDuration <= gap.end + 0.001)
    if (fits) {
      setDialogError(null)
      return
    }

    const suitableGap = gaps.find((gap) => gap.end - gap.start >= dialogDuration)
    if (!dialogManualAdjust && suitableGap) {
      if (dialogOffset !== suitableGap.start) setDialogOffset(suitableGap.start)
      if (dialogDuration > suitableGap.end - suitableGap.start) {
        setDialogDuration(suitableGap.end - suitableGap.start)
      }
      setDialogManualAdjust(false)
      setDialogError('Se ajustó la clase para caber en el espacio disponible.')
      return
    }

    if (!dialogManualAdjust) {
      const fallbackGap = gaps[0]
      if (dialogOffset !== fallbackGap.start) setDialogOffset(fallbackGap.start)
      if (dialogDuration !== fallbackGap.end - fallbackGap.start) setDialogDuration(fallbackGap.end - fallbackGap.start)
      setDialogManualAdjust(false)
      setDialogError('Se ajustó la clase para caber en el espacio disponible.')
      return
    }

    setDialogError('La duración y posición seleccionadas no caben en este bloque. Ajusta los valores manualmente.')
  }, [dialog, dialogRoom, dialogTimeslot, dialogDuration, dialogOffset, dialogManualAdjust, getRoomAvailability])

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
      const parsedAssignments: Assignment[] = data.assignments.map((assignment) => ({
        course_id: assignment.course_id,
        room_id: assignment.room_id,
        timeslot_id: assignment.timeslot_id,
        duration_minutes: assignment.duration_minutes,
        start_offset_minutes: assignment.start_offset_minutes,
      }))
      const preview: ScheduleEntry[] = parsedAssignments.map((assignment) => {
        const course = courseMap.get(assignment.course_id)
        const timeslot = timeslotMap.get(assignment.timeslot_id)
        const room = roomMap.get(assignment.room_id)
        const subjectName = course ? subjectMap.get(course.subject_id) : undefined
        const teacherName = course?.teacher_id ? userMap.get(teacherMap.get(course.teacher_id)?.user_id ?? 0) : null
        const slotStartMinutes = timeslot ? timeStringToMinutes(timeslot.start_time) : null
        const startOffset = assignment.start_offset_minutes ?? 0
        const durationMinutes = assignment.duration_minutes ?? (timeslot ? Math.round(durationInHours(timeslot.start_time, timeslot.end_time) * 60) : 0)
        const startMinutesAbsolute = slotStartMinutes != null ? slotStartMinutes + startOffset : null
        const endMinutesAbsolute = startMinutesAbsolute != null ? startMinutesAbsolute + durationMinutes : timeStringToMinutes(timeslot?.end_time)
        const startLabel = minutesToTimeString(startMinutesAbsolute) ?? (timeslot ? timeLabel(timeslot.start_time) : undefined)
        const endLabel = minutesToTimeString(endMinutesAbsolute) ?? (timeslot ? timeLabel(timeslot.end_time) : undefined)
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
          start_time: startLabel ?? undefined,
          end_time: endLabel ?? undefined,
          teacher_name: teacherName ?? undefined,
          duration_minutes: durationMinutes,
          start_offset_minutes: assignment.start_offset_minutes ?? 0,
        }
      })
      setOptimizerAssignments(parsedAssignments)
      setOptimizerPreview(preview)
      const unassigned = data.unassigned ?? []
      if (unassigned.length > 0) {
        const detail = unassigned
          .map((item) => {
            const courseLabel = courseLookup.get(item.course_id)?.label ?? `Curso #${item.course_id}`
            return `${courseLabel}: ${formatMinutesLabel(item.remaining_minutes)}`
          })
          .join(', ')
        setSuccess(`Optimización parcial: ${parsedAssignments.length} bloques sugeridos. Pendiente: ${detail}.`)
      } else {
        setSuccess(`Optimización generó ${parsedAssignments.length} bloques sugeridos.`)
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo optimizar el horario'
      setError(detail)
    } finally {
      setOptimizerLoading(false)
    }
  }, [selectedSemester, courses, rooms, buildTimeslotBlocks, maxConsecutiveBlocks, requireBreaks, courseMap, courseLookup, timeslotMap, roomMap, subjectMap, userMap, teacherMap])

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
    (assignmentId: number, timeslotId: number) => {
      const assignment = assignmentMap.get(assignmentId)
      if (!assignment) return
      if (assignment.timeslot_id === timeslotId) return
      setDialog({ type: 'edit', assignment, targetTimeslotId: timeslotId })
    },
    [assignmentMap],
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

  const closeDialog = () => {
    setDialog(null)
    setDialogDuration(null)
    setDialogOffset(null)
    setDialogError(null)
    setDialogManualAdjust(false)
  }

  const handleDialogSubmit = useCallback(async () => {
    if (!dialog) return
    if (!dialogRoom || !dialogTimeslot) {
      setError('Selecciona sala y bloque horario')
      return
    }
    if (dialogDuration == null || dialogDuration <= 0) {
      setError('Define una duración válida para la clase dentro del bloque seleccionado')
      return
    }
    const offsetValue = dialogOffset != null && dialogOffset >= 0 ? Math.round(dialogOffset) : 0
    const durationValue = Math.round(dialogDuration)
    setSaving(true)
    setError(null)
    try {
      if (dialog.type === 'create') {
        await api.post('/course-schedules/', {
          course_id: dialog.courseId,
          room_id: Number(dialogRoom),
          timeslot_id: Number(dialogTimeslot),
          duration_minutes: durationValue,
          start_offset_minutes: offsetValue,
        })
        setSuccess('Bloque agregado al horario')
      } else if (dialog.type === 'edit' && dialog.assignment.id != null) {
        await api.put(`/course-schedules/${dialog.assignment.id}`, {
          course_id: dialog.assignment.course_id,
          room_id: Number(dialogRoom),
          timeslot_id: Number(dialogTimeslot),
          duration_minutes: durationValue,
          start_offset_minutes: offsetValue,
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
  }, [dialog, dialogRoom, dialogTimeslot, dialogDuration, dialogOffset, loadSemesterData, selectedSemester])

  const totalAssignments = schedule.length
  const dialogAvailability = useMemo(() => {
    if (!dialog || !dialogRoom || !dialogTimeslot) return null
    const roomIdNum = Number(dialogRoom)
    const timeslotIdNum = Number(dialogTimeslot)
    if (Number.isNaN(roomIdNum) || Number.isNaN(timeslotIdNum)) return null
    const assignmentId = dialog.type === 'edit' ? dialog.assignment.id ?? null : null
    return getRoomAvailability(roomIdNum, timeslotIdNum, assignmentId ?? null)
  }, [dialog, dialogRoom, dialogTimeslot, getRoomAvailability])

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
            onChange={(value) => {
              setDialogRoom(value)
              setDialogManualAdjust(false)
            }}
            placeholder="Selecciona una sala"
            searchable
            nothingFoundMessage="Sin salas"
          />
          <Select
            label="Bloque horario"
            data={timeslotOptions}
            value={dialogTimeslot}
            onChange={(value) => {
              setDialogTimeslot(value)
              setDialogManualAdjust(false)
            }}
            placeholder="Selecciona un bloque"
            searchable
            nothingFoundMessage="Sin bloques"
          />
          {dialogAvailability && (
            <Text size="xs" c="dimmed">
              Bloque de {formatMinutesLabel(dialogAvailability.total)} · Libre total: {formatMinutesLabel(dialogAvailability.freeSegments.reduce((sum, gap) => sum + (gap.end - gap.start), 0))}
            </Text>
          )}
          <NumberInput
            label="Duración dentro del bloque (minutos)"
            min={5}
            step={5}
            value={dialogDuration ?? undefined}
            onChange={(value) => {
              setDialogManualAdjust(true)
              setDialogDuration(typeof value === 'number' ? value : null)
            }}
          />
          <NumberInput
            label="Inicio respecto al inicio del bloque (minutos)"
            min={0}
            step={5}
            value={dialogOffset ?? 0}
            onChange={(value) => {
              setDialogManualAdjust(true)
              setDialogOffset(typeof value === 'number' ? value : 0)
            }}
          />
          {dialogError && (
            <Alert color="orange" variant="light" title="Ajusta la asignación">
              {dialogError}
            </Alert>
          )}
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
