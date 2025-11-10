import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconCalendarEvent,
  IconChalkboard,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsersGroup,
} from '@tabler/icons-react'
import DashboardLayout from '../dashboards/DashboardLayout'
import { api } from '../../lib/api'

const courseSchema = z.object({
  subject_id: z.string().min(1, 'Selecciona la asignatura'),
  teacher_id: z.string().min(1, 'Selecciona el profesor'),
  term: z.string().min(1, 'Indica el periodo académico'),
  group: z.string().optional(),
  weekly_hours: z
    .union([
      z.number().min(0, 'Debe ser mayor o igual a 0'),
      z
        .string()
        .regex(/^\s*\d+(\.\d+)?\s*$/)
        .transform((value) => Number(value.trim()))
        .refine((n) => !Number.isNaN(n) && n >= 0, 'Debe ser mayor o igual a 0'),
    ])
    .optional(),
  capacity: z
    .union([
      z.number().min(0, 'Debe ser mayor o igual a 0'),
      z
        .string()
        .regex(/^\s*\d+\s*$/)
        .transform((value) => Number(value.trim()))
        .refine((n) => Number.isInteger(n) && n >= 0, 'Debe ser un entero positivo'),
    ])
    .optional(),
})

type CourseFormValues = z.infer<typeof courseSchema>

const semesterSchema = z.object({
  semester_number: z.union([
    z.number().int().min(1, 'Debe ser 1 o mayor'),
    z
      .string()
      .regex(/^\s*\d+\s*$/)
      .transform((value) => Number(value.trim()))
      .refine((n) => Number.isInteger(n) && n >= 1, 'Debe ser 1 o mayor'),
  ]),
  label: z
    .string()
    .max(120, 'Máximo 120 caracteres')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .or(z.literal('')),
  state: z.enum(['planned', 'current', 'finished']).default('planned'),
  is_active: z.boolean().default(true),
})

type SemesterFormValues = z.infer<typeof semesterSchema>

type ProgramRecord = {
  id: number
  code?: string
  name?: string
  level?: string
  duration_semesters?: number
  description?: string
  is_active?: boolean
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
  subject?: { id: number; name?: string; code?: string }
  teacher?: { id: number; full_name?: string; name?: string }
}

type Student = {
  id: number
  program_id?: number | null
  user_id?: number | null
  enrollment_year?: number | null
  registration_number?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  user?: { id: number; full_name?: string; email?: string }
}

type Subject = { id: number; name?: string; code?: string; label?: string }

type Teacher = { id: number; full_name?: string; name?: string }

type Feedback = { type: 'success' | 'error'; message: string } | null

type CourseModalState = { open: boolean; semester: ProgramSemester | null }

