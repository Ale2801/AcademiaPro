import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Drawer,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { IconArrowLeft, IconRefresh, IconFileDescription, IconLink, IconBook2, IconClipboardList, IconCalendarEvent, IconSearch, IconPlus, IconEdit, IconTrash, IconListCheck } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../dashboards/DashboardLayout'
import { useAuth } from '../../lib/auth'
import { buildAuthorizedFileUrl } from '../../lib/files'
import {
  Assignment,
  Course,
  CourseMaterial,
  CourseMaterialPayload,
  EnrollmentSummary,
  Evaluation,
  EvaluationPayload,
  Grade,
  GradePayload,
  StudentSummary,
  SubjectSummary,
  TeacherSummary,
  UserSummary,
  createCourseMaterial,
  createEvaluation,
  createGrade,
  deleteCourseMaterial,
  deleteEvaluation,
  deleteGrade,
  fetchAssignments,
  fetchCourseMaterials,
  fetchCourses,
  fetchEnrollments,
  fetchEvaluations,
  fetchGrades,
  fetchStudents,
  fetchSubjects,
  fetchTeachers,
  fetchUsers,
  updateCourseMaterial,
  updateEvaluation,
  updateGrade,
} from '../../lib/learning'

const dateFormatter = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' })
const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin fecha'
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return 'Sin registro'
  try {
    const date = typeof value === 'string' ? new Date(value) : value
    return dateTimeFormatter.format(date)
  } catch {
    return typeof value === 'string' ? value : value?.toISOString() ?? '—'
  }
}

const formatCourseLabel = (course: Course, subjectLookup: Map<number, string>) => {
  const subjectName = (course.subject_id && subjectLookup.get(course.subject_id)) || `Curso ${course.id}`
  const fragments: string[] = [subjectName]
  if (course.term) fragments.push(course.term)
  if (course.group) fragments.push(`Grupo ${course.group}`)
  return fragments.join(' · ')
}

const materialTypeOptions = [
  { value: 'document', label: 'Documento' },
  { value: 'link', label: 'Enlace' },
  { value: 'video', label: 'Video' },
  { value: 'resource', label: 'Recurso' },
  { value: 'other', label: 'Otro' },
]

const toInputDateTime = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 16)
}

