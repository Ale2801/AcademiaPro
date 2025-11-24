import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ZodTypeAny } from 'zod'
import { useNavigate } from 'react-router-dom'
import {
  Accordion,
  ActionIcon,
  Alert,
  CheckIcon,
  Avatar,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  CloseButton,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  MultiSelect,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconAward,
  IconCalendarPlus,
  IconChalkboard,
  IconClipboardList,
  IconBooks,
  IconClockHour4,
  IconDatabase,
  IconEye,
  IconFilter,
  IconPhone,
  IconPencil,
  IconFlask,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
  IconUsersGroup,
} from '@tabler/icons-react'
import { api } from '../../lib/api'
import { TimeslotBulkBuilder } from './TimeslotBulkBuilder'
import { TimeslotOverview } from './TimeslotOverview'
import { WEEKDAY_LABELS } from './constants'
import { buildSchema, endpointFor, labelForOption, normalizePayload } from './utils'
import type { Field, ProgramRecord, Section, TimeslotRecord } from './types'

type CrudSectionProps = {
  section: Section
}

type OptionItem = { value: string; label: string; raw?: any }
type OptionMap = Record<string, OptionItem[]>

type TeacherMeta = {
  name: string
  department?: string | null
  specialty?: string | null
  email?: string | null
}

type TeacherOption = OptionItem & { meta: TeacherMeta }

const ID_PREFIX_REGEX = /^\s*#?\s*\d+\s*(?:[-\u2013\u2014]\s*)?/

function stripCatalogLabel(label?: string | null) {
  if (!label) return null
  const trimmed = String(label).trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(ID_PREFIX_REGEX, '').trim()
  if (!cleaned || /^\d+$/.test(cleaned)) return null
  return cleaned
}

type SemesterState = 'planned' | 'current' | 'finished'

type ProgramSemester = {
  id: number
  program_id: number
  semester_number?: number
  label?: string
  description?: string
  is_active?: boolean
  state?: SemesterState
}

type Course = {
  id: number
  program_semester_id?: number | null
  subject_id?: number | null
  teacher_id?: number | null
  term?: string | null
  group?: string | null
  weekly_hours?: number | null
  capacity?: number | null
  language?: string | null
  modality?: string | null
  start_date?: string | null
  end_date?: string | null
  syllabus_url?: string | null
  location_notes?: string | null
  subject?: Subject | null
  teacher?: {
    id?: number
    user?: {
      full_name?: string | null
      email?: string | null
    } | null
    department?: string | null
    specialty?: string | null
  } | null
  program_semester?: ProgramSemester | null
}

type Subject = {
  id: number
  name?: string
  label?: string
  description?: string
  code?: string
  program_id?: number
  program?: {
    id?: number
    name?: string | null
    code?: string | null
  } | null
  department?: string | null
  level?: string | null
  pedagogical_hours_per_week?: number
  theoretical_hours_per_week?: number
  practical_hours_per_week?: number
  laboratory_hours_per_week?: number
  weekly_autonomous_work_hours?: number
  prerequisite_subject_ids?: number[] | null
}

type StudentRow = {
  id?: number
  user_id?: number | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  user?: {
    id?: number
    full_name?: string | null
    email?: string | null
  } | null
  email?: string | null
  registration_number?: string | null
  program_id?: number | null
  program?: {
    id?: number
    name?: string | null
    code?: string | null
  } | null
  modality?: string | null
  grade_level?: string | null
  enrollment_year?: number | string | null
  cohort_year?: number | string | null
  current_term?: string | null
  expected_graduation_date?: string | null
  status?: string | null
  section?: string | null
  admission_type?: string | null
  financing_type?: string | null
  study_shift?: string | null
  admission_date?: string | null
}