export default function ProgramDetailPage() {
  const { programId } = useParams()
  const navigate = useNavigate()
  const [program, setProgram] = useState<ProgramRecord | null>(null)
  const [semesters, setSemesters] = useState<ProgramSemester[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [courseModal, setCourseModal] = useState<CourseModalState>({ open: false, semester: null })
  const [courseActionLoading, setCourseActionLoading] = useState(false)
  const [courseToRemove, setCourseToRemove] = useState<Course | null>(null)
  const [semesterToRemove, setSemesterToRemove] = useState<ProgramSemester | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [semesterModalOpen, setSemesterModalOpen] = useState(false)
  const [updatingSemesterId, setUpdatingSemesterId] = useState<number | null>(null)
  const [updatingSemesterStateId, setUpdatingSemesterStateId] = useState<number | null>(null)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      subject_id: '',
      teacher_id: '',
      term: '',
      group: '',
      weekly_hours: undefined,
      capacity: undefined,
    },
  })

  const {
    control: semesterControl,
    register: registerSemester,
    handleSubmit: handleSemesterSubmit,
    reset: resetSemesterForm,
    formState: { errors: semesterErrors, isSubmitting: isSubmittingSemester },
  } = useForm<SemesterFormValues>({
    resolver: zodResolver(semesterSchema),
    defaultValues: {
      semester_number: 1,
      label: '',
      description: '',
      state: 'planned',
      is_active: true,
    },
  })

  const programIdNumber = useMemo(() => {
    if (!programId) return null
    const parsed = Number(programId)
    return Number.isFinite(parsed) ? parsed : null
  }, [programId])

  const subjectOptions = useMemo(
    () => subjects.map((subject) => ({ value: String(subject.id), label: subject.name || subject.label || subject.code || `Asignatura ${subject.id}` })),
    [subjects],
  )

  const teacherOptions = useMemo(
    () => teachers.map((teacher) => ({ value: String(teacher.id), label: teacher.full_name || teacher.name || `Profesor ${teacher.id}` })),
    [teachers],
  )

  const subjectById = useMemo(() => {
    const map = new Map<number, Subject>()
    for (const subject of subjects) map.set(subject.id, subject)
    return map
  }, [subjects])

  const teacherById = useMemo(() => {
    const map = new Map<number, Teacher>()
    for (const teacher of teachers) map.set(teacher.id, teacher)
    return map
  }, [teachers])

  const studentList = useMemo(() => students, [students])

  const semesterStateOptions = useMemo(
    () => [
      { value: 'planned', label: 'Planificado' },
      { value: 'current', label: 'En curso' },
      { value: 'finished', label: 'Finalizado' },
    ],
    [],
  )

  const loadData = useCallback(async () => {
    if (programIdNumber == null) {
      setError('Identificador de programa inválido')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [programRes, semestersRes, coursesRes, studentsRes, subjectsRes, teachersRes] = await Promise.all([
        api.get(`/programs/${programIdNumber}`),
        api.get('/program-semesters/'),
        api.get('/courses/'),
        api.get('/students/'),
        api.get('/subjects/'),
        api.get('/teachers/'),
      ])

      const semestersData: ProgramSemester[] = (Array.isArray(semestersRes.data) ? semestersRes.data : []).filter(
        (semester) => Number(semester.program_id) === programIdNumber,
      )
      const semesterIds = new Set(semestersData.map((semester) => semester.id))

      const coursesData: Course[] = (Array.isArray(coursesRes.data) ? coursesRes.data : []).filter((course) =>
        course.program_semester_id != null && semesterIds.has(course.program_semester_id),
      )

      const studentsData: Student[] = (Array.isArray(studentsRes.data) ? studentsRes.data : []).filter(
        (student) => Number(student.program_id) === programIdNumber,
      )

      setProgram(programRes.data as ProgramRecord)
      setSemesters(semestersData)
      setCourses(coursesData)
      setStudents(studentsData)
      setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : [])
      setTeachers(Array.isArray(teachersRes.data) ? teachersRes.data : [])
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo cargar la información del programa'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [programIdNumber])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/dashboard/admin')
    }
  }, [navigate])

  const handleOpenSemesterModal = useCallback(() => {
    const numericSemesters = semesters
      .map((semester) => semester.semester_number)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const nextSemesterNumber = numericSemesters.length > 0 ? Math.max(...numericSemesters) + 1 : semesters.length + 1 || 1
    resetSemesterForm({
      semester_number: nextSemesterNumber,
      label: '',
      description: '',
      state: 'planned',
      is_active: true,
    })
    setFeedback(null)
    setSemesterModalOpen(true)
  }, [resetSemesterForm, semesters])

  const handleCloseSemesterModal = useCallback(() => {
    setSemesterModalOpen(false)
  }, [])

  const handleOpenCourseModal = useCallback((semester: ProgramSemester) => {
    setCourseModal({ open: true, semester })
    reset({ subject_id: '', teacher_id: '', term: '', group: '', weekly_hours: undefined, capacity: undefined })
    setFeedback(null)
  }, [reset])

  const handleCloseCourseModal = useCallback(() => {
    setCourseModal({ open: false, semester: null })
  }, [])

  const submitCourse = async (values: CourseFormValues) => {
    if (!courseModal.semester) return
    setCourseActionLoading(true)
    setFeedback(null)
    try {
      await api.post('/courses/', {
        subject_id: Number(values.subject_id),
        teacher_id: Number(values.teacher_id),
        program_semester_id: courseModal.semester.id,
        term: values.term,
        group: values.group || undefined,
        weekly_hours: typeof values.weekly_hours === 'number' ? values.weekly_hours : undefined,
        capacity: typeof values.capacity === 'number' ? values.capacity : undefined,
      })
      setFeedback({ type: 'success', message: 'Curso agregado correctamente al semestre.' })
      handleCloseCourseModal()
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo crear el curso'
      setFeedback({ type: 'error', message: detail })
    } finally {
      setCourseActionLoading(false)
    }
  }

  const submitSemester = async (values: SemesterFormValues) => {
    if (programIdNumber == null) {
      setFeedback({ type: 'error', message: 'Programa inválido. Refresca la página e inténtalo de nuevo.' })
      return
    }
    setFeedback(null)
    try {
      const semesterNumber = typeof values.semester_number === 'number' ? values.semester_number : Number(values.semester_number)
      await api.post('/program-semesters/', {
        program_id: programIdNumber,
        semester_number: semesterNumber,
        label: values.label?.trim() ? values.label.trim() : undefined,
        description: values.description?.trim() ? values.description.trim() : undefined,
        state: values.state,
        is_active: values.is_active,
      })
      setFeedback({ type: 'success', message: 'Semestre creado correctamente.' })
      handleCloseSemesterModal()
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo crear el semestre'
      setFeedback({ type: 'error', message: detail })
    }
  }

  const handleDeleteCourse = async () => {
    if (!courseToRemove) return
    setDeleting(true)
    setFeedback(null)
    try {
      await api.delete(`/courses/${courseToRemove.id}`)
      setFeedback({ type: 'success', message: 'Curso eliminado. Revisa la planificación del semestre afectado.' })
      setCourseToRemove(null)
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo eliminar el curso'
      setFeedback({ type: 'error', message: detail })
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteSemester = async () => {
    if (!semesterToRemove) return
    setDeleting(true)
    setFeedback(null)
    try {
      await api.delete(`/program-semesters/${semesterToRemove.id}`)
      setFeedback({ type: 'success', message: 'Semestre eliminado junto con sus cursos asociados.' })
      setSemesterToRemove(null)
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo eliminar el semestre'
      setFeedback({ type: 'error', message: detail })
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleSemesterStatus = useCallback(
    async (semester: ProgramSemester, nextIsActive: boolean) => {
      setUpdatingSemesterId(semester.id)
      setFeedback(null)
      try {
        await api.patch(`/program-semesters/${semester.id}`, { is_active: nextIsActive })
        setSemesters((prev) =>
          prev.map((item) => (item.id === semester.id ? { ...item, is_active: nextIsActive } : item)),
        )
        setFeedback({ type: 'success', message: nextIsActive ? 'Semestre activado.' : 'Semestre desactivado.' })
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || 'No se pudo actualizar el semestre'
        setFeedback({ type: 'error', message: detail })
      } finally {
        setUpdatingSemesterId(null)
      }
    },
    [],
  )

  const handleChangeSemesterState = useCallback(
    async (semester: ProgramSemester, nextState: SemesterState) => {
      setUpdatingSemesterStateId(semester.id)
      setFeedback(null)
      try {
        await api.patch(`/program-semesters/${semester.id}`, { state: nextState })
        setSemesters((prev) =>
          prev.map((item) => (item.id === semester.id ? { ...item, state: nextState } : item)),
        )
        const successMessage =
          nextState === 'current'
            ? 'Semestre marcado como en curso.'
            : nextState === 'finished'
              ? 'Semestre marcado como finalizado.'
              : 'Semestre marcado como planificado.'
        setFeedback({ type: 'success', message: successMessage })
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || 'No se pudo actualizar el estado del semestre'
        setFeedback({ type: 'error', message: detail })
      } finally {
        setUpdatingSemesterStateId(null)
      }
    },
    [],
  )

  const coursesBySemester = useMemo(() => {
    const map = new Map<number, Course[]>()
    for (const course of courses) {
      if (course.program_semester_id == null) continue
      const list = map.get(course.program_semester_id)
      if (list) list.push(course)
      else map.set(course.program_semester_id, [course])
    }
    return map
  }, [courses])

  const programTitle = program?.name ? `Programa: ${program.name}` : 'Programa académico'
  const programSubtitle = program?.description || 'Detalle extendido del programa, estudiantes y planificación.'

  const renderStudents = () => {
    if (studentList.length === 0) {
      return (
        <Alert color="gray" variant="light" icon={<IconUsersGroup size={16} />}>
          No se encontraron estudiantes matriculados en este programa.
        </Alert>
      )
    }
    return (
      <ScrollArea.Autosize mah={320} type="auto" offsetScrollbars>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Matrícula</Table.Th>
              <Table.Th>Año de ingreso</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {studentList.map((student) => {
              const name = student.full_name || student.user?.full_name || [student.first_name, student.last_name].filter(Boolean).join(' ') || `Estudiante ${student.id}`
              const registration = student.registration_number || '—'
              const year = student.enrollment_year ? String(student.enrollment_year) : '—'
              return (
                <Table.Tr key={student.id}>
                  <Table.Td>{name}</Table.Td>
                  <Table.Td>{registration}</Table.Td>
                  <Table.Td>{year}</Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    )
  }

  const renderSemesterHeader = (semester: ProgramSemester) => {
    const chips: React.ReactNode[] = []
    if (typeof semester.semester_number === 'number') {
      chips.push(<Badge key="num" color="indigo" variant="light">Semestre {semester.semester_number}</Badge>)
    }
    if (semester.state) {
      chips.push(<Badge key="state" color={semester.state === 'current' ? 'teal' : semester.state === 'finished' ? 'gray' : 'blue'} variant="outline">{semester.state === 'current' ? 'En curso' : semester.state === 'finished' ? 'Finalizado' : 'Planificado'}</Badge>)
    }
    if (semester.is_active === false) {
      chips.push(<Badge key="inactive" color="red" variant="outline">Inactivo</Badge>)
    }
    const isSemesterActive = semester.is_active !== false
    const isUpdatingActive = updatingSemesterId === semester.id
    const isUpdatingState = updatingSemesterStateId === semester.id
    const currentState = semester.state ?? 'planned'
    return (
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} flex={1}>
          <Group gap="xs">{chips}</Group>
          <Title order={4}>{semester.label || `Semestre ${semester.semester_number ?? ''}`}</Title>
          {semester.description ? (
            <Text size="sm" c="dimmed">{semester.description}</Text>
          ) : null}
        </Stack>
        <Stack gap="xs" align="flex-end" style={{ minWidth: 220 }}>
          <div
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            style={{ width: '100%' }}
          >
            <Switch
              size="sm"
              label={isSemesterActive ? 'Semestre activo' : 'Semestre inactivo'}
              checked={isSemesterActive}
              onChange={(event) => handleToggleSemesterStatus(semester, event.currentTarget.checked)}
              disabled={isUpdatingActive}
              color="teal"
            />
          </div>
          <div
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            style={{ width: '100%' }}
          >
            <SegmentedControl
              size="xs"
              fullWidth
              value={currentState}
              data={semesterStateOptions}
              onChange={(value) => handleChangeSemesterState(semester, value as SemesterState)}
              disabled={isUpdatingState}
            />
          </div>
          <Group gap="xs" wrap="nowrap">
            <Tooltip label="Agregar curso" withArrow>
              <ActionIcon
                variant="filled"
                color="indigo"
                aria-label="Agregar curso"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleOpenCourseModal(semester)
                }}
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Eliminar semestre" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Eliminar semestre"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setSemesterToRemove(semester)
                }}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
      </Group>
    )
  }

  const renderCourses = (list: Course[]) => {
    if (list.length === 0) {
      return (
        <Alert color="gray" variant="light" icon={<IconChalkboard size={16} />}>
          Este semestre no tiene cursos asignados todavía.
        </Alert>
      )
    }
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {list.map((course) => {
          const subject = course.subject || (course.subject_id != null ? subjectById.get(course.subject_id) : undefined)
          const teacher = course.teacher || (course.teacher_id != null ? teacherById.get(course.teacher_id) : undefined)
          return (
            <Card key={course.id} withBorder radius="md" padding="md" style={{ height: '100%' }}>
              <Stack gap={8} justify="space-between" style={{ height: '100%' }}>
                <Group justify="space-between" align="flex-start" gap="xs">
                  <Stack gap={4} flex={1}>
                    <Group gap="xs" wrap="wrap">
                      <Badge color="dark" variant="light">{subject?.code || subject?.name || `Curso ${course.id}`}</Badge>
                      {course.term ? <Badge color="gray" variant="outline">{course.term}</Badge> : null}
                      {course.group ? <Badge color="indigo" variant="outline">Grupo {course.group}</Badge> : null}
                    </Group>
                    <Text fw={600} size="sm">{subject?.name || subject?.code || `Curso ${course.id}`}</Text>
                  </Stack>
                  <Tooltip label="Eliminar curso" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Eliminar curso"
                      size="sm"
                      onClick={() => setCourseToRemove(course)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    {teacher?.full_name || teacher?.name || 'Docente por asignar'}
                  </Text>
                  <Group gap="xs">
                    {course.weekly_hours ? (
                      <Badge color="teal" variant="light">{course.weekly_hours}h semanales</Badge>
                    ) : null}
                    {course.capacity ? (
                      <Badge color="blue" variant="light">Capacidad {course.capacity}</Badge>
                    ) : null}
                  </Group>
                </Stack>
              </Stack>
            </Card>
          )
        })}
      </SimpleGrid>
    )
  }

  const pageActions = (
    <Group>
      <Button
        variant="light"
        color="dark"
        leftSection={<IconArrowLeft size={16} />}
        onClick={handleBack}
      >
        Volver a programas
      </Button>
      <ActionIcon
        variant="light"
        color="indigo"
        aria-label="Recargar"
        onClick={() => void loadData()}
      >
        <IconRefresh size={16} />
      </ActionIcon>
    </Group>
  )

  const content = () => {
    if (loading) {
      return (
        <Group justify="center" align="center" mih={320}>
          <Loader color="indigo" />
        </Group>
      )
    }

    if (error) {
      return (
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
          <Button leftSection={<IconRefresh size={16} />} variant="light" color="indigo" onClick={() => void loadData()}>
            Reintentar carga
          </Button>
        </Stack>
      )
    }

    if (!program) {
      return (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          No se encontró el programa solicitado.
        </Alert>
      )
    }

    const metrics = [
      { label: 'Estudiantes matriculados', value: studentList.length, icon: IconUsersGroup, hint: 'Incluye cohortes activas' },
      { label: 'Semestres definidos', value: semesters.length, icon: IconCalendarEvent, hint: 'Planificación estructural' },
      { label: 'Cursos planificados', value: courses.length, icon: IconBook2, hint: 'Cursos vinculados a los semestres' },
    ]

    const sortedSemesters = semesters
      .slice()
      .sort((a, b) => Number(a.semester_number ?? 0) - Number(b.semester_number ?? 0))

    return (
      <Stack gap="xl">
        {feedback ? (
          <Alert color={feedback.type === 'success' ? 'teal' : 'red'} variant="light" icon={<IconAlertTriangle size={16} />}>
            {feedback.message}
          </Alert>
        ) : null}

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Group gap="xs">
                  {program.code ? <Badge color="dark" variant="light">Código {program.code}</Badge> : null}
                  {program.level ? <Badge color="indigo" variant="light">Nivel {program.level}</Badge> : null}
                  {typeof program.duration_semesters === 'number' ? (
                    <Badge color="gray" variant="outline">Duración {program.duration_semesters} semestres</Badge>
                  ) : null}
                  <Badge color={program.is_active ? 'teal' : 'gray'} variant="outline">
                    {program.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </Group>
                <Title order={3}>{program.name || `Programa ${program.id}`}</Title>
                {program.description ? (
                  <Text size="sm" c="dimmed">{program.description}</Text>
                ) : null}
              </Stack>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              {metrics.map((metric) => (
                <Paper key={metric.label} withBorder radius="md" p="md">
                  <Group gap="md">
                    <ActionIcon size="lg" radius="md" variant="light" color="indigo" aria-label={metric.label}>
                      <metric.icon size={18} />
                    </ActionIcon>
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
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Estudiantes matriculados</Text>
                <Title order={4}>Listado de alumnos</Title>
              </div>
            </Group>
            {renderStudents()}
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Planificación académica</Text>
                <Title order={4}>Semestres y cursos</Title>
              </div>
              <Group gap="xs">
                <Button
                  variant="subtle"
                  color="dark"
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={handleBack}
                >
                  Volver
                </Button>
                <Button leftSection={<IconPlus size={16} />} onClick={handleOpenSemesterModal}>
                  Agregar semestre
                </Button>
              </Group>
            </Group>
            {sortedSemesters.length === 0 ? (
              <Alert color="blue" variant="light" icon={<IconCalendarEvent size={16} />}>
                No hay semestres definidos para este programa. Crea semestres desde la tabla principal o mediante la API.
              </Alert>
            ) : (
              <Accordion
                multiple
                radius="md"
                variant="contained"
              >
                {sortedSemesters.map((semester) => (
                    <Accordion.Item key={semester.id} value={String(semester.id)}>
                      <Accordion.Control>{renderSemesterHeader(semester)}</Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="md" pt="sm">
                          <Divider my="xs" label="Cursos del semestre" labelPosition="center" />
                          {renderCourses(coursesBySemester.get(semester.id) ?? [])}
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
              </Accordion>
            )}
          </Stack>
        </Card>
      </Stack>
    )
  }

  return (
    <DashboardLayout title={programTitle} subtitle={programSubtitle} actions={pageActions}>
      {content()}

      <Modal
        opened={semesterModalOpen}
        onClose={() => {
          if (isSubmittingSemester) return
          handleCloseSemesterModal()
        }}
        title="Agregar semestre"
        size="lg"
        centered
      >
        <form onSubmit={handleSemesterSubmit(submitSemester)}>
          <Stack gap="md">
            <Controller
              name="semester_number"
              control={semesterControl}
              render={({ field }) => (
                <NumberInput
                  label="Número de semestre"
                  min={1}
                  value={typeof field.value === 'number' ? field.value : field.value ?? undefined}
                  onChange={(value) => field.onChange(typeof value === 'number' ? value : value === '' ? '' : value)}
                  error={semesterErrors.semester_number?.message}
                />
              )}
            />
            <TextInput
              label="Título del semestre"
              placeholder="Semestre 1"
              {...registerSemester('label')}
              error={semesterErrors.label?.message}
            />
            <Textarea
              label="Descripción (opcional)"
              minRows={3}
              placeholder="Detalle qué aborda este semestre"
              {...registerSemester('description')}
              error={semesterErrors.description?.message}
            />
            <Controller
              name="state"
              control={semesterControl}
              render={({ field }) => (
                <Select
                  {...field}
                  label="Estado"
                  data={semesterStateOptions}
                  error={semesterErrors.state?.message}
                  nothingFoundMessage="Sin coincidencias"
                />
              )}
            />
            <Controller
              name="is_active"
              control={semesterControl}
              render={({ field }) => (
                <Switch
                  label={field.value ? 'Semestre activo' : 'Semestre inactivo'}
                  checked={field.value}
                  onChange={(event) => field.onChange(event.currentTarget.checked)}
                />
              )}
            />
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={(event) => {
                  event.preventDefault()
                  if (isSubmittingSemester) return
                  handleCloseSemesterModal()
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmittingSemester} leftSection={<IconPlus size={16} />}>
                Guardar semestre
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={courseModal.open}
        onClose={() => {
          if (isSubmitting || courseActionLoading) return
          handleCloseCourseModal()
        }}
        title={`Agregar curso a ${courseModal.semester?.label || `semestre ${courseModal.semester?.semester_number ?? ''}`}`}
        size="lg"
        centered
      >
        <form onSubmit={handleSubmit(submitCourse)}>
          <Stack gap="md">
            <Controller
              name="subject_id"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  label="Asignatura"
                  placeholder="Selecciona la asignatura"
                  data={subjectOptions}
                  searchable
                  nothingFoundMessage="Sin coincidencias"
                  error={errors.subject_id?.message}
                />
              )}
            />
            <Controller
              name="teacher_id"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  label="Profesor"
                  placeholder="Selecciona el profesor"
                  data={teacherOptions}
                  searchable
                  nothingFoundMessage="Sin coincidencias"
                  error={errors.teacher_id?.message}
                />
              )}
            />
            <TextInput
              label="Periodo académico"
              placeholder="2025-1"
              {...register('term')}
              error={errors.term?.message}
            />
            <TextInput
              label="Grupo (opcional)"
              placeholder="A"
              {...register('group')}
              error={errors.group?.message}
            />
            <Controller
              name="weekly_hours"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Horas semanales (opcional)"
                  min={0}
                  value={typeof field.value === 'number' ? field.value : field.value ?? undefined}
                  onChange={(value) => field.onChange(typeof value === 'number' ? value : value === '' ? undefined : value)}
                  error={errors.weekly_hours?.message}
                />
              )}
            />
            <Controller
              name="capacity"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Capacidad (opcional)"
                  min={0}
                  value={typeof field.value === 'number' ? field.value : field.value ?? undefined}
                  onChange={(value) => field.onChange(typeof value === 'number' ? value : value === '' ? undefined : value)}
                  error={errors.capacity?.message}
                />
              )}
            />

            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={(event) => {
                  event.preventDefault()
                  if (isSubmitting || courseActionLoading) return
                  handleCloseCourseModal()
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting || courseActionLoading} leftSection={<IconPlus size={16} />}>
                Guardar curso
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={courseToRemove != null}
        onClose={() => {
          if (deleting) return
          setCourseToRemove(null)
        }}
        title="Eliminar curso del semestre"
        size="md"
        centered
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            Esta acción removerá el curso del semestre seleccionado. También se eliminarán horarios y evaluaciones asociadas. Esta operación no se puede deshacer.
          </Alert>
          {courseToRemove ? (
            <Card withBorder radius="md" padding="md">
              <Stack gap={4}>
                <Text fw={600}>{subjectById.get(courseToRemove.subject_id ?? -1)?.name || courseToRemove.subject?.name || `Curso ${courseToRemove.id}`}</Text>
                {courseToRemove.term ? <Text size="sm" c="dimmed">Periodo {courseToRemove.term}</Text> : null}
              </Stack>
            </Card>
          ) : null}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setCourseToRemove(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button color="red" onClick={() => void handleDeleteCourse()} loading={deleting} leftSection={<IconTrash size={16} />}>
              Eliminar curso
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={semesterToRemove != null}
        onClose={() => {
          if (deleting) return
          setSemesterToRemove(null)
        }}
        title="Eliminar semestre completo"
        size="md"
        centered
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            Borrar un semestre eliminará todos los cursos asociados y puede dejar matrículas sin planificar. Asegúrate de informar a docentes y estudiantes antes de continuar.
          </Alert>
          {semesterToRemove ? (
            <Card withBorder radius="md" padding="md">
              <Stack gap={4}>
                <Text fw={600}>{semesterToRemove.label || `Semestre ${semesterToRemove.semester_number ?? ''}`}</Text>
                {semesterToRemove.description ? <Text size="sm" c="dimmed">{semesterToRemove.description}</Text> : null}
              </Stack>
            </Card>
          ) : null}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setSemesterToRemove(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button color="red" onClick={() => void handleDeleteSemester()} loading={deleting} leftSection={<IconTrash size={16} />}>
              Eliminar semestre
            </Button>
          </Group>
        </Stack>
      </Modal>
    </DashboardLayout>
  )
}