const fromInputDateTime = (value?: string | null) => {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

const describeAssignmentStatus = (assignment: Assignment, now: number) => {
  if (!assignment.due_date) return { label: 'Sin fecha límite', color: 'gray' as const }
  const due = new Date(assignment.due_date).getTime()
  if (Number.isNaN(due)) return { label: 'Fecha inválida', color: 'gray' as const }
  if (due < now) {
    return {
      label: assignment.allow_late ? 'Atrasada (acepta atraso)' : 'Vencida',
      color: assignment.allow_late ? ('orange' as const) : ('red' as const),
    }
  }
  const diffDays = Math.max(0, Math.ceil((due - now) / 86_400_000))
  return {
    label: diffDays <= 3 ? `Próxima (${diffDays}d)` : `En ${diffDays}d`,
    color: diffDays <= 3 ? ('yellow' as const) : ('teal' as const),
  }
}

const describeEvaluationWindow = (evaluation: Evaluation, now: number) => {
  if (!evaluation.scheduled_at && !evaluation.due_date) return { label: 'Sin agenda', color: 'gray' as const }
  const target = evaluation.scheduled_at ?? evaluation.due_date
  if (!target) return { label: 'Sin agenda', color: 'gray' as const }
  const timestamp = new Date(target).getTime()
  if (Number.isNaN(timestamp)) return { label: 'Fecha inválida', color: 'gray' as const }
  if (timestamp < now) {
    return { label: 'Realizada / vencida', color: 'indigo' as const }
  }
  const diffDays = Math.max(0, Math.ceil((timestamp - now) / 86_400_000))
  return { label: diffDays <= 7 ? `Próxima (${diffDays}d)` : `En ${diffDays}d`, color: diffDays <= 7 ? ('yellow' as const) : ('teal' as const) }
}

type LearningOversightPageProps = {
  role: 'admin' | 'coordinator'
}

export default function LearningOversightPage({ role }: LearningOversightPageProps) {
  const navigate = useNavigate()
  const { token } = useAuth()
  const canManage = role === 'admin' || role === 'coordinator'
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<SubjectSummary[]>([])
  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [teachers, setTeachers] = useState<TeacherSummary[]>([])
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [selectedCourses, setSelectedCourses] = useState<number[]>([])
  const [teacherFilter, setTeacherFilter] = useState<number | null>(null)
  const [studentFilter, setStudentFilter] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [materialModalOpen, setMaterialModalOpen] = useState(false)
  const [materialSaving, setMaterialSaving] = useState(false)
  const [materialEditing, setMaterialEditing] = useState<CourseMaterial | null>(null)
  const [materialForm, setMaterialForm] = useState<CourseMaterialPayload>({
    course_id: 0,
    title: '',
    description: '',
    material_type: 'document',
    file_url: '',
    external_url: '',
    display_order: undefined,
    is_published: true,
    published_at: '',
  })
  const [evaluationModalOpen, setEvaluationModalOpen] = useState(false)
  const [evaluationSaving, setEvaluationSaving] = useState(false)
  const [evaluationEditing, setEvaluationEditing] = useState<Evaluation | null>(null)
  const [evaluationForm, setEvaluationForm] = useState<EvaluationPayload>({
    course_id: 0,
    name: '',
    description: '',
    weight: 0.1,
    scheduled_at: '',
    max_score: 100,
    due_date: '',
  })
  const [gradeDrawerOpen, setGradeDrawerOpen] = useState(false)
  const [activeEvaluation, setActiveEvaluation] = useState<Evaluation | null>(null)
  const [gradeModalOpen, setGradeModalOpen] = useState(false)
  const [gradeSaving, setGradeSaving] = useState(false)
  const [gradeEditing, setGradeEditing] = useState<Grade | null>(null)
  const [gradeForm, setGradeForm] = useState<GradePayload>({
    evaluation_id: 0,
    enrollment_id: 0,
    score: 0,
    feedback: '',
    graded_at: '',
  })

  const resolveFileUrl = useCallback((url?: string | null) => {
    if (!url) return undefined
    return buildAuthorizedFileUrl(url, token) ?? url
  }, [token])

  const loadAll = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setError(null)
    try {
      const [courseData, subjectData, materialData, assignmentData, evaluationData, gradeData, teacherData, studentData, enrollmentData, userData] = await Promise.all([
        fetchCourses(),
        fetchSubjects(),
        fetchCourseMaterials(),
        fetchAssignments(),
        fetchEvaluations(),
        fetchGrades(),
        fetchTeachers(),
        fetchStudents(),
        fetchEnrollments(),
        fetchUsers(),
      ])
      setCourses(courseData)
      setSubjects(subjectData)
      setMaterials(materialData)
      setAssignments(assignmentData)
      setEvaluations(evaluationData)
      setGrades(gradeData)
      setTeachers(teacherData)
      setStudents(studentData)
      setEnrollments(enrollmentData)
      setUsers(userData)
      setLastUpdated(new Date())
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos cargar los recursos académicos'
      setError(detail)
    } finally {
      if (mode === 'initial') {
        setLoading(false)
      } else {
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const subjectLookup = useMemo(() => {
    const map = new Map<number, string>()
    subjects.forEach((subject) => {
      const label = subject.name?.trim() || subject.code?.trim()
      map.set(subject.id, label || `Asignatura ${subject.id}`)
    })
    return map
  }, [subjects])

  const courseLookup = useMemo(() => {
    const map = new Map<number, Course>()
    courses.forEach((course) => map.set(course.id, course))
    return map
  }, [courses])

  const courseLabelLookup = useMemo(() => {
    const map = new Map<number, string>()
    courses.forEach((course) => {
      map.set(course.id, formatCourseLabel(course, subjectLookup))
    })
    return map
  }, [courses, subjectLookup])

  const userLookup = useMemo(() => {
    const map = new Map<number, UserSummary>()
    users.forEach((user) => map.set(user.id, user))
    return map
  }, [users])

  const teacherNameLookup = useMemo(() => {
    const map = new Map<number, string>()
    teachers.forEach((teacher) => {
      const user = userLookup.get(teacher.user_id)
      const label = user?.full_name?.trim() || `Profesor ${teacher.id}`
      map.set(teacher.id, label)
    })
    return map
  }, [teachers, userLookup])

  const studentNameLookup = useMemo(() => {
    const map = new Map<number, string>()
    students.forEach((student) => {
      const user = userLookup.get(student.user_id)
      const label = user?.full_name?.trim() || `Alumno ${student.id}`
      map.set(student.id, label)
    })
    return map
  }, [students, userLookup])

  const teacherOptions = useMemo(() => (
    teachers
      .map((teacher) => {
        const user = userLookup.get(teacher.user_id)
        return {
          value: String(teacher.id),
          label: teacherNameLookup.get(teacher.id) || `Profesor ${teacher.id}`,
          description: user?.email,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  ), [teacherNameLookup, teachers, userLookup])

  const studentOptions = useMemo(() => (
    students
      .map((student) => {
        const user = userLookup.get(student.user_id)
        const badge = student.registration_number ? ` · ${student.registration_number}` : ''
        return {
          value: String(student.id),
          label: `${studentNameLookup.get(student.id) || `Alumno ${student.id}`}${badge}`,
          description: user?.email,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  ), [studentNameLookup, students, userLookup])

  const courseOptions = useMemo(() => (
    [...courses]
      .sort((a, b) => {
        const subjectA = (a.subject_id && subjectLookup.get(a.subject_id)) || ''
        const subjectB = (b.subject_id && subjectLookup.get(b.subject_id)) || ''
        return subjectA.localeCompare(subjectB) || (a.term || '').localeCompare(b.term || '') || a.id - b.id
      })
      .map((course) => ({
        value: String(course.id),
        label: courseLabelLookup.get(course.id) || `Curso ${course.id}`,
      }))
  ), [courseLabelLookup, courses, subjectLookup])

  const studentCourseMap = useMemo(() => {
    const map = new Map<number, Set<number>>()
    enrollments.forEach((enrollment) => {
      if (!map.has(enrollment.student_id)) {
        map.set(enrollment.student_id, new Set<number>())
      }
      map.get(enrollment.student_id)!.add(enrollment.course_id)
    })
    return map
  }, [enrollments])

  const searchTerm = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery])

  const teacherCourseIds = useMemo(() => {
    if (!teacherFilter) return null
    const set = new Set<number>()
    courses.forEach((course) => {
      if (course.teacher_id === teacherFilter) set.add(course.id)
    })
    materials.forEach((material) => {
      const owner = material.teacher_id ?? courseLookup.get(material.course_id)?.teacher_id
      if (owner === teacherFilter) set.add(material.course_id)
    })
    assignments.forEach((assignment) => {
      const owner = assignment.teacher_id ?? courseLookup.get(assignment.course_id)?.teacher_id
      if (owner === teacherFilter) set.add(assignment.course_id)
    })
    evaluations.forEach((evaluation) => {
      const owner = courseLookup.get(evaluation.course_id)?.teacher_id
      if (owner === teacherFilter) set.add(evaluation.course_id)
    })
    return set
  }, [assignments, courseLookup, courses, evaluations, materials, teacherFilter])

  const studentCourseIds = useMemo(() => {
    if (!studentFilter) return null
    const membership = studentCourseMap.get(studentFilter)
    if (!membership) return new Set<number>()
    return new Set(membership)
  }, [studentCourseMap, studentFilter])

  const searchCourseIds = useMemo(() => {
    if (!searchTerm) return null
    const set = new Set<number>()
    const matchTexts = (texts: Array<string | null | undefined>, courseId: number) => {
      if (texts.some((text) => text && text.toLowerCase().includes(searchTerm))) {
        set.add(courseId)
      }
    }
    courses.forEach((course) => {
      const label = courseLabelLookup.get(course.id)?.toLowerCase()
      const teacherName = teacherNameLookup.get(course.teacher_id)?.toLowerCase()
      if ((label && label.includes(searchTerm)) || (teacherName && teacherName.includes(searchTerm))) {
        set.add(course.id)
      }
    })
    materials.forEach((material) => matchTexts([material.title, material.description], material.course_id))
    assignments.forEach((assignment) => matchTexts([
      assignment.title,
      assignment.instructions,
      assignment.assignment_type,
    ], assignment.course_id))
    evaluations.forEach((evaluation) => matchTexts([evaluation.name, evaluation.description], evaluation.course_id))
    return set
  }, [assignments, courseLabelLookup, courses, evaluations, materials, searchTerm, teacherNameLookup])

  const allCourseIds = useMemo(() => courses.map((course) => course.id), [courses])

  const filteredCourseIds = useMemo(() => {
    const baseSet = new Set(allCourseIds)
    const activeSets = [teacherCourseIds, studentCourseIds, searchCourseIds].filter(Boolean) as Set<number>[]
    if (!activeSets.length) return Array.from(baseSet)
    const intersected = activeSets.reduce((acc, current) => {
      const next = new Set<number>()
      acc.forEach((value) => {
        if (current.has(value)) {
          next.add(value)
        }
      })
      return next
    }, baseSet)
    return Array.from(intersected)
  }, [allCourseIds, searchCourseIds, studentCourseIds, teacherCourseIds])

  const filteredCourseIdSet = useMemo(() => new Set(filteredCourseIds), [filteredCourseIds])

  useEffect(() => {
    setSelectedCourses((prev) => {
      const next = prev.filter((id) => filteredCourseIdSet.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [filteredCourseIdSet])

  const filteredCourseOptions = useMemo(
    () => courseOptions.filter((option) => filteredCourseIdSet.has(Number(option.value))),
    [courseOptions, filteredCourseIdSet],
  )

  const effectiveCourseSet = useMemo(() => {
    if (selectedCourses.length) {
      return new Set(selectedCourses)
    }
    return filteredCourseIdSet
  }, [filteredCourseIdSet, selectedCourses])

  const defaultCourseId = useMemo(() => {
    if (selectedCourses.length) return selectedCourses[0]
    if (filteredCourseIds.length) return filteredCourseIds[0]
    return courses[0]?.id ?? 0
  }, [courses, filteredCourseIds, selectedCourses])

  const openMaterialModal = (material?: CourseMaterial) => {
    const courseId = material?.course_id ?? defaultCourseId ?? 0
    setMaterialEditing(material ?? null)
    setMaterialForm({
      course_id: courseId,
      title: material?.title ?? '',
      description: material?.description ?? '',
      material_type: material?.material_type ?? 'document',
      file_url: material?.file_url ?? '',
      external_url: material?.external_url ?? '',
      display_order: material?.display_order ?? undefined,
      is_published: material?.is_published ?? true,
      published_at: material?.published_at ? toInputDateTime(material.published_at) : '',
    })
    setMaterialModalOpen(true)
  }

  const closeMaterialModal = () => {
    setMaterialModalOpen(false)
    setMaterialEditing(null)
  }

  const handleMaterialSubmit = async () => {
    const targetCourseId = materialForm.course_id || defaultCourseId
    if (!targetCourseId) {
      setError('Debes seleccionar un curso para asociar el material')
      return
    }
    const payload: CourseMaterialPayload = {
      course_id: targetCourseId,
      title: materialForm.title.trim(),
      description: materialForm.description?.trim() || undefined,
      material_type: materialForm.material_type,
      file_url: materialForm.file_url?.trim() || undefined,
      external_url: materialForm.external_url?.trim() || undefined,
      display_order: typeof materialForm.display_order === 'number' ? materialForm.display_order : undefined,
      is_published: materialForm.is_published,
      published_at: fromInputDateTime(materialForm.published_at),
    }
    if (!payload.title) {
      setError('El título del material es obligatorio')
      return
    }
    setMaterialSaving(true)
    try {
      if (materialEditing) {
        await updateCourseMaterial(materialEditing.id, payload)
      } else {
        await createCourseMaterial(payload)
      }
      closeMaterialModal()
      await loadAll('refresh')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos guardar el material'
      setError(detail)
    } finally {
      setMaterialSaving(false)
    }
  }

  const handleDeleteMaterial = async (material: CourseMaterial) => {
    if (!canManage) return
    const confirmed = window.confirm(`¿Quieres eliminar el material "${material.title}"?`)
    if (!confirmed) return
    try {
      await deleteCourseMaterial(material.id)
      await loadAll('refresh')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos eliminar el material'
      setError(detail)
    }
  }

  const openEvaluationModal = (evaluation?: Evaluation) => {
    const courseId = evaluation?.course_id ?? defaultCourseId ?? 0
    setEvaluationEditing(evaluation ?? null)
    setEvaluationForm({
      course_id: courseId,
      name: evaluation?.name ?? '',
      description: evaluation?.description ?? '',
      weight: evaluation?.weight ?? 0.1,
      scheduled_at: evaluation?.scheduled_at ? toInputDateTime(evaluation.scheduled_at) : '',
      max_score: evaluation?.max_score ?? 100,
      due_date: evaluation?.due_date ? toInputDateTime(evaluation.due_date) : '',
    })
    setEvaluationModalOpen(true)
  }

  const closeEvaluationModal = () => {
    setEvaluationModalOpen(false)
    setEvaluationEditing(null)
  }

  const handleEvaluationSubmit = async () => {
    const targetCourseId = evaluationForm.course_id || defaultCourseId
    if (!targetCourseId) {
      setError('Debes seleccionar un curso para la evaluación')
      return
    }
    const payload: EvaluationPayload = {
      course_id: targetCourseId,
      name: evaluationForm.name.trim(),
      description: evaluationForm.description?.trim() || undefined,
      max_score: Number.isFinite(evaluationForm.max_score) ? evaluationForm.max_score : 100,
      weight: Math.min(1, Math.max(0, evaluationForm.weight ?? 0)),
      scheduled_at: fromInputDateTime(evaluationForm.scheduled_at),
      due_date: fromInputDateTime(evaluationForm.due_date),
    }
    if (!payload.name) {
      setError('El nombre de la evaluación es obligatorio')
      return
    }
    setEvaluationSaving(true)
    try {
      if (evaluationEditing) {
        await updateEvaluation(evaluationEditing.id, payload)
      } else {
        await createEvaluation(payload)
      }
      closeEvaluationModal()
      await loadAll('refresh')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos guardar la evaluación'
      setError(detail)
    } finally {
      setEvaluationSaving(false)
    }
  }

  const handleDeleteEvaluation = async (evaluation: Evaluation) => {
    if (!canManage) return
    const confirmed = window.confirm(`¿Eliminar la evaluación "${evaluation.name}"?`)
    if (!confirmed) return
    try {
      await deleteEvaluation(evaluation.id)
      await loadAll('refresh')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos eliminar la evaluación'
      setError(detail)
    }
  }

  const openGradeDrawer = (evaluation: Evaluation) => {
    setActiveEvaluation(evaluation)
    setGradeDrawerOpen(true)
    setGradeEditing(null)
  }

  const closeGradeDrawer = () => {
    setGradeDrawerOpen(false)
    setActiveEvaluation(null)
    setGradeEditing(null)
    setGradeModalOpen(false)
  }

  const openGradeModal = (enrollmentId: number, grade?: Grade | null) => {
    if (!activeEvaluation) return
    setGradeEditing(grade ?? null)
    setGradeForm({
      evaluation_id: activeEvaluation.id,
      enrollment_id: enrollmentId,
      score: grade?.score ?? activeEvaluation.max_score ?? 0,
      feedback: grade?.feedback ?? '',
      graded_at: grade?.graded_at ? toInputDateTime(grade.graded_at) : '',
    })
    setGradeModalOpen(true)
  }

  const closeGradeModal = () => {
    setGradeModalOpen(false)
    setGradeEditing(null)
  }

  const handleGradeSubmit = async () => {
    if (!activeEvaluation) {
      setError('No hay evaluación seleccionada para registrar la entrega')
      return
    }
    if (!gradeForm.enrollment_id) {
      setError('Debes seleccionar una inscripción válida')
      return
    }
    const normalizedScore = Number(gradeForm.score)
    if (!Number.isFinite(normalizedScore)) {
      setError('El puntaje debe ser un número válido')
      return
    }
    const maxScore = Math.max(1, activeEvaluation.max_score || 100)
    if (normalizedScore < 0 || normalizedScore > maxScore) {
      setError(`El puntaje debe estar entre 0 y ${maxScore}`)
      return
    }
    const payload: GradePayload = {
      evaluation_id: gradeForm.evaluation_id,
      enrollment_id: gradeForm.enrollment_id,
      score: normalizedScore,
      feedback: gradeForm.feedback?.trim() || undefined,
      graded_at: fromInputDateTime(gradeForm.graded_at),
    }
    setGradeSaving(true)
    try {
      if (gradeEditing) {
        await updateGrade(gradeEditing.id, payload)
      } else {
        await createGrade(payload)
      }
      closeGradeModal()
      await loadAll('refresh')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos guardar la entrega'
      setError(detail)
    } finally {
      setGradeSaving(false)
    }
  }

  const handleDeleteGrade = async () => {
    if (!gradeEditing) return
    const confirmed = window.confirm('¿Eliminar el registro de esta entrega?')
    if (!confirmed) return
    setGradeSaving(true)
    try {
      await deleteGrade(gradeEditing.id)
      closeGradeModal()
      await loadAll('refresh')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos eliminar la entrega'
      setError(detail)
    } finally {
      setGradeSaving(false)
    }
  }

  const hasSearchFilter = Boolean(searchTerm)
  const activeFilterCount = (selectedCourses.length ? 1 : 0) + (teacherFilter ? 1 : 0) + (studentFilter ? 1 : 0) + (hasSearchFilter ? 1 : 0)
  const filterBadgeLabel = activeFilterCount
    ? `${activeFilterCount} filtro${activeFilterCount === 1 ? '' : 's'} activos`
    : 'Sin filtros aplicados'
  const courseFilterSummary = selectedCourses.length
    ? `${selectedCourses.length} curso${selectedCourses.length === 1 ? '' : 's'} seleccionados`
    : `${filteredCourseIds.length} curso${filteredCourseIds.length === 1 ? '' : 's'} coinciden`
  const filteredMaterials = useMemo(
    () => materials.filter((material) => effectiveCourseSet.has(material.course_id)),
    [effectiveCourseSet, materials],
  )

  const filteredAssignments = useMemo(
    () => assignments.filter((assignment) => effectiveCourseSet.has(assignment.course_id)),
    [assignments, effectiveCourseSet],
  )

  const filteredEvaluations = useMemo(
    () => evaluations.filter((evaluation) => effectiveCourseSet.has(evaluation.course_id)),
    [effectiveCourseSet, evaluations],
  )

  const activeEvaluationGrades = useMemo(() => {
    if (!activeEvaluation) return []
    return grades.filter((grade) => grade.evaluation_id === activeEvaluation.id)
  }, [activeEvaluation, grades])

  const activeEvaluationEnrollments = useMemo(() => {
    if (!activeEvaluation) return []
    return enrollments.filter((enrollment) => enrollment.course_id === activeEvaluation.course_id)
  }, [activeEvaluation, enrollments])

  const gradeByEnrollment = useMemo(() => {
    const map = new Map<number, Grade>()
    activeEvaluationGrades.forEach((grade) => {
      map.set(grade.enrollment_id, grade)
    })
    return map
  }, [activeEvaluationGrades])

  const selectedGradeEnrollment = useMemo(() => {
    if (!gradeForm.enrollment_id) return null
    return enrollments.find((enrollment) => enrollment.id === gradeForm.enrollment_id) ?? null
  }, [enrollments, gradeForm.enrollment_id])

  const gradeAverage = useMemo(() => {
    if (!activeEvaluationGrades.length) return null
    const sum = activeEvaluationGrades.reduce((acc, grade) => acc + grade.score, 0)
    return (sum / activeEvaluationGrades.length).toFixed(1)
  }, [activeEvaluationGrades])

  const coursesWithResources = useMemo(() => {
    const set = new Set<number>()
    materials.forEach((item) => set.add(item.course_id))
    assignments.forEach((item) => set.add(item.course_id))
    evaluations.forEach((item) => set.add(item.course_id))
    return set
  }, [assignments, evaluations, materials])

  const now = Date.now()
  const upcomingAssignments = filteredAssignments.filter((item) => item.due_date && new Date(item.due_date).getTime() > now).length
  const upcomingEvaluations = filteredEvaluations.filter((item) => (item.scheduled_at || item.due_date) && new Date((item.scheduled_at || item.due_date) as string).getTime() > now).length

  const summaryStats = useMemo(() => {
    const targetCourseIds = selectedCourses.length ? selectedCourses : filteredCourseIds
    const filteredCourseCount = targetCourseIds.filter((id) => coursesWithResources.has(id)).length
    const scopeHint = selectedCourses.length ? 'Cursos seleccionados' : 'Coincidencias por filtros'
    return [
      {
        label: 'Materiales publicados',
        value: filteredMaterials.length,
        hint: `${scopeHint} · Incluye documentos y enlaces`,
        icon: IconBook2,
      },
      {
        label: 'Tareas activas',
        value: filteredAssignments.length,
        hint: `${upcomingAssignments} próximas`,
        icon: IconClipboardList,
      },
      {
        label: 'Evaluaciones programadas',
        value: filteredEvaluations.length,
        hint: `${upcomingEvaluations} por ocurrir`,
        icon: IconCalendarEvent,
      },
      {
        label: 'Cursos con recursos',
        value: filteredCourseCount,
        hint: courseFilterSummary,
        icon: IconBook2,
      },
    ]
  }, [courseFilterSummary, coursesWithResources, filteredAssignments.length, filteredCourseIds, filteredEvaluations.length, filteredMaterials.length, selectedCourses, upcomingAssignments, upcomingEvaluations])

  const actions = (
    <Group gap="sm">
      <Button
        variant="light"
        leftSection={<IconArrowLeft size={16} />}
        onClick={() => navigate(role === 'admin' ? '/dashboard/admin' : '/dashboard/coordinator')}
      >
        Volver al panel
      </Button>
      <Button
        variant="default"
        leftSection={<IconRefresh size={16} />}
        loading={refreshing}
        onClick={() => void loadAll('refresh')}
      >
        Actualizar datos
      </Button>
    </Group>
  )

  const title = role === 'admin' ? 'Recursos académicos institucionales' : 'Supervisión de materiales por curso'
  const subtitle = role === 'admin'
    ? 'Revisa los contenidos, tareas y evaluaciones publicados en todas las asignaturas'
    : 'Consulta el estado de los recursos compartidos por cada curso antes de coordinarlos'

  const materialModalTitle = materialEditing ? 'Editar material' : 'Nuevo material'
  const evaluationModalTitle = evaluationEditing ? 'Editar evaluación' : 'Nueva evaluación'
  const gradeModalTitle = gradeEditing ? 'Editar entrega' : 'Registrar entrega'
  const gradeDrawerTitle = activeEvaluation ? `Entregas · ${activeEvaluation.name}` : 'Entregas de evaluación'
  const activeEvaluationCourseLabel = activeEvaluation ? courseLabelLookup.get(activeEvaluation.course_id) : null
  const selectedStudentName = selectedGradeEnrollment
    ? (studentNameLookup.get(selectedGradeEnrollment.student_id) || `Alumno ${selectedGradeEnrollment.student_id}`)
    : ''
  const selectedEnrollmentCourseLabel = selectedGradeEnrollment
    ? courseLabelLookup.get(selectedGradeEnrollment.course_id)
    : ''

  return (
    <>
      <DashboardLayout title={title} subtitle={subtitle} actions={actions}>
        <Stack gap="xl">
          {error && (
            <Alert color="red" variant="light">{error}</Alert>
          )}

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Title order={4}>Filtros avanzados</Title>
                <Text size="sm" c="dimmed">Combina curso, docente, alumno o una búsqueda libre para reducir el universo de recursos.</Text>
              </div>
              <ActionIcon variant="light" color="dark" aria-label="Recargar" onClick={() => void loadAll('refresh')} disabled={refreshing}>
                {refreshing ? <Loader size="sm" /> : <IconRefresh size={18} />}
              </ActionIcon>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }} spacing="md">
              <MultiSelect
                label="Cursos"
                placeholder="Selecciona uno o varios cursos"
                searchable
                nothingFoundMessage="Sin coincidencias"
                data={filteredCourseOptions}
                value={selectedCourses.map(String)}
                onChange={(values) => setSelectedCourses(values.map((value) => Number(value)))}
                clearButtonProps={{ 'aria-label': 'Limpiar cursos' }}
                clearable
                maxDropdownHeight={280}
              />
              <Select
                label="Profesor"
                placeholder="Todos los docentes"
                searchable
                nothingFoundMessage="Sin resultados"
                data={teacherOptions}
                value={teacherFilter ? String(teacherFilter) : null}
                onChange={(value) => setTeacherFilter(value ? Number(value) : null)}
                clearable
              />
              <Select
                label="Alumno"
                placeholder="Todos los alumnos"
                searchable
                nothingFoundMessage="Sin resultados"
                data={studentOptions}
                value={studentFilter ? String(studentFilter) : null}
                onChange={(value) => setStudentFilter(value ? Number(value) : null)}
                clearable
              />
              <TextInput
                label="Buscar"
                placeholder="Título, descripción, curso o docente"
                leftSection={<IconSearch size={16} stroke={1.5} />}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
              />
            </SimpleGrid>
            <Group gap="xs" align="center" wrap="wrap">
              <Badge variant="light" color={activeFilterCount ? 'indigo' : 'gray'}>{filterBadgeLabel}</Badge>
              <Badge variant="outline" color="dark">{courseFilterSummary}</Badge>
              {lastUpdated && (
                <Text size="xs" c="dimmed">Última actualización: {formatDateTime(lastUpdated)}</Text>
              )}
              <Button
                variant="subtle"
                size="xs"
                onClick={() => {
                  setSelectedCourses([])
                  setTeacherFilter(null)
                  setStudentFilter(null)
                  setSearchQuery('')
                }}
                disabled={!activeFilterCount}
              >
                Limpiar filtros
              </Button>
            </Group>
          </Stack>
        </Card>

        {loading ? (
          <Center py="xl"><Loader color="dark" /></Center>
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
              {summaryStats.map(({ label, value, hint, icon: IconComponent }) => (
                <Card key={label} withBorder radius="md" padding="lg">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
                      <Title order={2} mt={6}>{value}</Title>
                      <Text size="xs" c="dimmed" mt={6}>{hint}</Text>
                    </div>
                    <IconComponent size={20} />
                  </Group>
                </Card>
              ))}
            </SimpleGrid>

            <Card withBorder radius="lg" padding="lg">
              <Tabs defaultValue="materials">
                <Tabs.List>
                  <Tabs.Tab value="materials">Materiales</Tabs.Tab>
                  <Tabs.Tab value="assignments">Tareas</Tabs.Tab>
                  <Tabs.Tab value="evaluations">Evaluaciones</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="materials" pt="md">
                  {canManage && (
                    <Group justify="flex-end" mb="md">
                      <Button
                        leftSection={<IconPlus size={14} />}
                        onClick={() => openMaterialModal()}
                        disabled={!courseOptions.length}
                      >
                        Nuevo material
                      </Button>
                    </Group>
                  )}
                  {filteredMaterials.length === 0 ? (
                    <Alert color="blue" variant="light">No hay materiales publicados para este filtro.</Alert>
                  ) : (
                    <Stack gap="md">
                      {filteredMaterials.map((material) => {
                        const courseLabel = courseLabelLookup.get(material.course_id)
                        const courseTeacherId = courseLookup.get(material.course_id)?.teacher_id ?? null
                        const teacherName = courseTeacherId ? teacherNameLookup.get(courseTeacherId) : null
                        return (
                          <Card key={material.id} withBorder radius="md" padding="md">
                            <Stack gap={6}>
                              <Group justify="space-between" align="flex-start">
                                <div>
                                  <Text fw={600}>{material.title}</Text>
                                  {material.description && <Text size="sm" c="dimmed">{material.description}</Text>}
                                  <Text size="xs" c="dimmed">
                                    {courseLabel}
                                    {teacherName ? ` · ${teacherName}` : ''}
                                  </Text>
                                </div>
                                <Badge color="dark" variant="light">{material.material_type}</Badge>
                              </Group>
                            <Group gap="xs">
                              {material.file_url && (
                                <Button
                                  component="a"
                                  href={resolveFileUrl(material.file_url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  variant="light"
                                  color="dark"
                                  leftSection={<IconFileDescription size={16} />}
                                  size="xs"
                                >
                                  Archivo
                                </Button>
                              )}
                              {material.external_url && (
                                <Button
                                  component="a"
                                  href={material.external_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  variant="outline"
                                  color="dark"
                                  leftSection={<IconLink size={16} />}
                                  size="xs"
                                >
                                  Recurso externo
                                </Button>
                              )}
                            </Group>
                              {canManage && (
                                <Group gap="xs" justify="flex-end">
                                  <Button variant="subtle" size="xs" leftSection={<IconEdit size={14} />} onClick={() => openMaterialModal(material)}>
                                    Editar
                                  </Button>
                                  <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={() => handleDeleteMaterial(material)}>
                                    Eliminar
                                  </Button>
                                </Group>
                              )}
                              <Text size="xs" c="dimmed">Publicado {formatDate(material.published_at)}</Text>
                            </Stack>
                          </Card>
                        )
                      })}
                    </Stack>
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="assignments" pt="md">
                  {filteredAssignments.length === 0 ? (
                    <Alert color="blue" variant="light">No hay tareas registradas para este filtro.</Alert>
                  ) : (
                    <Stack gap="md">
                      {filteredAssignments.map((assignment) => {
                        const status = describeAssignmentStatus(assignment, now)
                        const courseLabel = courseLabelLookup.get(assignment.course_id)
                        const courseTeacherId = courseLookup.get(assignment.course_id)?.teacher_id ?? null
                        const teacherName = assignment.teacher_id
                          ? teacherNameLookup.get(assignment.teacher_id)
                          : courseTeacherId ? teacherNameLookup.get(courseTeacherId) : null
                        return (
                          <Card key={assignment.id} withBorder radius="md" padding="md">
                            <Stack gap={6}>
                              <Group justify="space-between" align="flex-start">
                                <div>
                                  <Text fw={600}>{assignment.title}</Text>
                                  {assignment.instructions && <Text size="sm" c="dimmed">{assignment.instructions}</Text>}
                                  <Text size="xs" c="dimmed">
                                    {courseLabel}
                                    {teacherName ? ` · ${teacherName}` : ''}
                                  </Text>
                                </div>
                                <Group gap="xs">
                                  <Badge color="dark" variant="outline">{assignment.assignment_type}</Badge>
                                  <Badge color={status.color}>{status.label}</Badge>
                                </Group>
                              </Group>
                              <Group gap="lg">
                                <Text size="sm" c="dimmed">Disponible desde: {formatDate(assignment.available_from)}</Text>
                                <Text size="sm" c="dimmed">Fecha límite: {formatDate(assignment.due_date)}</Text>
                              </Group>
                              <Group gap="xs">
                                {assignment.resource_url && (
                                  <Button
                                    component="a"
                                    href={assignment.resource_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    variant="subtle"
                                    color="dark"
                                    size="xs"
                                  >
                                    Ver guía
                                  </Button>
                                )}
                                {assignment.attachment_url && (
                                  <Button
                                    component="a"
                                    href={resolveFileUrl(assignment.attachment_url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    variant="light"
                                    color="dark"
                                    size="xs"
                                  >
                                    Adjunto
                                  </Button>
                                )}
                              </Group>
                              <Text size="xs" c="dimmed">Máximo puntaje: {assignment.max_score}</Text>
                            </Stack>
                          </Card>
                        )
                      })}
                    </Stack>
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="evaluations" pt="md">
                  {canManage && (
                    <Group justify="flex-end" mb="md">
                      <Button
                        leftSection={<IconPlus size={14} />}
                        onClick={() => openEvaluationModal()}
                        disabled={!courseOptions.length}
                      >
                        Nueva evaluación
                      </Button>
                    </Group>
                  )}
                  {filteredEvaluations.length === 0 ? (
                    <Alert color="blue" variant="light">Aún no se han definido evaluaciones para este filtro.</Alert>
                  ) : (
                    <Stack gap="md">
                      {filteredEvaluations.map((evaluation) => {
                        const status = describeEvaluationWindow(evaluation, now)
                        const courseLabel = courseLabelLookup.get(evaluation.course_id)
                        const courseTeacherId = courseLookup.get(evaluation.course_id)?.teacher_id ?? null
                        const teacherName = courseTeacherId ? teacherNameLookup.get(courseTeacherId) : null
                        return (
                          <Card key={evaluation.id} withBorder radius="md" padding="md">
                            <Stack gap={8}>
                              <Group justify="space-between" align="flex-start">
                                <div>
                                  <Text fw={600}>{evaluation.name}</Text>
                                  {evaluation.description && <Text size="sm" c="dimmed">{evaluation.description}</Text>}
                                  <Text size="xs" c="dimmed">
                                    {courseLabel}
                                    {teacherName ? ` · ${teacherName}` : ''}
                                  </Text>
                                  <Group gap="lg" mt={6}>
                                    <Text size="sm" c="dimmed">Programada: {formatDateTime(evaluation.scheduled_at)}</Text>
                                    <Text size="sm" c="dimmed">Entrega: {formatDateTime(evaluation.due_date)}</Text>
                                  </Group>
                                </div>
                                <Stack gap={6} align="flex-end">
                                  <Badge color="dark" variant="light">Peso {(evaluation.weight * 100).toFixed(0)}%</Badge>
                                  <Badge color={status.color}>{status.label}</Badge>
                                  <Text size="xs" c="dimmed">Puntaje máx: {evaluation.max_score}</Text>
                                </Stack>
                              </Group>
                              {canManage && (
                                <Group gap="xs" justify="flex-end">
                                  <Button
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconListCheck size={14} />}
                                    onClick={() => openGradeDrawer(evaluation)}
                                  >
                                    Entregas
                                  </Button>
                                  <Button variant="subtle" size="xs" leftSection={<IconEdit size={14} />} onClick={() => openEvaluationModal(evaluation)}>
                                    Editar
                                  </Button>
                                  <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={() => handleDeleteEvaluation(evaluation)}>
                                    Eliminar
                                  </Button>
                                </Group>
                              )}
                            </Stack>
                          </Card>
                        )
                      })}
                    </Stack>
                  )}
                </Tabs.Panel>
              </Tabs>
            </Card>
          </>
        )}
        </Stack>
      </DashboardLayout>

        <Drawer opened={gradeDrawerOpen} onClose={closeGradeDrawer} title={gradeDrawerTitle} position="right" size="xl" padding="xl">
          {!activeEvaluation ? (
            <Text size="sm" c="dimmed">Selecciona una evaluación para revisar sus entregas.</Text>
          ) : (
            <Stack gap="lg">
              <div>
                <Text fw={600}>{activeEvaluation.name}</Text>
                {activeEvaluationCourseLabel && (
                  <Text size="sm" c="dimmed">{activeEvaluationCourseLabel}</Text>
                )}
                <Text size="xs" c="dimmed">
                  Puntaje máximo {activeEvaluation.max_score} · Peso {(activeEvaluation.weight * 100).toFixed(0)}%
                </Text>
              </div>
              <Group gap="sm" wrap="wrap">
                <Badge color="dark" variant="light">
                  {activeEvaluationGrades.length}/{activeEvaluationEnrollments.length || 0} entregas registradas
                </Badge>
                <Badge color="indigo" variant="light">
                  Promedio {gradeAverage ?? '—'}
                </Badge>
                {activeEvaluation.due_date && (
                  <Badge color="gray" variant="outline">Entrega {formatDateTime(activeEvaluation.due_date)}</Badge>
                )}
              </Group>
              {activeEvaluationEnrollments.length === 0 ? (
                <Alert color="yellow" variant="light">Este curso no tiene matrículas activas todavía.</Alert>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <Table verticalSpacing="sm" highlightOnHover striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Estudiante</Table.Th>
                        <Table.Th>Estado</Table.Th>
                        <Table.Th>Puntaje</Table.Th>
                        <Table.Th></Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {activeEvaluationEnrollments.map((enrollment) => {
                        const grade = gradeByEnrollment.get(enrollment.id)
                        const studentName = studentNameLookup.get(enrollment.student_id) || `Alumno ${enrollment.student_id}`
                        return (
                          <Table.Tr key={enrollment.id}>
                            <Table.Td>
                              <Text fw={500}>{studentName}</Text>
                              <Text size="xs" c="dimmed">Matrícula #{enrollment.id}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge color={grade ? 'teal' : 'gray'} variant="light">{grade ? 'Registrada' : 'Pendiente'}</Badge>
                            </Table.Td>
                            <Table.Td>
                              {grade ? (
                                <Stack gap={2}>
                                  <Text>{grade.score} / {activeEvaluation.max_score}</Text>
                                  <Text size="xs" c="dimmed">Actualizado {grade.graded_at ? formatDateTime(grade.graded_at) : 'sin fecha'}</Text>
                                </Stack>
                              ) : (
                                <Text c="dimmed">—</Text>
                              )}
                            </Table.Td>
                            <Table.Td align="right">
                              <Group justify="flex-end" gap="xs">
                                <Button
                                  variant={grade ? 'subtle' : 'light'}
                                  size="xs"
                                  onClick={() => openGradeModal(enrollment.id, grade)}
                                >
                                  {grade ? 'Editar' : 'Registrar'}
                                </Button>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        )
                      })}
                    </Table.Tbody>
                  </Table>
                </div>
              )}
            </Stack>
          )}
        </Drawer>

      <Modal opened={materialModalOpen} onClose={closeMaterialModal} title={materialModalTitle} size="lg" radius="md">
        <Stack gap="md">
          <Select
            label="Curso"
            placeholder="Selecciona el curso"
            data={courseOptions}
            value={materialForm.course_id ? String(materialForm.course_id) : null}
            onChange={(value) => setMaterialForm((prev) => ({
              ...prev,
              course_id: value ? Number(value) : 0,
            }))}
            disabled={!courseOptions.length}
            searchable
          />
          <TextInput
            label="Título"
            placeholder="Nombre visible del material"
            value={materialForm.title}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, title: event.currentTarget.value }))}
            required
          />
          <Textarea
            label="Descripción"
            placeholder="Contexto breve del recurso"
            value={materialForm.description || ''}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, description: event.currentTarget.value }))}
            minRows={3}
          />
          <Select
            label="Tipo"
            placeholder="Selecciona el tipo"
            data={materialTypeOptions}
            value={materialForm.material_type}
            onChange={(value) => setMaterialForm((prev) => ({
              ...prev,
              material_type: (value as CourseMaterialPayload['material_type']) || 'document',
            }))}
          />
          <TextInput
            label="Archivo (URL protegida)"
            placeholder="https://..."
            value={materialForm.file_url || ''}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, file_url: event.currentTarget.value }))}
          />
          <TextInput
            label="Recurso externo"
            placeholder="https://..."
            value={materialForm.external_url || ''}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, external_url: event.currentTarget.value }))}
          />
          <NumberInput
            label="Orden de despliegue"
            placeholder="Opcional"
            min={0}
            value={typeof materialForm.display_order === 'number' ? materialForm.display_order : undefined}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : Number(value)
              setMaterialForm((prev) => ({
                ...prev,
                display_order: Number.isFinite(numeric) ? numeric : undefined,
              }))
            }}
          />
          <TextInput
            label="Fecha de publicación"
            type="datetime-local"
            value={materialForm.published_at || ''}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, published_at: event.currentTarget.value }))}
          />
          <Switch
            label="Visible para los estudiantes"
            checked={Boolean(materialForm.is_published)}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, is_published: event.currentTarget.checked }))}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeMaterialModal}>Cancelar</Button>
            <Button onClick={() => void handleMaterialSubmit()} loading={materialSaving}>
              Guardar material
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={evaluationModalOpen} onClose={closeEvaluationModal} title={evaluationModalTitle} size="lg" radius="md">
        <Stack gap="md">
          <Select
            label="Curso"
            placeholder="Selecciona el curso"
            data={courseOptions}
            value={evaluationForm.course_id ? String(evaluationForm.course_id) : null}
            onChange={(value) => setEvaluationForm((prev) => ({
              ...prev,
              course_id: value ? Number(value) : 0,
            }))}
            disabled={!courseOptions.length}
            searchable
          />
          <TextInput
            label="Nombre de la evaluación"
            placeholder="Ej. Parcial 1"
            value={evaluationForm.name}
            onChange={(event) => setEvaluationForm((prev) => ({ ...prev, name: event.currentTarget.value }))}
            required
          />
          <Textarea
            label="Descripción"
            placeholder="Incluye criterios, contenidos o modalidades"
            value={evaluationForm.description || ''}
            onChange={(event) => setEvaluationForm((prev) => ({ ...prev, description: event.currentTarget.value }))}
            minRows={3}
          />
          <NumberInput
            label="Peso en la nota (%)"
            min={1}
            max={100}
            value={Math.round(Math.max(0, (evaluationForm.weight ?? 0) * 100))}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : Number(value)
              setEvaluationForm((prev) => ({
                ...prev,
                weight: Number.isFinite(numeric) ? numeric / 100 : prev.weight,
              }))
            }}
          />
          <NumberInput
            label="Puntaje máximo"
            min={1}
            value={evaluationForm.max_score}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : Number(value)
              setEvaluationForm((prev) => ({
                ...prev,
                max_score: Number.isFinite(numeric) ? numeric : prev.max_score,
              }))
            }}
          />
          <TextInput
            label="Fecha programada"
            type="datetime-local"
            value={evaluationForm.scheduled_at || ''}
            onChange={(event) => setEvaluationForm((prev) => ({ ...prev, scheduled_at: event.currentTarget.value }))}
          />
          <TextInput
            label="Fecha límite de entrega"
            type="datetime-local"
            value={evaluationForm.due_date || ''}
            onChange={(event) => setEvaluationForm((prev) => ({ ...prev, due_date: event.currentTarget.value }))}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeEvaluationModal}>Cancelar</Button>
            <Button onClick={() => void handleEvaluationSubmit()} loading={evaluationSaving}>
              Guardar evaluación
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={gradeModalOpen} onClose={closeGradeModal} title={gradeModalTitle} size="lg" radius="md">
        {(!selectedGradeEnrollment || !activeEvaluation) ? (
          <Text size="sm" c="dimmed">Selecciona una matrícula desde el panel de entregas.</Text>
        ) : (
          <Stack gap="md">
            <TextInput label="Estudiante" value={selectedStudentName} readOnly variant="filled" />
            <TextInput label="Curso" value={selectedEnrollmentCourseLabel || activeEvaluationCourseLabel || ''} readOnly variant="filled" />
            <NumberInput
              label={`Puntaje obtenido (máx. ${activeEvaluation.max_score})`}
              min={0}
              max={activeEvaluation.max_score || 100}
              value={gradeForm.score}
              onChange={(value) => {
                const numeric = typeof value === 'number' ? value : Number(value)
                setGradeForm((prev) => ({
                  ...prev,
                  score: Number.isFinite(numeric) ? numeric : prev.score,
                }))
              }}
            />
            <TextInput
              label="Fecha de calificación"
              type="datetime-local"
              value={gradeForm.graded_at || ''}
              onChange={(event) => setGradeForm((prev) => ({ ...prev, graded_at: event.currentTarget.value }))}
            />
            <Textarea
              label="Retroalimentación"
              placeholder="Comentarios breves para el alumno"
              value={gradeForm.feedback || ''}
              onChange={(event) => setGradeForm((prev) => ({ ...prev, feedback: event.currentTarget.value }))}
              minRows={3}
            />
            <Group justify="space-between" gap="sm">
              {gradeEditing && (
                <Button variant="outline" color="red" onClick={() => void handleDeleteGrade()} loading={gradeSaving}>
                  Eliminar entrega
                </Button>
              )}
              <Group justify="flex-end" gap="sm" ml="auto">
                <Button variant="default" onClick={closeGradeModal} disabled={gradeSaving}>Cancelar</Button>
                <Button onClick={() => void handleGradeSubmit()} loading={gradeSaving}>
                  Guardar
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