export function CrudSection({ section }: CrudSectionProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string | undefined>()
  const [success, setSuccess] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectOptions, setSelectOptions] = useState<OptionMap>({})
  const [filterQuery, setFilterQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [programSemesters, setProgramSemesters] = useState<ProgramSemester[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedProgram, setSelectedProgram] = useState<ProgramRecord | null>(null)
  const [showProgramDetail, setShowProgramDetail] = useState(false)
  const [updatingSemesterId, setUpdatingSemesterId] = useState<number | null>(null)
  const [updatingProgramId, setUpdatingProgramId] = useState<number | null>(null)
  const [updatingSemesterStateId, setUpdatingSemesterStateId] = useState<number | null>(null)
  const [courseFilters, setCourseFilters] = useState<{ term: string | null; subjectId: string | null; teacherId: string | null; modality: string | null }>({
    term: null,
    subjectId: null,
    teacherId: null,
    modality: null,
  })
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const columns = useMemo(() => {
    if (items.length === 0) return []
    return Object.keys(items[0])
  }, [items])

  const emptyFormValues = useMemo(() => {
    const zeroDefaults = new Set([
      'theoretical_hours_per_week',
      'practical_hours_per_week',
      'laboratory_hours_per_week',
      'weekly_autonomous_work_hours',
      'weekly_hours',
      'capacity',
    ])
    const defaults: Record<string, any> = {}
    for (const field of section.fields) {
      if (field.type === 'checkbox') {
        defaults[field.name] = false
      } else if (field.type === 'multiselect') {
        defaults[field.name] = []
      } else if (field.type === 'number' && zeroDefaults.has(field.name)) {
        defaults[field.name] = 0
      } else {
        defaults[field.name] = ''
      }
    }
    return defaults
  }, [section.fields])

  const schema = useMemo(() => {
    let base: ZodTypeAny = buildSchema(section.fields)
    if (section.key === 'timeslots') {
      base = base.refine((data: any) => {
        const start = data.start_time as string | undefined
        const end = data.end_time as string | undefined
        if (!start || !end) return true
        return start < end
      }, { message: 'La hora de término debe ser mayor a la de inicio', path: ['end_time'] })
    }
    return base
  }, [section.fields, section.key])

  const { control, register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Record<string, any>>({
    resolver: zodResolver(schema),
    defaultValues: {},
  })

  const handleToggleProgramStatus = useCallback(async (programId: number, nextIsActive: boolean) => {
    setUpdatingProgramId(programId)
    setError(undefined)
    setSuccess(undefined)
    try {
      await api.patch(`/programs/${programId}`, { is_active: nextIsActive })
      if (!isMountedRef.current) return
      setItems((prev) => prev.map((item) => (item.id === programId ? { ...item, is_active: nextIsActive } : item)))
      setSelectedProgram((prev) => (prev && prev.id === programId ? { ...prev, is_active: nextIsActive } : prev))
      setSuccess(nextIsActive ? 'Programa activado' : 'Programa desactivado')
    } catch (err: any) {
      console.error('No se pudo actualizar el programa', err)
      if (isMountedRef.current) {
        const detail = err?.response?.data?.detail || err?.message || 'No se pudo actualizar el programa'
        setError(detail)
      }
    } finally {
      if (isMountedRef.current) setUpdatingProgramId(null)
    }
  }, [])

  const loadProgramCatalogs = useCallback(async () => {
    if (section.key !== 'programs') {
      if (!isMountedRef.current) return
      setProgramSemesters([])
      setCourses([])
      setSubjects([])
      return
    }
    try {
      const [semestersRes, coursesRes, subjectsRes] = await Promise.all([
        api.get('/program-semesters/'),
        api.get('/courses/'),
        api.get('/subjects/'),
      ])
      if (!isMountedRef.current) return
      setProgramSemesters(Array.isArray(semestersRes.data) ? semestersRes.data : [])
      setCourses(Array.isArray(coursesRes.data) ? coursesRes.data : [])
      setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : [])
    } catch (err) {
      console.error('No se pudo cargar semestres de programa', err)
      if (!isMountedRef.current) return
      setProgramSemesters([])
      setCourses([])
      setSubjects([])
    }
  }, [section.key])

  const load = useCallback(async () => {
    if (!isMountedRef.current) return
    setLoading(true)
    setError(undefined)
    try {
      const endpoint = section.endpoint.endsWith('/') ? section.endpoint : `${section.endpoint}/`
      const { data } = await api.get(endpoint)
      const rows = Array.isArray(data) ? data : []
      if (!isMountedRef.current) return
      setItems(rows)
      if (section.key === 'programs') {
        await loadProgramCatalogs()
        if (!isMountedRef.current) return
        let removedProgram = false
        setSelectedProgram((prev) => {
          if (!prev) return prev
          const match = rows.find((row) => row.id === prev.id)
          if (!match) {
            removedProgram = true
            return null
          }
          return match
        })
        if (!isMountedRef.current) return
        if (removedProgram) {
          setShowProgramDetail(false)
        }
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al cargar'
      if (isMountedRef.current) setError(detail)
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [loadProgramCatalogs, section.endpoint, section.key])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (sortColumn && !columns.includes(sortColumn)) {
      setSortColumn(null)
    }
  }, [columns, sortColumn])

  useEffect(() => {
    let cancelled = false
    const relatedFields = section.fields
      .map((field) => ({ field, endpoint: endpointFor(field.name) }))
      .filter((entry): entry is { field: Field; endpoint: string } => Boolean(entry.endpoint))

    if (relatedFields.length === 0) {
      setSelectOptions({})
      return
    }

    const shouldFetchUsers = section.fields.some((field) => field.name === 'teacher_id') &&
      !section.fields.some((field) => field.name === 'user_id')

    ;(async () => {
      const accum: OptionMap = {}
      for (const { field, endpoint } of relatedFields) {
        try {
          const { data } = await api.get(endpoint)
          if (cancelled) return
          accum[field.name] = (Array.isArray(data) ? data : []).map((item: any) => ({
            value: String(item.id),
            label: labelForOption(item),
            raw: item,
          }))
        } catch (err) {
          console.error('No se pudo cargar catálogo relacionado', err)
        }
      }
      if (shouldFetchUsers) {
        try {
          const { data } = await api.get('/users/')
          if (cancelled) return
          accum.user_id = (Array.isArray(data) ? data : []).map((item: any) => ({
            value: String(item.id),
            label: labelForOption(item),
            raw: item,
          }))
        } catch (err) {
          console.error('No se pudo cargar catálogo de usuarios', err)
        }
      }
      if (!cancelled) setSelectOptions(accum)
    })()

    return () => {
      cancelled = true
    }
  }, [section.fields, section.key])

  const handleToggleSemesterStatus = useCallback(async (semesterId: number, nextIsActive: boolean) => {
    setUpdatingSemesterId(semesterId)
    setError(undefined)
    setSuccess(undefined)
    try {
      await api.patch(`/program-semesters/${semesterId}`, { is_active: nextIsActive })
      if (!isMountedRef.current) return
      setProgramSemesters((prev) =>
        prev.map((semester) => (semester.id === semesterId ? { ...semester, is_active: nextIsActive } : semester)),
      )
      setSuccess(nextIsActive ? 'Semestre activado' : 'Semestre desactivado')
    } catch (err: any) {
      console.error('No se pudo actualizar el semestre', err)
      if (isMountedRef.current) {
        const detail = err?.response?.data?.detail || err?.message || 'No se pudo actualizar el semestre'
        setError(detail)
      }
    } finally {
      if (isMountedRef.current) setUpdatingSemesterId(null)
    }
  }, [])

  const handleChangeSemesterState = useCallback(async (semesterId: number, nextState: SemesterState) => {
    setUpdatingSemesterStateId(semesterId)
    setError(undefined)
    setSuccess(undefined)
    try {
      const response = await api.patch(`/program-semesters/${semesterId}`, { state: nextState })
      const updatedSemester = response?.data
      if (!isMountedRef.current) return
      if (updatedSemester) {
        setProgramSemesters((prev) =>
          prev.map((semester) => (semester.id === semesterId ? { ...semester, ...updatedSemester } : semester)),
        )
      }
      await loadProgramCatalogs()
      if (!isMountedRef.current) return
      const successMessage =
        nextState === 'finished'
          ? 'Semestre marcado como finalizado'
          : nextState === 'current'
            ? 'Semestre marcado como actual'
            : 'Semestre marcado como planificado'
      setSuccess(successMessage)
    } catch (err: any) {
      console.error('No se pudo actualizar el estado del semestre', err)
      if (isMountedRef.current) {
        const detail = err?.response?.data?.detail || err?.message || 'No se pudo actualizar el estado del semestre'
        setError(detail)
      }
    } finally {
      if (isMountedRef.current) setUpdatingSemesterStateId(null)
    }
  }, [loadProgramCatalogs])

  const onSubmit = async (values: Record<string, any>) => {
    setError(undefined)
    setSuccess(undefined)
    try {
      const payload = normalizePayload(section.fields, values)
      if (editingId !== null) {
        const base = section.endpoint.endsWith('/') ? section.endpoint.slice(0, -1) : section.endpoint
        await api.put(`${base}/${editingId}`, payload)
        setSuccess('Actualizado correctamente')
      } else {
        const endpoint = section.endpoint.endsWith('/') ? section.endpoint : `${section.endpoint}/`
        await api.post(endpoint, payload)
        setSuccess('Creado correctamente')
      }
      setEditingId(null)
      reset({ ...emptyFormValues })
      await load()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al guardar'
      setError(detail)
    }
  }

  const onDelete = useCallback(async (id: number) => {
    setError(undefined)
    setSuccess(undefined)
    try {
      if (typeof window !== 'undefined') {
        const ok = window.confirm('¿Eliminar este registro?')
        if (!ok) return
      }
      const base = section.endpoint.endsWith('/') ? section.endpoint.slice(0, -1) : section.endpoint
      await api.delete(`${base}/${id}`)
      setSuccess('Eliminado correctamente')
      await load()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al eliminar'
      setError(detail)
    }
  }, [load, section.endpoint])

  const filteredAndSortedItems = useMemo(() => {
    const normalizedQuery = filterQuery.trim().toLowerCase()
    let data = items
    if (normalizedQuery) {
      data = data.filter((row) =>
        columns.some((column) => {
          const value = row[column]
          if (value === null || value === undefined) return false
          if (typeof value === 'object') {
            return JSON.stringify(value).toLowerCase().includes(normalizedQuery)
          }
          return String(value).toLowerCase().includes(normalizedQuery)
        }),
      )
    }

    if (section.key === 'courses') {
      data = data.filter((row: any) => {
        if (courseFilters.term && String(row.term ?? '').trim() !== courseFilters.term) return false
        if (courseFilters.subjectId) {
          const subjectId = row.subject_id ?? row.subject?.id
          if (String(subjectId ?? '') !== courseFilters.subjectId) return false
        }
        if (courseFilters.teacherId) {
          const teacherId = row.teacher_id ?? row.teacher?.id
          if (String(teacherId ?? '') !== courseFilters.teacherId) return false
        }
        if (courseFilters.modality) {
          const modality = row.modality ? String(row.modality).trim().toLowerCase() : ''
          if (modality !== courseFilters.modality) return false
        }
        return true
      })
    }

    if (sortColumn) {
      const directionMultiplier = sortDirection === 'asc' ? 1 : -1
      data = [...data].sort((a, b) => {
        const aValue = a[sortColumn]
        const bValue = b[sortColumn]
        if (aValue === bValue) return 0

        const parseValue = (value: any) => {
          if (value === null || value === undefined) return ''
          if (typeof value === 'number') return value
          if (typeof value === 'string') return value.toLowerCase()
          if (typeof value === 'boolean') return value ? 1 : 0
          if (value instanceof Date) return value.getTime()
          return JSON.stringify(value).toLowerCase()
        }

        const aParsed = parseValue(aValue)
        const bParsed = parseValue(bValue)

        if (typeof aParsed === 'number' && typeof bParsed === 'number') {
          return (aParsed - bParsed) * directionMultiplier
        }

        return String(aParsed).localeCompare(String(bParsed)) * directionMultiplier
      })
    }

    return data
  }, [columns, courseFilters.modality, courseFilters.subjectId, courseFilters.teacherId, courseFilters.term, filterQuery, items, section.key, sortColumn, sortDirection])

  const userMetadataMap = useMemo(() => {
    const map = new Map<number, OptionItem>()
    const options = selectOptions.user_id ?? []
    for (const option of options) {
      const id = Number(option.value)
      if (!Number.isFinite(id)) continue
      map.set(id, option)
    }
    return map
  }, [selectOptions])

  const userOptionMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const [id, option] of userMetadataMap.entries()) {
      const label = typeof option.label === 'string' ? option.label : String(option.label ?? '')
      const cleaned = stripCatalogLabel(label)
      map.set(id, cleaned ?? (label || `Usuario ${id}`))
    }
    return map
  }, [userMetadataMap])

  const programOptionMap = useMemo(() => {
    const map = new Map<number, string>()
    const options = selectOptions.program_id ?? []
    for (const option of options) {
      const id = Number(option.value)
      if (Number.isFinite(id)) {
        map.set(id, option.label)
      }
    }
    return map
  }, [selectOptions])

  const subjectOptionMap = useMemo(() => {
    const map = new Map<number, string>()
    const optionKeys: Array<keyof OptionMap> = ['subject_id', 'prerequisite_subject_ids']
    for (const key of optionKeys) {
      const options = selectOptions[key] ?? []
      for (const option of options) {
        const id = Number(option.value)
        if (Number.isFinite(id)) {
          map.set(id, option.label)
        }
      }
    }
    return map
  }, [selectOptions])

  const teacherMetadataFromItems = useMemo(() => {
    const map = new Map<number, TeacherMeta>()
    const rows = Array.isArray(items) ? items : []

    if (section.key === 'teachers') {
      for (const row of rows as any[]) {
        if (!row || typeof row !== 'object') continue
        const id = Number(row.id ?? row.teacher_id)
        if (!Number.isFinite(id)) continue
        const user = row.user ?? null
        const candidates: Array<string | null | undefined> = [
          user?.full_name,
          row.full_name,
          row.name,
          typeof row.label === 'string' ? stripCatalogLabel(row.label) : null,
        ]
        let name = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)
        if (!name && row.first_name) {
          const combined = `${row.first_name} ${row.last_name ?? ''}`.trim()
          name = combined || undefined
        }
        if (!name) continue
        const department = row.department ?? null
        const specialty = row.specialty ?? null
        const email = user?.email ?? row.email ?? null
        map.set(id, {
          name: String(name).trim(),
          department,
          specialty,
          email,
        })
      }
      return map
    }

    for (const row of rows as any[]) {
      if (!row || typeof row !== 'object') continue
      const teacher = row.teacher
      if (!teacher || typeof teacher !== 'object') continue
      const id = Number(teacher.id ?? row.teacher_id)
      if (!Number.isFinite(id)) continue
      const user = teacher.user ?? null
      const candidates: Array<string | null | undefined> = [
        user?.full_name,
        teacher.full_name,
        teacher.name,
        typeof teacher.label === 'string' ? stripCatalogLabel(teacher.label) : null,
      ]
      let name = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)
      if (!name) continue
      const department = teacher.department ?? null
      const specialty = teacher.specialty ?? null
      const email = user?.email ?? teacher.email ?? null
      map.set(id, {
        name: String(name).trim(),
        department,
        specialty,
        email,
      })
    }

    return map
  }, [items, section.key])

  const teacherMetadataMap = useMemo(() => {
    const map = new Map<number, TeacherMeta>(teacherMetadataFromItems)
    const options = selectOptions.teacher_id ?? []
    for (const option of options) {
      const id = Number(option.value)
      if (!Number.isFinite(id)) continue
      const raw = option.raw ?? {}
      const existing = map.get(id)
      const userFromRaw = raw?.user ?? null
      const userIdCandidate = raw?.user_id ?? raw?.userId ?? userFromRaw?.id ?? null
      const numericUserId = typeof userIdCandidate === 'number' ? userIdCandidate : Number(userIdCandidate)
      const cleanedLabel = typeof option.label === 'string' ? stripCatalogLabel(option.label) : null
      const userName = Number.isFinite(numericUserId) ? userOptionMap.get(numericUserId) : undefined
      const candidates: Array<string | null | undefined> = [
        typeof userFromRaw?.full_name === 'string' ? userFromRaw.full_name : undefined,
        raw?.full_name,
        raw?.name,
        cleanedLabel,
        userName,
        existing?.name,
      ]
      const nameCandidate = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)
      const name = nameCandidate ? String(nameCandidate).trim() : `Profesor ${id}`

      const department = raw?.department ?? existing?.department ?? null
      const specialty = raw?.specialty ?? existing?.specialty ?? null
      const emailCandidates: Array<string | null | undefined> = [
        userFromRaw?.email,
        raw?.email,
        Number.isFinite(numericUserId) ? userMetadataMap.get(numericUserId)?.raw?.email : undefined,
        existing?.email,
      ]
      const emailCandidate = emailCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)

      map.set(id, {
        name,
        department,
        specialty,
        email: emailCandidate ?? null,
      })
    }
    return map
  }, [selectOptions, teacherMetadataFromItems, userMetadataMap, userOptionMap])

  const teacherOptionMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const [id, meta] of teacherMetadataMap.entries()) {
      if (meta.name) map.set(id, meta.name)
    }
    if (map.size === 0) {
      const options = selectOptions.teacher_id ?? []
      for (const option of options) {
        const id = Number(option.value)
        if (Number.isFinite(id)) {
          const label = typeof option.label === 'string' ? option.label : String(option.label ?? '')
          const cleaned = stripCatalogLabel(label)
          map.set(id, cleaned ?? (label || `Profesor ${id}`))
        }
      }
    }
    return map
  }, [selectOptions, teacherMetadataMap])

  const programSemesterOptionMap = useMemo(() => {
    const map = new Map<number, string>()
    const options = selectOptions.program_semester_id ?? []
    for (const option of options) {
      const id = Number(option.value)
      if (Number.isFinite(id)) {
        map.set(id, option.label)
      }
    }
    return map
  }, [selectOptions])

  const resolveUserName = useCallback(
    (userId: number | string | null | undefined, fallback?: string | null) => {
      if (userId === null || userId === undefined) return fallback ?? null
      const numericId = typeof userId === 'number' ? userId : Number(userId)
      if (!Number.isFinite(numericId)) return fallback ?? null
      const label = userOptionMap.get(numericId)
      if (!label) return fallback ?? null
      return label
    },
    [userOptionMap],
  )

  const resolveProgramLabel = useCallback(
    (programId: number | string | null | undefined, fallback?: string | null) => {
      if (programId === null || programId === undefined) return fallback ?? null
      const numericId = typeof programId === 'number' ? programId : Number(programId)
      if (!Number.isFinite(numericId)) return fallback ?? null
      const label = programOptionMap.get(numericId)
      if (!label) return fallback ?? null
      return label.replace(/^\s*#?\s*/, '').trim()
    },
    [programOptionMap],
  )

  const resolveSubjectLabel = useCallback(
    (subjectId: number | string | null | undefined, fallback?: string | null) => {
      if (subjectId === null || subjectId === undefined) return fallback ?? null
      const numericId = typeof subjectId === 'number' ? subjectId : Number(subjectId)
      if (!Number.isFinite(numericId)) return fallback ?? null
      const label = subjectOptionMap.get(numericId)
      if (!label) return fallback ?? null
      return label.replace(/^\s*\d+\s*—\s*/, '').trim()
    },
    [subjectOptionMap],
  )

  const resolveTeacherLabel = useCallback(
    (teacherId: number | string | null | undefined, fallback?: string | null) => {
      if (teacherId === null || teacherId === undefined) return fallback ?? null
      const numericId = typeof teacherId === 'number' ? teacherId : Number(teacherId)
      if (!Number.isFinite(numericId)) return fallback ?? null
      const meta = teacherMetadataMap.get(numericId)
      if (meta?.name) return meta.name
      const label = teacherOptionMap.get(numericId)
      if (!label) return fallback ?? null
      return label
    },
    [teacherMetadataMap, teacherOptionMap],
  )

  const getTeacherMeta = useCallback(
    (teacherId: number | string | null | undefined): TeacherMeta | undefined => {
      if (teacherId === null || teacherId === undefined) return undefined
      const numericId = typeof teacherId === 'number' ? teacherId : Number(teacherId)
      if (!Number.isFinite(numericId)) return undefined
      return teacherMetadataMap.get(numericId)
    },
    [teacherMetadataMap],
  )

  const resolveProgramSemesterLabel = useCallback(
    (semesterId: number | string | null | undefined, fallback?: string | null) => {
      if (semesterId === null || semesterId === undefined) return fallback ?? null
      const numericId = typeof semesterId === 'number' ? semesterId : Number(semesterId)
      if (!Number.isFinite(numericId)) return fallback ?? null
      const label = programSemesterOptionMap.get(numericId)
      if (!label) return fallback ?? null
      return label.replace(/^\s*\d+\s*—\s*/, '').trim()
    },
    [programSemesterOptionMap],
  )

  const handleEditRow = useCallback((row: any) => {
    const values: Record<string, any> = {}
    for (const field of section.fields) {
      let value = row[field.name]
      if (value === null || value === undefined) continue
      if (field.type === 'time' && typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value)) {
        value = value.slice(0, 5)
      }
      if (section.key === 'timeslots' && field.name === 'day_of_week' && value != null) {
        value = String(value)
      }
      if (field.type === 'multiselect') {
        if (Array.isArray(value)) {
          values[field.name] = value.map((entry) => String(entry))
        } else if (typeof value === 'string' && value.trim()) {
          values[field.name] = value
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
        } else {
          values[field.name] = []
        }
        continue
      }
      values[field.name] = selectOptions[field.name] ? String(value) : value
    }
    reset(values)
    setEditingId(row.id ?? null)
    setError(undefined)
    setSuccess(undefined)
  }, [reset, section.fields, section.key, selectOptions])

  const renderStudentsView = useCallback(() => {
    if (section.key !== 'students') return null

    const students = filteredAndSortedItems as StudentRow[]

    const totalStudents = students.length
    const activeStudents = students.filter((student) =>
      String(student.status || '').toLowerCase() === 'active',
    ).length
    const currentYear = new Date().getFullYear()
    const newCohort = students.filter((student) => Number(student.enrollment_year) === currentYear).length

    const shiftLabels: Record<string, string> = {
      diurna: 'Diurna',
      vespertina: 'Vespertina',
      mixta: 'Mixta',
      ejecutiva: 'Ejecutiva',
    }
    const financingLabels: Record<string, string> = {
      gratuidad: 'Gratuidad',
      beca: 'Beca',
      credito: 'Crédito',
      particular: 'Autofinanciado',
      empresa: 'Convenio empresa',
    }
    const admissionLabels: Record<string, string> = {
      paes: 'PAES / PSU',
      pace: 'PACE',
      traslado: 'Traslado',
      especial: 'Vía especial',
      otra: 'Otro',
    }
    const modalityLabels: Record<string, string> = {
      in_person: 'Presencial',
      online: 'Online',
      hybrid: 'Híbrida',
    }
    const statusLabels: Record<string, string> = {
      active: 'Activo',
      suspended: 'Suspendido',
      graduated: 'Titulado',
      withdrawn: 'Retirado',
    }

    const shiftCounts = students.reduce((acc, student) => {
      const key = student.study_shift ? String(student.study_shift) : null
      if (!key) return acc
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    const sortedShiftEntries = Object.entries(shiftCounts).sort((a, b) => b[1] - a[1])
    const predominantShiftKey = sortedShiftEntries[0]?.[0] ?? null
    const predominantShiftCount = sortedShiftEntries[0]?.[1] ?? 0
    const predominantShiftLabel = predominantShiftKey ? shiftLabels[predominantShiftKey] ?? predominantShiftKey : 'Sin datos'

    const gratuidadCount = students.filter(
      (student) => String(student.financing_type || '') === 'gratuidad',
    ).length
    const financingKnown = students.filter((student) => Boolean(student.financing_type)).length
    const gratuidadShare = financingKnown > 0 ? Math.round((gratuidadCount / financingKnown) * 100) : null

    const priorityAdmissions = students
      .filter((student) => ['pace', 'especial'].includes(String(student.admission_type || '')))
      .length

    const statusColor = (status: string) => {
      const normalized = status.toLowerCase()
      if (normalized === 'active') return 'teal'
      if (normalized === 'suspended') return 'yellow'
      if (normalized === 'graduated') return 'indigo'
      if (normalized === 'withdrawn' || normalized === 'dropped') return 'red'
      return 'gray'
    }

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="indigo" size="lg" radius="md">
                <IconUsersGroup size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Estudiantes totales</Text>
                <Text fw={600}>{totalStudents}</Text>
                <Text size="xs" c="dimmed">Registros cargados en el sistema</Text>
                <Text size="xs" c="dimmed">Activos: {activeStudents}</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="teal" size="lg" radius="md">
                <IconCalendarPlus size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Cohorte {currentYear}</Text>
                <Text fw={600}>{newCohort}</Text>
                <Text size="xs" c="dimmed">Ingresos del año en curso</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="violet" size="lg" radius="md">
                <IconClockHour4 size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Jornada predominante</Text>
                <Text fw={600}>{predominantShiftLabel}</Text>
                <Text size="xs" c="dimmed">
                  {predominantShiftKey ? `${predominantShiftCount} estudiantes` : 'Sin información disponible'}
                </Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="orange" size="lg" radius="md">
                <IconAward size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Beneficio gratuidad</Text>
                <Text fw={600}>{gratuidadCount}</Text>
                <Text size="xs" c="dimmed">
                  {financingKnown > 0
                    ? `${gratuidadShare}% de ${financingKnown} con financiamiento informado`
                    : 'Sin información de financiamiento'}
                </Text>
                {priorityAdmissions > 0 ? (
                  <Text size="xs" c="dimmed">Admisión PACE / especial: {priorityAdmissions}</Text>
                ) : null}
              </Stack>
            </Group>
          </Card>
        </SimpleGrid>

        <ScrollArea.Autosize offsetScrollbars mah="60vh" type="always" scrollbarSize={10}>
          <div style={{ minWidth: 960, width: '100%', overflowX: 'auto' }}>
            <Table verticalSpacing="sm" horizontalSpacing="md" striped highlightOnHover withTableBorder style={{ tableLayout: 'fixed', minWidth: '100%' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '24%' }}>Estudiante</Table.Th>
                  <Table.Th style={{ width: '20%' }}>Programa</Table.Th>
                  <Table.Th style={{ width: '20%' }}>Trayectoria</Table.Th>
                  <Table.Th style={{ width: '18%' }}>Condición</Table.Th>
                  <Table.Th style={{ width: '18%' }}>Financiamiento</Table.Th>
                  <Table.Th style={{ width: '12%' }}>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {students.map((student) => {
                  const rawName =
                    student.full_name ||
                    student.user?.full_name ||
                    [student.first_name, student.last_name].filter(Boolean).join(' ') ||
                    null
                  const name =
                    resolveUserName(student.user_id, rawName) ||
                    rawName ||
                    `Estudiante ${student.id}`
                  const email = student.user?.email || student.email || 'Sin correo registrado'
                  const registration = student.registration_number || 'Sin matrícula'
                  const programName = student.program?.name || student.program?.code || (student.program_id ? `Programa #${student.program_id}` : 'No asignado')
                  const modalityKey = student.modality ? String(student.modality) : null
                  const modality = modalityKey ? modalityLabels[modalityKey] ?? modalityKey : null
                  const gradeLevel = student.grade_level || null
                  const enrollmentYear = student.enrollment_year ? String(student.enrollment_year) : '—'
                  const cohortYear = student.cohort_year ? String(student.cohort_year) : null
                  const currentTerm = student.current_term || null
                  const expectedGraduation = student.expected_graduation_date ? String(student.expected_graduation_date).slice(0, 10) : null
                  const statusKey = student.status ? String(student.status) : 'Sin estado'
                  const statusLabel = statusLabels[statusKey as keyof typeof statusLabels] ?? statusKey
                  const sectionLabel = student.section || null
                  const admissionKey = student.admission_type ? String(student.admission_type) : null
                  const admissionLabel = admissionKey ? admissionLabels[admissionKey] ?? admissionKey : null
                  const financingKey = student.financing_type ? String(student.financing_type) : null
                  const financingLabel = financingKey ? financingLabels[financingKey] ?? financingKey : null
                  const shiftKey = student.study_shift ? String(student.study_shift) : null
                  const shiftLabel = shiftKey ? shiftLabels[shiftKey] ?? shiftKey : null
                  const admissionDate = student.admission_date ? String(student.admission_date).slice(0, 10) : null

                  return (
                    <Table.Tr key={student.id ?? `student-${Math.random()}`}>
                      <Table.Td>
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                          <Avatar
                            size={40}
                            radius="xl"
                            src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`}
                            alt={name}
                          />
                          <Stack gap={2} style={{ maxWidth: '100%', overflow: 'hidden' }}>
                            <Text fw={600} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</Text>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</Text>
                            <Group gap="xs" wrap="wrap">
                              <Badge size="xs" variant="light" color="dark">Matrícula {registration}</Badge>
                              {shiftLabel ? <Badge size="xs" variant="outline" color="indigo">Jornada {shiftLabel}</Badge> : null}
                            </Group>
                          </Stack>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={500}>{programName}</Text>
                          {modality ? <Text size="xs" c="dimmed">Modalidad: {modality}</Text> : null}
                          {gradeLevel ? <Text size="xs" c="dimmed">Nivel: {gradeLevel}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={6}>
                          <Group gap="xs" wrap="wrap">
                            <Badge size="sm" color="indigo" variant="light">Ingreso {enrollmentYear}</Badge>
                            {cohortYear ? <Badge size="sm" color="gray" variant="light">Cohorte {cohortYear}</Badge> : null}
                          </Group>
                          {currentTerm ? <Text size="xs" c="dimmed">Semestre actual: {currentTerm}</Text> : null}
                          {expectedGraduation ? <Text size="xs" c="dimmed">Egreso estimado: {expectedGraduation}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={6}>
                          <Badge size="sm" color={statusColor(statusKey)} variant="filled">{statusLabel}</Badge>
                          {sectionLabel ? <Text size="xs" c="dimmed">Sección: {sectionLabel}</Text> : null}
                          {admissionLabel ? <Text size="xs" c="dimmed">Ingreso: {admissionLabel}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={6}>
                          {financingLabel ? (
                            <Badge size="sm" variant="outline" color="teal">{financingLabel}</Badge>
                          ) : (
                            <Text size="sm" c="dimmed">Sin información de financiamiento</Text>
                          )}
                          {admissionDate ? <Text size="xs" c="dimmed">Admisión: {admissionDate}</Text> : null}
                          {shiftLabel ? null : <Text size="xs" c="dimmed">Jornada no definida</Text>}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Ver detalle" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="indigo"
                              aria-label="Ver detalle del estudiante"
                              onClick={() => student.id !== undefined && navigate(`/dashboard/admin/students/${student.id}`)}
                            >
                              <IconSearch size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Editar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="dark"
                              aria-label="Editar estudiante"
                              onClick={() => handleEditRow(student)}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label="Eliminar estudiante"
                              onClick={() => student.id !== undefined && onDelete(student.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </div>
        </ScrollArea.Autosize>
      </Stack>
    )
  }, [filteredAndSortedItems, handleEditRow, navigate, onDelete, resolveUserName, section.key])

  const renderTeachersView = useCallback(() => {
    if (section.key !== 'teachers') return null

    const totalTeachers = filteredAndSortedItems.length
    const fullTimeTeachers = filteredAndSortedItems.filter((teacher) =>
      String(teacher.employment_type || '').toLowerCase() === 'full_time',
    ).length
    const currentYear = new Date().getFullYear()
    const recentHires = filteredAndSortedItems.filter((teacher) => {
      if (!teacher.hire_date) return false
      const hireDate = new Date(teacher.hire_date)
      return Number.isFinite(hireDate.getTime()) && hireDate.getFullYear() === currentYear
    }).length
    const tenureValues = filteredAndSortedItems
      .map((teacher) => {
        if (!teacher.hire_date) return null
        const hireDate = new Date(teacher.hire_date)
        if (!Number.isFinite(hireDate.getTime())) return null
        const diffMs = Date.now() - hireDate.getTime()
        if (diffMs < 0) return 0
        return diffMs / (1000 * 60 * 60 * 24 * 365.25)
      })
      .filter((value): value is number => value !== null)
    const averageTenure = tenureValues.length > 0 ? tenureValues.reduce((acc, value) => acc + value, 0) / tenureValues.length : null

    const employmentColor = (employmentType: string) => {
      const normalized = employmentType.toLowerCase()
      if (normalized === 'full_time') return 'teal'
      if (normalized === 'part_time') return 'indigo'
      if (normalized === 'contract') return 'orange'
      return 'gray'
    }

    const formatEmploymentLabel = (employmentType?: string) => {
      if (!employmentType) return 'Sin definir'
      return employmentType.replace(/_/g, ' ')
    }

    const formatDate = (value: string | undefined) => {
      if (!value) return '—'
      const parsed = new Date(value)
      if (!Number.isFinite(parsed.getTime())) return String(value)
      return parsed.toLocaleDateString()
    }

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="indigo" size="lg" radius="md">
                <IconChalkboard size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Docentes registrados</Text>
                <Text fw={600}>{totalTeachers}</Text>
                <Text size="xs" c="dimmed">Plantilla total en el sistema</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="teal" size="lg" radius="md">
                <IconUsersGroup size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Full time</Text>
                <Text fw={600}>{fullTimeTeachers}</Text>
                <Text size="xs" c="dimmed">Contratos a tiempo completo</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="violet" size="lg" radius="md">
                <IconCalendarPlus size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Ingresos {currentYear}</Text>
                <Text fw={600}>{recentHires}</Text>
                <Text size="xs" c="dimmed">Nuevas contrataciones del año</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="gray" size="lg" radius="md">
                <IconStar size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Tenencia promedio</Text>
                <Text fw={600}>{averageTenure !== null ? `${averageTenure.toFixed(1)} años` : '—'}</Text>
                <Text size="xs" c="dimmed">Desde la fecha de contratación</Text>
              </Stack>
            </Group>
          </Card>
        </SimpleGrid>

        <ScrollArea.Autosize offsetScrollbars mah="60vh" type="always" scrollbarSize={10}>
          <div style={{ minWidth: 880, width: '100%', overflowX: 'auto' }}>
            <Table verticalSpacing="sm" horizontalSpacing="md" striped highlightOnHover withTableBorder style={{ tableLayout: 'fixed', minWidth: '100%' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '28%' }}>Docente</Table.Th>
                  <Table.Th style={{ width: '24%' }}>Departamento & especialidad</Table.Th>
                  <Table.Th style={{ width: '20%' }}>Detalles laborales</Table.Th>
                  <Table.Th style={{ width: '20%' }}>Contacto y oficina</Table.Th>
                  <Table.Th style={{ width: '12%' }}>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredAndSortedItems.map((teacher) => {
                  const rawName =
                    teacher.full_name ||
                    teacher.user?.full_name ||
                    [teacher.first_name, teacher.last_name].filter(Boolean).join(' ') ||
                    null
                  const name =
                    resolveUserName(teacher.user_id, rawName) ||
                    rawName ||
                    `Docente ${teacher.id}`
                  const email = teacher.user?.email || teacher.email || 'Sin correo registrado'
                  const phone = teacher.phone || 'Sin teléfono'
                  const department = teacher.department || 'Sin departamento'
                  const specialty = teacher.specialty || null
                  const employmentType = String(teacher.employment_type || 'Sin definir')
                  const hireDateFormatted = formatDate(teacher.hire_date)
                  const office = teacher.office || 'Sin oficina'
                  const bio = teacher.bio ? String(teacher.bio) : null
                  return (
                    <Table.Tr key={teacher.id ?? `teacher-${Math.random()}`}>
                      <Table.Td>
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                          <Avatar
                            size={40}
                            radius="xl"
                            src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`}
                            alt={name}
                          />
                          <Stack gap={2} style={{ maxWidth: '100%', overflow: 'hidden' }}>
                            <Text fw={600} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</Text>
                            <Group gap="xs" wrap="wrap">
                              <Badge size="xs" variant="light" color={employmentColor(employmentType)}>
                                {formatEmploymentLabel(employmentType)}
                              </Badge>
                              <Badge size="xs" variant="outline" color="gray">
                                ID {teacher.id ?? '—'}
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</Text>
                          </Stack>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={500}>{department}</Text>
                          {specialty ? <Text size="xs" c="dimmed">Especialidad: {specialty}</Text> : null}
                          {bio ? <Text size="xs" c="dimmed" lineClamp={2}>{bio}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text size="sm" c="dimmed">Contratación: {hireDateFormatted}</Text>
                          {teacher.hire_date ? (
                            <Text size="xs" c="dimmed">
                              Antigüedad estimada: {
                                (() => {
                                  if (!Number.isFinite(new Date(teacher.hire_date).getTime())) return '—'
                                  const diffMs = Date.now() - new Date(teacher.hire_date).getTime()
                                  if (diffMs < 0) return '—'
                                  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25)
                                  if (years < 1) {
                                    const months = diffMs / (1000 * 60 * 60 * 24 * 30.4375)
                                    return `${Math.max(1, Math.floor(months))} meses`
                                  }
                                  return `${years.toFixed(1)} años`
                                })()
                              }
                            </Text>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Group gap="xs">
                            <IconPhone size={14} color="var(--mantine-color-gray-6)" />
                            <Text size="sm">{phone}</Text>
                          </Group>
                          <Text size="xs" c="dimmed">Oficina: {office}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Ver detalle" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="indigo"
                              aria-label="Ver detalle del docente"
                              onClick={() =>
                                teacher.id !== undefined && navigate(`/dashboard/admin/teachers/${teacher.id}`)
                              }
                            >
                              <IconSearch size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Editar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="dark"
                              aria-label="Editar docente"
                              onClick={() => handleEditRow(teacher)}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label="Eliminar docente"
                              onClick={() => teacher.id !== undefined && onDelete(teacher.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </div>
        </ScrollArea.Autosize>
      </Stack>
    )
  }, [filteredAndSortedItems, handleEditRow, navigate, onDelete, resolveUserName, section.key])

  const renderCoursesView = useCallback(() => {
    if (section.key !== 'courses') return null

    const courses = filteredAndSortedItems as Course[]
    const totalCourses = courses.length
    const totalWeeklyHours = courses.reduce(
      (acc, course) => acc + (Number(course.weekly_hours) || 0),
      0,
    )
    const averageWeeklyHours = totalCourses > 0 ? totalWeeklyHours / totalCourses : 0
    const totalCapacity = courses.reduce(
      (acc, course) => acc + (Number(course.capacity) || 0),
      0,
    )
    const formatModalityLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
    const modalityCounts = courses.reduce((acc, course) => {
      const modality = course.modality ? String(course.modality).trim().toLowerCase() : ''
      if (!modality) return acc
      acc[modality] = (acc[modality] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    const predominantModalityEntry = Object.entries(modalityCounts).sort((a, b) => b[1] - a[1])[0]
    const predominantModalityLabel = predominantModalityEntry
      ? `${formatModalityLabel(predominantModalityEntry[0])} (${predominantModalityEntry[1]})`
      : 'Sin modalidad predominante'

    const uniqueTerms = Array.from(new Set(courses.map((course) => course.term?.trim()).filter(Boolean) as string[])).sort()
    const uniqueModalities = Array.from(new Set(
      courses.map((course) => course.modality ? String(course.modality).trim().toLowerCase() : null).filter(Boolean) as string[],
    )).sort()
    const languageLabels: Record<string, string> = { es: 'Español', en: 'Inglés', pt: 'Portugués' }

    const subjectOptions = (selectOptions.subject_id ?? []).map((option) => ({ value: option.value, label: option.label }))
    const teacherOptionMapEntries = new Map<string, TeacherOption>()
    for (const [id, meta] of teacherMetadataMap.entries()) {
      teacherOptionMapEntries.set(String(id), { value: String(id), label: meta.name, meta })
    }
    for (const option of selectOptions.teacher_id ?? []) {
      const key = String(option.value)
      if (teacherOptionMapEntries.has(key)) continue
      const rawLabel = typeof option.label === 'string' ? option.label : String(option.label ?? '')
      const raw = option.raw ?? {}
      const userIdCandidate = raw?.user_id ?? raw?.userId ?? raw?.user?.id ?? null
      const numericUserId = typeof userIdCandidate === 'number' ? userIdCandidate : Number(userIdCandidate)
      const catalogName = stripCatalogLabel(rawLabel)
      const userName = Number.isFinite(numericUserId) ? userOptionMap.get(numericUserId) : undefined
      const fallbackMeta = getTeacherMeta(option.value) ?? {
        name: userName ?? catalogName ?? (rawLabel || `Profesor ${option.value}`),
        department: raw?.department ?? null,
        specialty: raw?.specialty ?? null,
        email: raw?.user?.email ?? raw?.email ?? (Number.isFinite(numericUserId) ? userMetadataMap.get(numericUserId)?.raw?.email ?? null : null),
      }
      teacherOptionMapEntries.set(key, {
        ...option,
        value: key,
        label: fallbackMeta.name,
        meta: fallbackMeta,
      })
    }
    const teacherOptions = Array.from(teacherOptionMapEntries.values())

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="indigo" size="lg" radius="md">
                <IconCalendarPlus size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Cursos activos</Text>
                <Text fw={600}>{totalCourses}</Text>
                <Text size="xs" c="dimmed">Ofertas disponibles por término</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="teal" size="lg" radius="md">
                <IconClockHour4 size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Carga semanal total</Text>
                <Text fw={600}>{totalWeeklyHours.toFixed(1)} h</Text>
                <Text size="xs" c="dimmed">Promedio {averageWeeklyHours.toFixed(1)} h por curso</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="violet" size="lg" radius="md">
                <IconUsersGroup size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Capacidad ofertada</Text>
                <Text fw={600}>{totalCapacity}</Text>
                <Text size="xs" c="dimmed">Suma de cupos disponibles</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="orange" size="lg" radius="md">
                <IconChalkboard size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Modalidad predominante</Text>
                <Text fw={600}>{predominantModalityLabel}</Text>
              </Stack>
            </Group>
          </Card>
        </SimpleGrid>

        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Filtrar por término"
            placeholder="Todos los periodos"
            data={uniqueTerms.map((term) => ({ value: term, label: term }))}
            value={courseFilters.term}
            onChange={(value) => setCourseFilters((prev) => ({ ...prev, term: value }))}
            clearable
            searchable
            style={{ flex: '1 1 180px', maxWidth: 220 }}
          />
          <Select
            label="Filtrar por asignatura"
            placeholder="Todas las asignaturas"
            data={subjectOptions}
            value={courseFilters.subjectId}
            onChange={(value) => setCourseFilters((prev) => ({ ...prev, subjectId: value }))}
            clearable
            searchable
            style={{ flex: '1 1 240px', maxWidth: 280 }}
          />
          <Select
            label="Filtrar por profesor"
            placeholder="Todos los profesores"
            data={teacherOptions}
            value={courseFilters.teacherId}
            onChange={(value) => setCourseFilters((prev) => ({ ...prev, teacherId: value }))}
            clearable
            searchable
            style={{ flex: '1 1 240px', maxWidth: 280 }}
            renderOption={(input) => {
              const { option, checked } = input
              const meta = (option as TeacherOption).meta
              const name = meta?.name ?? option.label
              const subtitle = [meta?.department, meta?.specialty].filter(Boolean).join(' · ')
              return (
                <Group gap="sm" justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <Avatar
                      size={28}
                      radius="xl"
                      src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`}
                      alt={name}
                    />
                    <Stack gap={2} style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <Text fw={500} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</Text>
                      {subtitle ? (
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </Stack>
                  </Group>
                  {checked ? <CheckIcon size={14} /> : null}
                </Group>
              )
            }}
          />
          <Select
            label="Filtrar por modalidad"
            placeholder="Todas las modalidades"
            data={uniqueModalities.map((modality) => ({
              value: modality,
              label: formatModalityLabel(modality),
            }))}
            value={courseFilters.modality}
            onChange={(value) => setCourseFilters((prev) => ({ ...prev, modality: value }))}
            clearable
            searchable
            style={{ flex: '1 1 180px', maxWidth: 220 }}
          />
          {(courseFilters.term || courseFilters.subjectId || courseFilters.teacherId || courseFilters.modality) && (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setCourseFilters({ term: null, subjectId: null, teacherId: null, modality: null })}
            >
              Limpiar filtros de cursos
            </Button>
          )}
        </Group>

        <ScrollArea.Autosize offsetScrollbars mah="60vh" type="always" scrollbarSize={10}>
          <div style={{ minWidth: 1024, width: '100%', overflowX: 'auto' }}>
            <Table verticalSpacing="sm" horizontalSpacing="md" striped highlightOnHover withTableBorder style={{ tableLayout: 'fixed', minWidth: '100%' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '26%' }}>Curso</Table.Th>
                  <Table.Th style={{ width: '24%' }}>Docente y modalidad</Table.Th>
                  <Table.Th style={{ width: '24%' }}>Periodo y semestre</Table.Th>
                  <Table.Th style={{ width: '14%' }}>Carga horaria</Table.Th>
                  <Table.Th style={{ width: '12%' }}>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {courses.map((course) => {
                  const subjectLabel =
                    course.subject?.name ||
                    resolveSubjectLabel(course.subject_id, course.subject?.label || null) ||
                    (course.subject_id ? `Asignatura #${course.subject_id}` : 'Sin asignatura vinculada')
                  const teacherId = course.teacher?.id ?? course.teacher_id
                  const teacherMeta = getTeacherMeta(teacherId)
                  const teacherLabel =
                    course.teacher?.user?.full_name ||
                    teacherMeta?.name ||
                    resolveTeacherLabel(teacherId, null) ||
                    (teacherId ? `Profesor #${teacherId}` : 'Docente por confirmar')
                  const teacherEmail = course.teacher?.user?.email || teacherMeta?.email || null
                  const teacherDepartment = course.teacher?.department ?? teacherMeta?.department ?? null
                  const teacherSpecialty = course.teacher?.specialty ?? teacherMeta?.specialty ?? null
                  const modalityRaw = course.modality ? String(course.modality).trim() : ''
                  const modalityLabel = modalityRaw ? formatModalityLabel(modalityRaw.toLowerCase()) : 'Sin modalidad'
                  const term = course.term || 'Periodo sin definir'
                  const group = course.group ? `Grupo ${course.group}` : null
                  const semesterLabel = resolveProgramSemesterLabel(course.program_semester_id, null)
                  const weeklyHours = Number(course.weekly_hours) || 0
                  const capacity = Number(course.capacity) || 0
                  const languageRaw = course.language ? String(course.language).trim().toLowerCase() : ''
                  const languageLabel = languageRaw ? languageLabels[languageRaw] ?? languageRaw.toUpperCase() : null
                  const scheduleWindow = (() => {
                    const start = course.start_date ? String(course.start_date).slice(0, 10) : null
                    const end = course.end_date ? String(course.end_date).slice(0, 10) : null
                    if (!start && !end) return null
                    return [start ?? 'Sin inicio', end ?? 'Sin término'].join(' → ')
                  })()

                  return (
                    <Table.Tr key={course.id ?? `course-${Math.random()}`}>
                      <Table.Td>
                        <Stack gap={4}>
                          <Group justify="space-between" gap="xs">
                            <Text fw={600} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subjectLabel}</Text>
                            <Badge size="xs" variant="light" color="dark">ID {course.id}</Badge>
                          </Group>
                          <Group gap="xs" wrap="wrap">
                            <Badge size="sm" variant="light" color="indigo">{term}</Badge>
                            {group ? <Badge size="sm" variant="outline" color="gray">{group}</Badge> : null}
                            {languageLabel ? <Badge size="sm" variant="outline" color="teal">Idioma {languageLabel}</Badge> : null}
                          </Group>
                          {course.syllabus_url ? (
                            <Text size="xs" c="dimmed" component="a" href={course.syllabus_url} target="_blank" rel="noreferrer">
                              Syllabus disponible
                            </Text>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={500}>{teacherLabel}</Text>
                          <Group gap="xs" wrap="wrap">
                            <Badge size="sm" variant="light" color="orange">{modalityLabel}</Badge>
                            {teacherDepartment ? (
                              <Badge size="sm" variant="outline" color="gray">{teacherDepartment}</Badge>
                            ) : null}
                            {teacherSpecialty ? (
                              <Badge size="sm" variant="outline" color="violet">{teacherSpecialty}</Badge>
                            ) : null}
                          </Group>
                          {teacherEmail ? <Text size="xs" c="dimmed">{teacherEmail}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text size="sm" fw={500}>{semesterLabel ?? 'Semestre sin asignar'}</Text>
                          {scheduleWindow ? <Text size="xs" c="dimmed">{scheduleWindow}</Text> : null}
                          {course.location_notes ? <Text size="xs" c="dimmed" lineClamp={2}>{course.location_notes}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Badge size="sm" variant="light" color="teal">{weeklyHours} h/sem</Badge>
                          <Badge size="sm" variant="light" color="violet">Cupos {capacity}</Badge>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Editar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="dark"
                              aria-label="Editar curso"
                              onClick={() => handleEditRow(course)}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label="Eliminar curso"
                              onClick={() => course.id !== undefined && onDelete(course.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </div>
        </ScrollArea.Autosize>
      </Stack>
    )
  }, [courseFilters, filteredAndSortedItems, getTeacherMeta, handleEditRow, onDelete, resolveProgramSemesterLabel, resolveSubjectLabel, resolveTeacherLabel, section.key, selectOptions, teacherMetadataMap, userMetadataMap, userOptionMap])

  const renderSubjectsView = useCallback(() => {
    if (section.key !== 'subjects') return null

    const subjects = filteredAndSortedItems as Subject[]
    const totalSubjects = subjects.length
    const totalPedagogicalHours = subjects.reduce(
      (acc, subject) => acc + (Number(subject.pedagogical_hours_per_week) || 0),
      0,
    )
    const averagePedagogicalHours = totalSubjects > 0 ? totalPedagogicalHours / totalSubjects : 0
    const averageAutonomousHours = subjects.reduce(
      (acc, subject) => acc + (Number(subject.weekly_autonomous_work_hours) || 0),
      0,
    ) / (totalSubjects || 1)
    const laboratorySubjects = subjects.filter(
      (subject) => Number(subject.laboratory_hours_per_week) > 0,
    ).length
    const departmentCounts = subjects.reduce((acc, subject) => {
      const dept = subject.department ? String(subject.department).trim() : ''
      if (!dept) return acc
      acc[dept] = (acc[dept] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    const topDepartmentEntry = Object.entries(departmentCounts).sort((a, b) => b[1] - a[1])[0]
    const topDepartmentLabel = topDepartmentEntry
      ? `${topDepartmentEntry[0]} (${topDepartmentEntry[1]})`
      : 'Sin departamento predominante'

    return (
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="indigo" size="lg" radius="md">
                <IconBooks size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Asignaturas totales</Text>
                <Text fw={600}>{totalSubjects}</Text>
                <Text size="xs" c="dimmed">Registros disponibles para planificación</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="teal" size="lg" radius="md">
                <IconClockHour4 size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Carga pedagógica semanal</Text>
                <Text fw={600}>{totalPedagogicalHours.toFixed(1)} h</Text>
                <Text size="xs" c="dimmed">Promedio {averagePedagogicalHours.toFixed(1)} h por asignatura</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="violet" size="lg" radius="md">
                <IconFlask size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Laboratorio</Text>
                <Text fw={600}>{laboratorySubjects}</Text>
                <Text size="xs" c="dimmed">Asignaturas con horas de laboratorio</Text>
              </Stack>
            </Group>
          </Card>
          <Card withBorder radius="md" padding="md">
            <Group gap="md">
              <ActionIcon variant="light" color="orange" size="lg" radius="md">
                <IconClipboardList size={18} />
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Trabajo autónomo</Text>
                <Text fw={600}>{averageAutonomousHours.toFixed(1)} h</Text>
                <Text size="xs" c="dimmed">Departamento clave: {topDepartmentLabel}</Text>
              </Stack>
            </Group>
          </Card>
        </SimpleGrid>

        <ScrollArea.Autosize offsetScrollbars mah="60vh" type="always" scrollbarSize={10}>
          <div style={{ minWidth: 960, width: '100%', overflowX: 'auto' }}>
            <Table verticalSpacing="sm" horizontalSpacing="md" striped highlightOnHover withTableBorder style={{ tableLayout: 'fixed', minWidth: '100%' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '28%' }}>Asignatura</Table.Th>
                  <Table.Th style={{ width: '24%' }}>Plan y departamento</Table.Th>
                  <Table.Th style={{ width: '26%' }}>Distribución de horas</Table.Th>
                  <Table.Th style={{ width: '20%' }}>Detalles</Table.Th>
                  <Table.Th style={{ width: '12%' }}>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {subjects.map((subject) => {
                  const name = subject.name || subject.label || `Asignatura ${subject.id}`
                  const code = subject.code || null
                  const description = subject.description || null
                  const programLabel =
                    subject.program?.name ||
                    subject.program?.code ||
                    resolveProgramLabel(subject.program_id, null) ||
                    (subject.program_id ? `Programa #${subject.program_id}` : 'Sin programa asociado')
                  const department = subject.department || null
                  const level = subject.level || null
                  const pedagogicalHours = Number(subject.pedagogical_hours_per_week) || 0
                  const theoreticalHours = Number(subject.theoretical_hours_per_week) || 0
                  const practicalHours = Number(subject.practical_hours_per_week) || 0
                  const laboratoryHours = Number(subject.laboratory_hours_per_week) || 0
                  const autonomousHours = Number(subject.weekly_autonomous_work_hours) || 0
                  const contactHours = theoreticalHours + practicalHours + laboratoryHours
                  const prerequisiteIds = Array.isArray(subject.prerequisite_subject_ids)
                    ? subject.prerequisite_subject_ids
                    : []

                  return (
                    <Table.Tr key={subject.id ?? `subject-${Math.random()}`}>
                      <Table.Td>
                        <Stack gap={4}>
                          <Group gap="xs" align="center">
                            <Text fw={600} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</Text>
                            {code ? <Badge size="xs" color="dark" variant="light">{code}</Badge> : null}
                          </Group>
                          {description ? <Text size="xs" c="dimmed" lineClamp={2}>{description}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={500}>{programLabel}</Text>
                          {department ? <Text size="xs" c="dimmed">Departamento: {department}</Text> : null}
                          {level ? <Text size="xs" c="dimmed">Nivel: {level}</Text> : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="wrap">
                          <Badge size="sm" variant="light" color="indigo">Pedagógicas {pedagogicalHours.toFixed(1)} h/sem</Badge>
                          {theoreticalHours > 0 ? (
                            <Badge size="sm" variant="light" color="teal">Teóricas {theoreticalHours.toFixed(1)} h/sem</Badge>
                          ) : null}
                          {practicalHours > 0 ? (
                            <Badge size="sm" variant="light" color="green">Prácticas {practicalHours.toFixed(1)} h/sem</Badge>
                          ) : null}
                          {laboratoryHours > 0 ? (
                            <Badge size="sm" variant="light" color="grape">Laboratorio {laboratoryHours.toFixed(1)} h/sem</Badge>
                          ) : null}
                          {autonomousHours > 0 ? (
                            <Badge size="sm" variant="outline" color="blue">Autónomo {autonomousHours.toFixed(1)} h/sem</Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text size="xs" c="dimmed">Contacto total: {contactHours.toFixed(1)} h/sem</Text>
                          {autonomousHours > 0 ? (
                            <Text size="xs" c="dimmed">Trabajo autónomo: {autonomousHours.toFixed(1)} h/sem</Text>
                          ) : null}
                          <Text size="xs" c="dimmed">ID interno: {subject.id}</Text>
                          {prerequisiteIds.length > 0 ? (
                            <Stack gap={2}>
                              <Text size="xs" c="dimmed">Prerrequisitos:</Text>
                              <Group gap="xs" wrap="wrap">
                                {prerequisiteIds.map((prereqId) => (
                                  <Badge key={`${subject.id}-prereq-${prereqId}`} size="xs" color="gray" variant="light">
                                    {resolveSubjectLabel(prereqId, `Asignatura #${prereqId}`)}
                                  </Badge>
                                ))}
                              </Group>
                            </Stack>
                          ) : (
                            <Text size="xs" c="dimmed">Prerrequisitos: ninguno</Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Editar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="dark"
                              aria-label="Editar asignatura"
                              onClick={() => handleEditRow(subject)}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label="Eliminar asignatura"
                              onClick={() => subject.id !== undefined && onDelete(subject.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </div>
        </ScrollArea.Autosize>
      </Stack>
    )
  }, [filteredAndSortedItems, handleEditRow, onDelete, resolveProgramLabel, resolveSubjectLabel, section.key])

  return (
    <Stack gap="xl">
      <Card radius="lg" padding="xl" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                Gestión de {section.title.toLowerCase()}
              </Text>
              <Title order={3}>{section.title}</Title>
              <Text size="sm" c="dimmed">{section.description}</Text>
            </div>
            <Stack gap={4} align="flex-end">
              <Badge variant="light" color="gray">Endpoint {section.endpoint}</Badge>
              {editingId !== null && <Badge color="teal" variant="light">Editando #{editingId}</Badge>}
            </Stack>
          </Group>

          {error && (
            <Alert color="red" variant="light" title="Ocurrió un problema">
              {error}
            </Alert>
          )}
          {success && (
            <Alert color="teal" variant="light" title="Acción exitosa">
              {success}
            </Alert>
          )}

          {section.key === 'timeslots' && (
            <Stack gap="md">
              <TimeslotBulkBuilder existing={items as TimeslotRecord[]} onCreated={load} />
              <TimeslotOverview slots={items as TimeslotRecord[]} onDelete={(id) => onDelete(id)} />
            </Stack>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack gap="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                {section.fields.map((field) => {
                  const relationOptions = selectOptions[field.name]
                  if (section.key === 'timeslots' && field.name === 'day_of_week') {
                    const dayOptions = WEEKDAY_LABELS.map((label, index) => ({ value: String(index), label }))
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <Select
                            label={field.label || field.name}
                            data={dayOptions}
                            value={controllerField.value ?? ''}
                            onChange={(value) => controllerField.onChange(value ?? '')}
                            placeholder="Selecciona un día"
                            error={(errors as any)[field.name]?.message as string | undefined}
                            nothingFoundMessage="Sin coincidencias"
                          />
                        )}
                      />
                    )
                  }
                  if (field.name === 'teacher_id' && relationOptions && relationOptions.length > 0) {
                    const teacherOptions: TeacherOption[] = relationOptions.map((option) => {
                      const rawLabel = typeof option.label === 'string' ? option.label : String(option.label ?? '')
                      const raw = option.raw ?? {}
                      const userIdCandidate = raw?.user_id ?? raw?.userId ?? raw?.user?.id ?? null
                      const numericUserId = typeof userIdCandidate === 'number' ? userIdCandidate : Number(userIdCandidate)
                      const catalogName = stripCatalogLabel(rawLabel)
                      const userName = Number.isFinite(numericUserId) ? userOptionMap.get(numericUserId) : undefined
                      const meta = getTeacherMeta(option.value) ?? {
                        name: userName ?? catalogName ?? (rawLabel || `Profesor ${option.value}`),
                        department: raw?.department ?? null,
                        specialty: raw?.specialty ?? null,
                        email: raw?.user?.email ?? raw?.email ?? (Number.isFinite(numericUserId) ? userMetadataMap.get(numericUserId)?.raw?.email ?? null : null),
                      }
                      return {
                        ...option,
                        label: meta.name,
                        meta,
                      }
                    })
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <Select
                            label={field.label || field.name}
                            placeholder={field.placeholder || 'Selecciona un profesor'}
                            data={teacherOptions}
                            value={controllerField.value ?? ''}
                            onChange={(value) => controllerField.onChange(value ?? '')}
                            error={(errors as any)[field.name]?.message as string | undefined}
                            searchable
                            clearable={!field.required}
                            nothingFoundMessage="Sin resultados"
                            renderOption={(input) => {
                              const { option } = input
                              const meta = (option as TeacherOption).meta ?? null
                              const name = meta?.name ?? option.label
                              const subtitle = [meta?.department, meta?.specialty].filter(Boolean).join(' · ')
                              return (
                                <Group gap="sm">
                                  <Avatar
                                    size={32}
                                    radius="xl"
                                    src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`}
                                    alt={name}
                                  />
                                  <Stack gap={2} style={{ flex: '1 1 auto', minWidth: 0 }}>
                                    <Text fw={500} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {name}
                                    </Text>
                                    {subtitle ? (
                                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {subtitle}
                                      </Text>
                                    ) : null}
                                  </Stack>
                                </Group>
                              )
                            }}
                          />
                        )}
                      />
                    )
                  }
                  if (field.type === 'multiselect') {
                    const data = relationOptions ?? field.options ?? []
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <MultiSelect
                            label={field.label || field.name}
                            placeholder={field.placeholder || (field.required ? 'Selecciona uno o más valores' : 'Opcional')}
                            data={data}
                            value={Array.isArray(controllerField.value) ? controllerField.value : []}
                            onChange={(value) => controllerField.onChange(value)}
                            error={(errors as any)[field.name]?.message as string | undefined}
                            searchable
                            clearable
                            nothingFoundMessage="Sin resultados"
                          />
                        )}
                      />
                    )
                  }
                  if (relationOptions && relationOptions.length > 0) {
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <Select
                            label={field.label || field.name}
                            placeholder={field.placeholder || (field.required ? 'Requerido' : 'Opcional')}
                            data={relationOptions}
                            value={controllerField.value ?? ''}
                            onChange={(value) => controllerField.onChange(value ?? '')}
                            error={(errors as any)[field.name]?.message as string | undefined}
                            searchable
                            clearable={!field.required}
                            nothingFoundMessage="Sin resultados"
                          />
                        )}
                      />
                    )
                  }

                  if (field.type === 'select') {
                    const data = field.options ?? []
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <Select
                            label={field.label || field.name}
                            placeholder={field.placeholder || 'Selecciona una opción'}
                            data={data}
                            value={controllerField.value ?? ''}
                            onChange={(value) => controllerField.onChange(value ?? '')}
                            error={(errors as any)[field.name]?.message as string | undefined}
                            searchable={data.length > 6}
                            clearable={!field.required}
                            nothingFoundMessage="Sin resultados"
                          />
                        )}
                      />
                    )
                  }

                  if (field.type === 'checkbox') {
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <Checkbox
                            label={field.label || field.name}
                            checked={Boolean(controllerField.value)}
                            onChange={(event) => controllerField.onChange(event.currentTarget.checked)}
                          />
                        )}
                      />
                    )
                  }

                  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'
                  const step = field.type === 'number' ? 'any' : undefined
                  return (
                    <TextInput
                      key={field.name}
                      label={field.label || field.name}
                      type={inputType}
                      placeholder={field.placeholder || field.name}
                      error={(errors as any)[field.name]?.message as string | undefined}
                      aria-invalid={errors[field.name] ? 'true' : 'false'}
                      step={step}
                      {...register(field.name)}
                    />
                  )
                })}
              </SimpleGrid>

              <Group justify="flex-end" gap="sm">
                <Button type="submit" color="dark" loading={isSubmitting} leftSection={<IconClipboardList size={16} />}>
                  {editingId !== null ? 'Guardar cambios' : 'Crear registro'}
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    reset({ ...emptyFormValues })
                    setEditingId(null)
                    setError(undefined)
                    setSuccess(undefined)
                  }}
                >
                  Limpiar formulario
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Card>

      <Card radius="lg" padding="xl" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={600}>Registros actuales</Text>
              <Text size="sm" c="dimmed">
                Sincroniza y administra los datos del dominio seleccionado.
              </Text>
            </div>
            <Group gap="xs" align="center">
              <Badge color="indigo" variant="light">
                {filteredAndSortedItems.length}
                {items.length !== filteredAndSortedItems.length ? ` / ${items.length}` : ''} registros
              </Badge>
              <Tooltip label="Actualizar" withArrow>
                <ActionIcon variant="light" color="indigo" onClick={() => load()} aria-label="Actualizar registros">
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <Divider />

          <Stack gap="sm">
            <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
              <TextInput
                label="Buscar"
                placeholder="Filtra por cualquier columna"
                leftSection={<IconSearch size={16} />}
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.currentTarget.value)}
                style={{ flex: '1 1 220px', maxWidth: 320 }}
                rightSection={filterQuery ? <CloseButton aria-label="Limpiar filtro" onClick={() => setFilterQuery('')} /> : undefined}
              />
              {columns.length > 0 && (
                <Group gap="xs" wrap="wrap" align="flex-end">
                  <Select
                    label="Ordenar por"
                    placeholder="Selecciona columna"
                    data={columns.map((column) => ({ value: column, label: column.replace(/_/g, ' ') }))}
                    value={sortColumn}
                    onChange={(value) => setSortColumn(value || null)}
                    leftSection={<IconArrowsSort size={16} />}
                    clearable
                    style={{ flex: '1 1 180px', maxWidth: 220 }}
                  />
                  <SegmentedControl
                    value={sortDirection}
                    onChange={(val) => setSortDirection(val as 'asc' | 'desc')}
                    data={[
                      { label: 'Asc', value: 'asc' },
                      { label: 'Desc', value: 'desc' },
                    ]}
                    disabled={!sortColumn}
                  />
                </Group>
              )}
            </Group>
          </Stack>

          {loading ? (
            <Center py="xl">
              <Loader color="indigo" />
            </Center>
          ) : items.length === 0 ? (
            <Stack align="center" gap="xs" py="xl">
              <IconDatabase size={32} color="var(--mantine-color-gray-5)" />
              <Text c="dimmed" ta="center">No hay registros disponibles. Crea el primero usando el formulario superior.</Text>
            </Stack>
          ) : filteredAndSortedItems.length === 0 ? (
            <Stack align="center" gap="xs" py="xl">
              <IconFilter size={32} color="var(--mantine-color-gray-5)" />
              <Text c="dimmed" ta="center">No encontramos coincidencias con los filtros aplicados.</Text>
              <Button
                variant="subtle"
                size="xs"
                onClick={() => {
                  setFilterQuery('')
                  setSortColumn(null)
                  if (section.key === 'courses') {
                    setCourseFilters({ term: null, subjectId: null, teacherId: null, modality: null })
                  }
                }}
              >
                Limpiar filtros
              </Button>
            </Stack>
          ) : section.key === 'students' ? (
            renderStudentsView()
          ) : section.key === 'teachers' ? (
            renderTeachersView()
          ) : section.key === 'courses' ? (
            renderCoursesView()
          ) : section.key === 'subjects' ? (
            renderSubjectsView()
          ) : (
            <ScrollArea.Autosize offsetScrollbars mah="60vh" type="always" scrollbarSize={10}>
              <div style={{ minWidth: 720, width: '100%', overflowX: 'auto' }}>
                <Table verticalSpacing="sm" horizontalSpacing="md" striped highlightOnHover withTableBorder style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                  <Table.Thead>
                    <Table.Tr>
                        {columns.map((column) => (
                          <Table.Th key={column} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {section.key === 'programs' && column === 'is_active' ? 'Estado' : column}
                          </Table.Th>
                        ))}
                      <Table.Th style={{ width: 120, whiteSpace: 'nowrap' }}>Acciones</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredAndSortedItems.map((row) => (
                      <Table.Tr key={row.id ?? `${section.key}-${JSON.stringify(row)}`}>
                        {columns.map((column) => {
                          if (section.key === 'programs' && column === 'is_active') {
                            const programId = row.id
                            const isActive = Boolean(row[column])
                            return (
                              <Table.Td key={column}>
                                <Switch
                                  checked={isActive}
                                  onChange={(event) => {
                                    if (typeof programId !== 'number') return
                                    void handleToggleProgramStatus(programId, event.currentTarget.checked)
                                  }}
                                  disabled={typeof programId !== 'number' || updatingProgramId === programId}
                                  size="sm"
                                  color="teal"
                                  aria-busy={updatingProgramId === programId}
                                  aria-label={`Cambiar estado del programa ${row.name ?? programId}`}
                                />
                              </Table.Td>
                            )
                          }
                          const value = row[column]
                          if (value === null || value === undefined) return <Table.Td key={column}>—</Table.Td>
                          if (typeof value === 'object') return <Table.Td key={column}>{labelForOption(value)}</Table.Td>
                          return (
                            <Table.Td
                              key={column}
                              style={{
                                wordBreak: 'break-word',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 200,
                              }}
                              title={String(value)}
                            >
                              {String(value)}
                            </Table.Td>
                          )
                        })}
                        <Table.Td>
                          <Group gap="xs">
                            {section.key === 'programs' ? (
                              <Tooltip label="Ver semestres" withArrow>
                                <ActionIcon
                                  variant="subtle"
                                  color="indigo"
                                  aria-label="Ver detalle"
                                  onClick={() => {
                                    setSelectedProgram(row)
                                    setShowProgramDetail(true)
                                  }}
                                >
                                  <IconEye size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            {section.key === 'programs' ? (
                              <Tooltip label="Abrir vista detallada" withArrow>
                                <ActionIcon
                                  variant="subtle"
                                  color="blue"
                                  aria-label="Abrir vista detallada"
                                  onClick={() => {
                                    if (typeof row.id === 'number') {
                                      navigate(`/dashboard/admin/programs/${row.id}`)
                                    }
                                  }}
                                >
                                  <IconSearch size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            <Tooltip label="Editar" withArrow>
                              <ActionIcon
                                variant="subtle"
                                color="dark"
                                aria-label="Editar"
                                onClick={() => handleEditRow(row)}
                              >
                                <IconPencil size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Eliminar" withArrow>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                aria-label="Eliminar"
                                onClick={() => row.id !== undefined && onDelete(row.id)}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Card>
      {section.key === 'programs' && selectedProgram ? (
        <Drawer
          opened={showProgramDetail}
          onClose={() => {
            setShowProgramDetail(false)
            setSelectedProgram(null)
          }}
          title="Detalle del programa"
          position="right"
          size="lg"
          padding="lg"
        >
          <Stack gap="lg">
            <Stack gap="xs">
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">Programa académico</Text>
              <Title order={3}>{selectedProgram.name}</Title>
              <Group gap="xs">
                {selectedProgram.code ? (
                  <Badge color="dark" variant="light">Código {selectedProgram.code}</Badge>
                ) : null}
                {selectedProgram.level ? (
                  <Badge color="indigo" variant="light">Nivel {selectedProgram.level}</Badge>
                ) : null}
                {typeof selectedProgram.duration_semesters === 'number' ? (
                  <Badge color="gray" variant="light">Duración {selectedProgram.duration_semesters} semestres</Badge>
                ) : null}
                <Badge color={selectedProgram.is_active ? 'teal' : 'gray'} variant="outline">
                  {selectedProgram.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </Group>
              {selectedProgram.description ? (
                <Text size="sm" c="dimmed">{selectedProgram.description}</Text>
              ) : null}
            </Stack>

            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" align="center" gap="sm">
                <div>
                  <Text fw={600} size="sm">Disponibilidad del programa</Text>
                  <Text size="xs" c="dimmed">
                    Controla si este programa aparece en los catálogos y flujos de inscripción.
                  </Text>
                </div>
                <Switch
                  checked={Boolean(selectedProgram.is_active)}
                  onChange={(event) => {
                    void handleToggleProgramStatus(selectedProgram.id, event.currentTarget.checked)
                  }}
                  disabled={updatingProgramId === selectedProgram.id}
                  color="teal"
                  size="md"
                  onLabel="Sí"
                  offLabel="No"
                  aria-busy={updatingProgramId === selectedProgram.id}
                  aria-label={`Cambiar estado del programa ${selectedProgram.name}`}
                />
              </Group>
            </Paper>

            <Divider label="Semestres asociados" labelPosition="center" />

            {(() => {
              const semesters = (programSemesters || [])
                .filter((semester) => semester.program_id === selectedProgram.id)
                .sort((a, b) => (Number(a.semester_number) || 0) - (Number(b.semester_number) || 0))

              if (semesters.length === 0) {
                return (
                  <Card withBorder radius="md" padding="lg">
                    <Text size="sm" c="dimmed">Este programa aún no tiene semestres configurados.</Text>
                  </Card>
                )
              }

              const relevantCourses = Array.isArray(courses) ? courses : []
              const subjectMap = Array.isArray(subjects)
                ? new Map(subjects.map((subject: Subject) => [subject.id, subject]))
                : new Map<number, Subject>()
              const semesterMap = new Map(semesters.map((semester) => [semester.id, semester]))

              const subjectsBySemester = new Map<number, Subject[]>()
              for (const course of relevantCourses) {
                const semesterId = course?.program_semester_id
                if (semesterId == null) continue
                if (!semesterMap.has(semesterId)) continue
                const subject = subjectMap.get(course?.subject_id ?? -1)
                if (!subject) continue
                if (subject.program_id && subject.program_id !== selectedProgram.id) continue
                const list = subjectsBySemester.get(semesterId)
                if (list) {
                  if (!list.some((item) => item.id === subject.id)) list.push(subject)
                } else {
                  subjectsBySemester.set(semesterId, [subject])
                }
              }

              return (
                <Accordion variant="separated" radius="md" transitionDuration={200} defaultValue={String(semesters[0].id)}>
                  {semesters.map((semester) => {
                    const semesterSubjects = [...(subjectsBySemester.get(semester.id) ?? [])].sort((a, b) => {
                      const nameA = (a?.name || a?.label || '').toString().toLowerCase()
                      const nameB = (b?.name || b?.label || '').toString().toLowerCase()
                      if (nameA && nameB) return nameA.localeCompare(nameB)
                      return (a?.id ?? 0) > (b?.id ?? 0) ? 1 : -1
                    })
                    const stateColor = semester.state === 'current' ? 'teal' : semester.state === 'planned' ? 'blue' : 'gray'
                    const stateLabel = semester.state === 'current' ? 'En curso' : semester.state === 'planned' ? 'Planificado' : 'Finalizado'
                    const isFinished = semester.state === 'finished'
                    return (
                      <Accordion.Item key={semester.id} value={String(semester.id)}>
                        <Accordion.Control
                          icon={(
                            <Group gap={6} align="center">
                              <Badge color={semester.is_active ? 'teal' : 'gray'} variant="light">
                                {semester.is_active ? 'Activo' : 'Inactivo'}
                              </Badge>
                              <Badge color={stateColor} variant="light">
                                {stateLabel}
                              </Badge>
                            </Group>
                          )}
                        >
                          Semestre {semester.semester_number ?? '—'} · {semester.label || `ID ${semester.id}`}
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="md">
                            <Stack gap="xs">
                              <Text size="sm">Identificador interno: {semester.id}</Text>
                              <Text size="sm">Número de semestre: {semester.semester_number ?? 'No especificado'}</Text>
                              {semester.label ? <Text size="sm">Etiqueta: {semester.label}</Text> : null}
                              {semester.description ? (
                                <Text size="sm" c="dimmed">{semester.description}</Text>
                              ) : null}
                            </Stack>
                            <Paper withBorder radius="md" p="md">
                              <Group justify="space-between" align="center" gap="sm">
                                <div>
                                  <Text fw={600} size="sm">Disponibilidad</Text>
                                  <Text size="xs" c="dimmed">
                                    Activa o desactiva este semestre para que aparezca en los flujos de inscripción y planificación.
                                  </Text>
                                </div>
                                <Switch
                                  checked={Boolean(semester.is_active)}
                                  onChange={(event) => {
                                    void handleToggleSemesterStatus(semester.id, event.currentTarget.checked)
                                  }}
                                  disabled={updatingSemesterId === semester.id || updatingSemesterStateId === semester.id || isFinished}
                                  color="teal"
                                  size="md"
                                  onLabel="Sí"
                                  offLabel="No"
                                  aria-busy={updatingSemesterId === semester.id || updatingSemesterStateId === semester.id}
                                  aria-label={`Cambiar estado del semestre ${semester.semester_number ?? semester.id}`}
                                />
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="md">
                              <Stack gap="sm">
                                <div>
                                  <Text fw={600} size="sm">Estado del ciclo</Text>
                                  <Text size="xs" c="dimmed">
                                    Define si el semestre se encuentra planificado, en curso o finalizado para los estudiantes.
                                  </Text>
                                </div>
                                <Group gap="sm" align="center" wrap="wrap">
                                  <SegmentedControl
                                    data={[
                                      { value: 'planned', label: 'Planificado' },
                                      { value: 'current', label: 'En curso' },
                                      { value: 'finished', label: 'Finalizado' },
                                    ]}
                                    value={semester.state ?? 'planned'}
                                    onChange={(value) => {
                                      void handleChangeSemesterState(semester.id, value as SemesterState)
                                    }}
                                    radius="md"
                                    size="sm"
                                    disabled={updatingSemesterStateId === semester.id}
                                  />
                                  {updatingSemesterStateId === semester.id && <Loader size="sm" color="teal" />}
                                </Group>
                                {isFinished ? (
                                  <Alert color="gray" variant="light" icon={<IconAlertTriangle size={16} />}>
                                    Los estudiantes no verán este semestre en los listados disponibles, pero conservarán su historial.
                                  </Alert>
                                ) : null}
                              </Stack>
                            </Paper>
                            <Divider label="Asignaturas vinculadas" labelPosition="center" />
                            {semesterSubjects.length === 0 ? (
                              <Text size="sm" c="dimmed">
                                Aún no hay asignaturas asociadas a este semestre.
                              </Text>
                            ) : (
                              <Stack gap="sm">
                  {semesterSubjects.map((subject) => (
                    <Paper key={subject.id} withBorder radius="md" p="md">
                      <Stack gap="sm">
                        <Group justify="space-between" align="flex-start" gap="sm">
                          <div>
                            <Text fw={600}>{subject.name}</Text>
                            {subject.description ? (
                              <Text size="xs" c="dimmed">{subject.description}</Text>
                            ) : null}
                          </div>
                          <Stack gap={4} align="flex-end">
                            {subject.code ? (
                              <Badge color="dark" variant="light">{subject.code}</Badge>
                            ) : null}
                            {typeof subject.pedagogical_hours_per_week === 'number' ? (
                              <Badge color="indigo" variant="light">
                                {subject.pedagogical_hours_per_week} h pedagógicas/sem
                              </Badge>
                            ) : null}
                          </Stack>
                        </Group>
                        <Group gap="xs" wrap="wrap">
                          {typeof subject.theoretical_hours_per_week === 'number' && subject.theoretical_hours_per_week > 0 ? (
                            <Badge size="sm" variant="light" color="teal">
                              Teóricas {subject.theoretical_hours_per_week} h/sem
                            </Badge>
                          ) : null}
                          {typeof subject.practical_hours_per_week === 'number' && subject.practical_hours_per_week > 0 ? (
                            <Badge size="sm" variant="light" color="green">
                              Prácticas {subject.practical_hours_per_week} h/sem
                            </Badge>
                          ) : null}
                          {typeof subject.laboratory_hours_per_week === 'number' && subject.laboratory_hours_per_week > 0 ? (
                            <Badge size="sm" variant="light" color="grape">
                              Lab {subject.laboratory_hours_per_week} h/sem
                            </Badge>
                          ) : null}
                          {typeof subject.weekly_autonomous_work_hours === 'number' && subject.weekly_autonomous_work_hours > 0 ? (
                            <Badge size="sm" variant="outline" color="blue">
                              Autónomo {subject.weekly_autonomous_work_hours} h/sem
                            </Badge>
                          ) : null}
                        </Group>
                      </Stack>
                    </Paper>
                  ))}
                              </Stack>
                            )}
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    )
                  })}
                </Accordion>
              )
            })()}
          </Stack>
        </Drawer>
      ) : null}
    </Stack>
  )
}
