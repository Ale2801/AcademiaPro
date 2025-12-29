import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  FileInput,
  Group,
  Image,
  Loader,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowLeft, IconCheck, IconListDetails, IconNotebook, IconPlus, IconTrash } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../dashboards/DashboardLayout'
import {
  Assignment,
  AssignmentPayload,
  AssignmentSubmission,
  Course,
  CourseMaterial,
  CourseMaterialPayload,
  SubmissionGradePayload,
  createAssignment,
  createCourseMaterial,
  deleteAssignment,
  deleteCourseMaterial,
  fetchAssignments,
  fetchCourseMaterials,
  fetchCourses,
  fetchSubmissions,
  gradeSubmission,
  updateAssignment,
  updateCourseMaterial,
} from '../../lib/learning'
import { useAuth } from '../../lib/auth'
import { buildAuthorizedFileUrl, uploadFile } from '../../lib/files'

const materialTypeOptions = [
  { value: 'document', label: 'Documento' },
  { value: 'link', label: 'Enlace' },
  { value: 'video', label: 'Video' },
  { value: 'resource', label: 'Recurso' },
  { value: 'other', label: 'Otro' },
]

const assignmentTypeOptions = [
  { value: 'homework', label: 'Tarea' },
  { value: 'project', label: 'Proyecto' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'exam', label: 'Examen' },
  { value: 'other', label: 'Otro' },
]

const formatBytes = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

const extractFileName = (url?: string | null) => {
  if (!url) return ''
  try {
    const clean = url.split('?')[0]
    const segments = clean.split('/')
    return decodeURIComponent(segments[segments.length - 1] ?? '')
  } catch {
    return url
  }
}

const looksLikeImage = (value?: string | null) => {
  if (!value) return false
  const clean = value.split('?')[0]?.toLowerCase() ?? ''
  return /(\.png|\.jpe?g|\.gif|\.bmp|\.webp|\.svg)$/.test(clean)
}

export default function TeacherLearningPage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null)
  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [materialModalOpen, setMaterialModalOpen] = useState(false)
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
    published_at: undefined,
  })

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  const [assignmentEditing, setAssignmentEditing] = useState<Assignment | null>(null)
  const [assignmentForm, setAssignmentForm] = useState<AssignmentPayload>({
    course_id: 0,
    title: '',
    instructions: '',
    assignment_type: 'homework',
    available_from: '',
    due_date: '',
    allow_late: false,
    max_score: 100,
    resource_url: '',
    attachment_url: '',
    attachment_name: '',
    is_published: true,
    published_at: '',
  })

  const [submissionsDrawerOpen, setSubmissionsDrawerOpen] = useState(false)
  const [drawerAssignment, setDrawerAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [gradingDrafts, setGradingDrafts] = useState<Record<number, { score: string; feedback: string }>>({})
  const [gradingError, setGradingError] = useState<string | null>(null)
  const [materialFileLoading, setMaterialFileLoading] = useState(false)
  const [materialFileError, setMaterialFileError] = useState<string | null>(null)
  const [materialFileValue, setMaterialFileValue] = useState<File | null>(null)
  const [materialUploadedName, setMaterialUploadedName] = useState('')
  const [materialUploadedSize, setMaterialUploadedSize] = useState<number | null>(null)
  const [materialPreviewUrl, setMaterialPreviewUrl] = useState<string | null>(null)
  const [assignmentFileLoading, setAssignmentFileLoading] = useState(false)
  const [assignmentFileError, setAssignmentFileError] = useState<string | null>(null)
  const [assignmentFileValue, setAssignmentFileValue] = useState<File | null>(null)
  const { token } = useAuth()

  const resolveFileUrl = useCallback(
    (url?: string | null) => {
      if (!url) return undefined
      return buildAuthorizedFileUrl(url, token) ?? url
    },
    [token],
  )

  const refreshCourses = useCallback(async () => {
    setLoadingCourses(true)
    setError(null)
    try {
      const data = await fetchCourses()
      setCourses(data)
      setSelectedCourse((prev) => prev ?? data[0]?.id ?? null)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos cargar tus cursos asignados'
      setError(detail)
    } finally {
      setLoadingCourses(false)
    }
  }, [])

  useEffect(() => {
    void refreshCourses()
  }, [refreshCourses])

  const loadContent = useCallback(async (courseId: number | null) => {
    if (!courseId) {
      setMaterials([])
      setAssignments([])
      return
    }
    setLoadingContent(true)
    setError(null)
    try {
      const [materialData, assignmentData] = await Promise.all([
        fetchCourseMaterials(courseId),
        fetchAssignments(courseId),
      ])
      setMaterials(materialData)
      setAssignments(assignmentData)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo cargar la información del curso'
      setError(detail)
    } finally {
      setLoadingContent(false)
    }
  }, [])

  useEffect(() => {
    void loadContent(selectedCourse)
  }, [loadContent, selectedCourse])

  const openMaterialModal = (material?: CourseMaterial) => {
    setMaterialEditing(material ?? null)
    setMaterialForm({
      course_id: selectedCourse ?? 0,
      title: material?.title ?? '',
      description: material?.description ?? '',
      material_type: material?.material_type ?? 'document',
      file_url: material?.file_url ?? '',
      external_url: material?.external_url ?? '',
      display_order: material?.display_order ?? undefined,
      is_published: material?.is_published ?? true,
      published_at: material?.published_at ?? '',
    })
    setMaterialUploadedName(material?.file_url ? extractFileName(material.file_url) : '')
    setMaterialUploadedSize(null)
    setMaterialPreviewUrl(material?.file_url && looksLikeImage(material.file_url) ? material.file_url : null)
    setMaterialFileValue(null)
    setMaterialFileError(null)
    setMaterialModalOpen(true)
  }

  const openAssignmentModal = (assignment?: Assignment) => {
    setAssignmentEditing(assignment ?? null)
    setAssignmentForm({
      course_id: selectedCourse ?? 0,
      title: assignment?.title ?? '',
      instructions: assignment?.instructions ?? '',
      assignment_type: assignment?.assignment_type ?? 'homework',
      available_from: assignment?.available_from ?? '',
      due_date: assignment?.due_date ?? '',
      allow_late: assignment?.allow_late ?? false,
      max_score: assignment?.max_score ?? 100,
      resource_url: assignment?.resource_url ?? '',
      attachment_url: assignment?.attachment_url ?? '',
      attachment_name: assignment?.attachment_name ?? '',
      is_published: assignment?.is_published ?? true,
      published_at: assignment?.published_at ?? '',
    })
    setAssignmentModalOpen(true)
  }

  const handleMaterialSubmit = async () => {
    if (!selectedCourse) return
    const payload: CourseMaterialPayload = {
      ...materialForm,
      course_id: selectedCourse,
      title: materialForm.title.trim(),
      description: materialForm.description?.trim() || undefined,
      file_url: materialForm.file_url?.trim() || undefined,
      external_url: materialForm.external_url?.trim() || undefined,
      display_order: materialForm.display_order,
      published_at: materialForm.published_at?.trim() || undefined,
    }
    try {
      if (materialEditing) {
        await updateCourseMaterial(materialEditing.id, payload)
      } else {
        await createCourseMaterial(payload)
      }
      setMaterialModalOpen(false)
      await loadContent(selectedCourse)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo guardar el material'
      setError(detail)
    }
  }

  const handleAssignmentSubmit = async () => {
    if (!selectedCourse) return
    const payload: AssignmentPayload = {
      ...assignmentForm,
      course_id: selectedCourse,
      title: assignmentForm.title.trim(),
      instructions: assignmentForm.instructions?.trim() || undefined,
      available_from: assignmentForm.available_from?.trim() || undefined,
      due_date: assignmentForm.due_date?.trim() || undefined,
      resource_url: assignmentForm.resource_url?.trim() || undefined,
      attachment_url: assignmentForm.attachment_url?.trim() || undefined,
      attachment_name: assignmentForm.attachment_name?.trim() || undefined,
      published_at: assignmentForm.published_at?.trim() || undefined,
    }
    try {
      if (assignmentEditing) {
        await updateAssignment(assignmentEditing.id, payload)
      } else {
        await createAssignment(payload)
      }
      setAssignmentModalOpen(false)
      await loadContent(selectedCourse)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo guardar la evaluación'
      setError(detail)
    }
  }

  const handleMaterialFileUpload = async (file: File | null) => {
    setMaterialFileValue(file)
    if (!file) return
    setMaterialFileError(null)
    const prevName = materialUploadedName
    const prevSize = materialUploadedSize
    const prevPreview = materialPreviewUrl
    let tempPreview: string | null = null
    if (file.type?.startsWith('image/')) {
      tempPreview = URL.createObjectURL(file)
      setMaterialPreviewUrl(tempPreview)
    } else {
      setMaterialPreviewUrl(null)
    }
    setMaterialUploadedName(file.name)
    setMaterialUploadedSize(file.size)
    setMaterialFileLoading(true)
    try {
      const uploaded = await uploadFile(file, 'course_material')
      setMaterialForm((prev) => ({ ...prev, file_url: uploaded.download_url }))
      setMaterialUploadedName(uploaded.original_name ?? file.name)
      setMaterialUploadedSize(uploaded.size_bytes ?? file.size)
      const previewTarget = file.type?.startsWith('image/') || looksLikeImage(uploaded.download_url)
        ? uploaded.download_url
        : null
      setMaterialPreviewUrl(previewTarget)
      setMaterialFileValue(null)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos subir el archivo'
      setMaterialFileError(detail)
      setMaterialUploadedName(prevName)
      setMaterialUploadedSize(prevSize)
      setMaterialPreviewUrl(prevPreview)
    } finally {
      setMaterialFileLoading(false)
      if (tempPreview) {
        URL.revokeObjectURL(tempPreview)
      }
    }
  }

  const handleAssignmentFileUpload = async (file: File | null) => {
    setAssignmentFileValue(file)
    if (!file) return
    setAssignmentFileError(null)
    setAssignmentFileLoading(true)
    try {
      const uploaded = await uploadFile(file, 'assignment_attachment')
      setAssignmentForm((prev) => ({ ...prev, attachment_url: uploaded.download_url, attachment_name: uploaded.original_name }))
      setAssignmentFileValue(null)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos subir el adjunto'
      setAssignmentFileError(detail)
    } finally {
      setAssignmentFileLoading(false)
    }
  }

  const handleRemoveMaterialFile = () => {
    setMaterialForm((prev) => ({ ...prev, file_url: '' }))
    setMaterialFileValue(null)
    setMaterialUploadedName('')
    setMaterialUploadedSize(null)
    setMaterialPreviewUrl(null)
  }

  const handleRemoveAssignmentFile = () => {
    setAssignmentForm((prev) => ({ ...prev, attachment_url: '', attachment_name: '' }))
    setAssignmentFileValue(null)
  }

  const handleDeleteMaterial = async (material: CourseMaterial) => {
    if (!selectedCourse) return
    try {
      await deleteCourseMaterial(material.id)
      await loadContent(selectedCourse)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo eliminar el material'
      setError(detail)
    }
  }

  const handleDeleteAssignment = async (assignment: Assignment) => {
    if (!selectedCourse) return
    try {
      await deleteAssignment(assignment.id)
      await loadContent(selectedCourse)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo eliminar la evaluación'
      setError(detail)
    }
  }

  const openSubmissionsDrawer = async (assignment: Assignment) => {
    setDrawerAssignment(assignment)
    setSubmissionsDrawerOpen(true)
    setSubmissions([])
    setGradingDrafts({})
    setGradingError(null)
    setSubmissionsLoading(true)
    try {
      const data = await fetchSubmissions(assignment.id)
      setSubmissions(data)
      const drafts: Record<number, { score: string; feedback: string }> = {}
      data.forEach((submission) => {
        drafts[submission.id] = {
          score: submission.grade_score != null ? String(submission.grade_score) : '',
          feedback: submission.feedback ?? '',
        }
      })
      setGradingDrafts(drafts)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos cargar las entregas'
      setGradingError(detail)
    } finally {
      setSubmissionsLoading(false)
    }
  }

  const handleGradeSubmission = async (submission: AssignmentSubmission) => {
    const draft = gradingDrafts[submission.id]
    if (!draft) return
    const scoreValue = Number(draft.score)
    if (Number.isNaN(scoreValue)) {
      setGradingError('Debes ingresar una calificación numérica válida')
      return
    }
    const payload: SubmissionGradePayload = {
      score: scoreValue,
      feedback: draft.feedback?.trim() || undefined,
    }
    try {
      const updated = await gradeSubmission(submission.id, payload)
      setSubmissions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos registrar la calificación'
      setGradingError(detail)
    }
  }

  const selectedCourseInfo = useMemo(() => courses.find((c) => c.id === selectedCourse), [courses, selectedCourse])

  return (
    <DashboardLayout
      title="Gestión de materiales y evaluaciones"
      subtitle="Publica recursos y revisa entregas sin salir del panel"
      actions={
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={14} />} onClick={() => navigate('/dashboard/teacher')}>
            Volver al panel
          </Button>
        </Group>
      }
    >
      <Stack gap="lg">
        <Card withBorder radius="lg" padding="lg">
          <Stack gap="xs">
            <Group justify="space-between" align="flex-end">
              <div>
                <Title order={4}>Sección activa</Title>
                <Text size="sm" c="dimmed">
                  {selectedCourseInfo ? `Term ${selectedCourseInfo.term} · Grupo ${selectedCourseInfo.group}` : 'Selecciona la clase que deseas gestionar'}
                </Text>
              </div>
              <Button variant="light" size="compact-md" onClick={() => void refreshCourses()}>
                Actualizar asignaciones
              </Button>
            </Group>
            {loadingCourses ? (
              <Group justify="center" py="md"><Loader /></Group>
            ) : courses.length ? (
              <Select
                placeholder="Elige un curso"
                value={selectedCourse ? String(selectedCourse) : null}
                onChange={(value) => setSelectedCourse(value ? Number(value) : null)}
                data={courses.map((course) => ({ value: String(course.id), label: `Curso ${course.id} · Grupo ${course.group}` }))}
              />
            ) : (
              <Alert color="yellow">No tienes cursos asignados por ahora.</Alert>
            )}
          </Stack>
        </Card>

        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}

        <Tabs defaultValue="materials" keepMounted={false} variant="outline">
          <Tabs.List>
            <Tabs.Tab value="materials">Materiales</Tabs.Tab>
            <Tabs.Tab value="assignments">Evaluaciones y tareas</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="materials" pt="md">
            <Group justify="space-between" align="center" mb="md">
              <div>
                <Title order={5}>Recursos publicados</Title>
                <Text size="sm" c="dimmed">Organiza tus archivos, enlaces y guías</Text>
              </div>
              <Button leftSection={<IconPlus size={16} />} onClick={() => openMaterialModal()}>Nuevo material</Button>
            </Group>
            {loadingContent ? (
              <Group justify="center" py="xl"><Loader /></Group>
            ) : materials.length ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                {materials.map((material) => (
                  <Card key={material.id} withBorder radius="lg" padding="md">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={600}>{material.title}</Text>
                          {material.description && <Text size="sm" c="dimmed">{material.description}</Text>}
                        </div>
                        <Badge color={material.is_published ? 'teal' : 'gray'}>{material.material_type}</Badge>
                      </Group>
                      <Text size="xs" c="dimmed">Última actualización: {material.updated_at?.slice(0, 16).replace('T', ' ')}</Text>
                      <Group gap="xs">
                        <Button size="compact-sm" variant="light" onClick={() => openMaterialModal(material)}>Editar</Button>
                        <Button size="compact-sm" variant="outline" color="red" leftSection={<IconTrash size={14} />} onClick={() => void handleDeleteMaterial(material)}>
                          Eliminar
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            ) : (
              <Alert color="blue" variant="light">Aún no has publicado materiales en esta clase.</Alert>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="assignments" pt="md">
            <Group justify="space-between" align="center" mb="md">
              <div>
                <Title order={5}>Evaluaciones activas</Title>
                <Text size="sm" c="dimmed">Configura tareas, proyectos o exámenes y monitorea las entregas</Text>
              </div>
              <Button leftSection={<IconNotebook size={16} />} onClick={() => openAssignmentModal()}>Nueva evaluación</Button>
            </Group>
            {loadingContent ? (
              <Group justify="center" py="xl"><Loader /></Group>
            ) : assignments.length ? (
              <Stack gap="md">
                {assignments.map((assignment) => (
                  <Card key={assignment.id} withBorder radius="lg">
                    <Stack gap={6}>
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Title order={5}>{assignment.title}</Title>
                          {assignment.instructions && <Text size="sm" c="dimmed">{assignment.instructions}</Text>}
                        </div>
                        <Badge color={assignment.is_published ? 'teal' : 'gray'}>{assignment.assignment_type}</Badge>
                      </Group>
                      <Text size="sm" c="dimmed">Disponible desde: {assignment.available_from || 'Inmediato'}</Text>
                      <Text size="sm" c="dimmed">Fecha límite: {assignment.due_date || 'Sin definir'}</Text>
                      <Group gap="xs">
                        <Button size="compact-sm" variant="light" leftSection={<IconListDetails size={14} />} onClick={() => void openSubmissionsDrawer(assignment)}>
                          Revisar entregas
                        </Button>
                        <Button size="compact-sm" variant="light" onClick={() => openAssignmentModal(assignment)}>Editar</Button>
                        <Button size="compact-sm" variant="outline" color="red" leftSection={<IconTrash size={14} />} onClick={() => void handleDeleteAssignment(assignment)}>
                          Eliminar
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            ) : (
              <Alert color="blue" variant="light">No tienes evaluaciones configuradas en esta sección.</Alert>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <Modal opened={materialModalOpen} onClose={() => setMaterialModalOpen(false)} title={materialEditing ? 'Editar material' : 'Nuevo material'} size="lg" centered>
        <Stack gap="sm">
          <TextInput label="Título" required value={materialForm.title} onChange={(event) => setMaterialForm((prev) => ({ ...prev, title: event.currentTarget.value }))} />
          <Textarea label="Descripción" minRows={2} value={materialForm.description ?? ''} onChange={(event) => setMaterialForm((prev) => ({ ...prev, description: event.currentTarget.value }))} />
          <Select label="Tipo" data={materialTypeOptions} value={materialForm.material_type} onChange={(value) => setMaterialForm((prev) => ({ ...prev, material_type: (value ?? 'document') as CourseMaterialPayload['material_type'] }))} />
          <FileInput
            label="Subir archivo"
            placeholder="Selecciona un archivo"
            description="El enlace se genera automáticamente al guardar"
            value={materialFileValue}
            onChange={(file) => void handleMaterialFileUpload(file)}
            disabled={materialFileLoading}
          />
          {materialFileError && <Alert color="red" variant="light">{materialFileError}</Alert>}
          {materialUploadedName && (
            <Paper withBorder radius="md" p="sm">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{materialUploadedName}</Text>
                    {materialUploadedSize ? <Text size="xs" c="dimmed">{formatBytes(materialUploadedSize)}</Text> : null}
                  </div>
                  <Group gap="xs">
                    {materialForm.file_url && (
                      <Button
                        size="compact-sm"
                        variant="light"
                        component="a"
                        href={resolveFileUrl(materialForm.file_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver archivo
                      </Button>
                    )}
                    <Button size="compact-sm" variant="subtle" color="red" onClick={handleRemoveMaterialFile}>Quitar</Button>
                  </Group>
                </Group>
                {materialPreviewUrl && (
                  <Image
                    src={resolveFileUrl(materialPreviewUrl) ?? materialPreviewUrl}
                    alt={materialUploadedName}
                    radius="md"
                    h={160}
                    fit="cover"
                  />
                )}
              </Stack>
            </Paper>
          )}
          <TextInput label="Enlace externo" placeholder="https://..." value={materialForm.external_url ?? ''} onChange={(event) => setMaterialForm((prev) => ({ ...prev, external_url: event.currentTarget.value }))} />
          <NumberInput label="Orden" value={materialForm.display_order ?? undefined} onChange={(value) => setMaterialForm((prev) => ({ ...prev, display_order: typeof value === 'number' ? value : undefined }))} />
          <SegmentedControl
            fullWidth
            data={[{ label: 'Publicado', value: 'true' }, { label: 'Borrador', value: 'false' }]}
            value={materialForm.is_published ? 'true' : 'false'}
            onChange={(value) => setMaterialForm((prev) => ({ ...prev, is_published: value === 'true' }))}
          />
          <TextInput label="Fecha de publicación (ISO)" placeholder="2025-03-10T08:00:00" value={materialForm.published_at ?? ''} onChange={(event) => setMaterialForm((prev) => ({ ...prev, published_at: event.currentTarget.value }))} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setMaterialModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleMaterialSubmit()} leftSection={<IconCheck size={16} />}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={assignmentModalOpen} onClose={() => setAssignmentModalOpen(false)} title={assignmentEditing ? 'Editar evaluación' : 'Nueva evaluación'} size="lg" centered>
        <Stack gap="sm">
          <TextInput label="Título" required value={assignmentForm.title} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, title: event.currentTarget.value }))} />
          <Textarea label="Instrucciones" minRows={3} value={assignmentForm.instructions ?? ''} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, instructions: event.currentTarget.value }))} />
          <Select label="Tipo" data={assignmentTypeOptions} value={assignmentForm.assignment_type} onChange={(value) => setAssignmentForm((prev) => ({ ...prev, assignment_type: (value ?? 'homework') as AssignmentPayload['assignment_type'] }))} />
          <Group grow>
            <TextInput label="Disponible desde (ISO)" placeholder="2025-03-10T08:00:00" value={assignmentForm.available_from ?? ''} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, available_from: event.currentTarget.value }))} />
            <TextInput label="Fecha límite (ISO)" placeholder="2025-03-17T23:59:00" value={assignmentForm.due_date ?? ''} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, due_date: event.currentTarget.value }))} />
          </Group>
          <Group grow>
            <NumberInput label="Puntaje máximo" min={1} max={1000} value={assignmentForm.max_score} onChange={(value) => setAssignmentForm((prev) => ({ ...prev, max_score: typeof value === 'number' ? value : prev.max_score }))} />
            <Switch label="Permitir atraso" checked={assignmentForm.allow_late} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, allow_late: event.currentTarget.checked }))} />
          </Group>
          <TextInput label="Recurso de referencia" placeholder="https://..." value={assignmentForm.resource_url ?? ''} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, resource_url: event.currentTarget.value }))} />
          <FileInput label="Adjuntar archivo" placeholder="Selecciona un archivo" value={assignmentFileValue} onChange={(file) => void handleAssignmentFileUpload(file)} disabled={assignmentFileLoading} />
          {assignmentFileError && <Alert color="red" variant="light">{assignmentFileError}</Alert>}
          {assignmentForm.attachment_url && (
            <Alert color="blue" variant="light">
              <Group gap="xs">
                <Text size="sm">Adjunto listo para los estudiantes.</Text>
                <Button
                  size="compact-sm"
                  component="a"
                  href={resolveFileUrl(assignmentForm.attachment_url)}
                  target="_blank"
                  rel="noreferrer"
                  variant="light"
                >
                  Ver
                </Button>
                <Button size="compact-sm" color="red" variant="subtle" onClick={handleRemoveAssignmentFile}>Quitar</Button>
              </Group>
            </Alert>
          )}
          <TextInput label="Adjunto (URL)" placeholder="https://..." value={assignmentForm.attachment_url ?? ''} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, attachment_url: event.currentTarget.value }))} />
          <TextInput label="Nombre del adjunto" value={assignmentForm.attachment_name ?? ''} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, attachment_name: event.currentTarget.value }))} />
          <SegmentedControl
            fullWidth
            data={[{ label: 'Publicado', value: 'true' }, { label: 'Borrador', value: 'false' }]}
            value={assignmentForm.is_published ? 'true' : 'false'}
            onChange={(value) => setAssignmentForm((prev) => ({ ...prev, is_published: value === 'true' }))}
          />
          <TextInput label="Fecha de publicación (ISO)" value={assignmentForm.published_at ?? ''} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, published_at: event.currentTarget.value }))} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setAssignmentModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleAssignmentSubmit()} leftSection={<IconCheck size={16} />}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Drawer
        opened={submissionsDrawerOpen}
        onClose={() => setSubmissionsDrawerOpen(false)}
        position="right"
        size="xl"
        title={drawerAssignment ? `Entregas · ${drawerAssignment.title}` : 'Entregas'}
      >
        {gradingError && <Alert color="red" mb="md">{gradingError}</Alert>}
        {submissionsLoading ? (
          <Group justify="center" py="xl"><Loader /></Group>
        ) : submissions.length ? (
          <Stack gap="md">
            {submissions.map((submission) => (
              <Card key={submission.id} withBorder radius="lg">
                <Stack gap={6}>
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Title order={5}>Estudiante #{submission.student_id}</Title>
                      <Text size="sm" c="dimmed">Estado: {submission.status}</Text>
                      <Text size="sm" c="dimmed">Enviado: {submission.submitted_at || 'Sin registro'}</Text>
                      {submission.text_response && <Text size="sm" mt={4}>{submission.text_response}</Text>}
                      {submission.external_url && (
                        <Button component="a" href={submission.external_url} target="_blank" rel="noreferrer" variant="subtle" size="compact-sm">
                          Ver enlace
                        </Button>
                      )}
                      {submission.file_url && (
                        <Button
                          component="a"
                          href={resolveFileUrl(submission.file_url)}
                          target="_blank"
                          rel="noreferrer"
                          variant="subtle"
                          size="compact-sm"
                        >
                          Descargar archivo
                        </Button>
                      )}
                    </div>
                    <Badge color={submission.grade_score != null ? 'teal' : 'gray'}>
                      {submission.grade_score != null ? `Nota ${submission.grade_score}` : 'Sin nota'}
                    </Badge>
                  </Group>
                  <Group grow>
                    <NumberInput
                      label="Calificación"
                      min={0}
                      max={drawerAssignment?.max_score ?? 100}
                      value={gradingDrafts[submission.id]?.score ?? ''}
                      onChange={(value) => setGradingDrafts((prev) => ({
                        ...prev,
                        [submission.id]: {
                          score: typeof value === 'number' ? String(value) : (value as string) ?? '',
                          feedback: prev[submission.id]?.feedback ?? '',
                        },
                      }))}
                    />
                    <Textarea
                      label="Retroalimentación"
                      minRows={2}
                      value={gradingDrafts[submission.id]?.feedback ?? ''}
                      onChange={(event) => setGradingDrafts((prev) => ({
                        ...prev,
                        [submission.id]: {
                          score: prev[submission.id]?.score ?? '',
                          feedback: event.currentTarget.value,
                        },
                      }))}
                    />
                  </Group>
                  <Group justify="flex-end">
                    <Button onClick={() => void handleGradeSubmission(submission)} leftSection={<IconCheck size={16} />}>Guardar calificación</Button>
                  </Group>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <Alert color="blue" variant="light">Aún no hay entregas para esta evaluación.</Alert>
        )}
      </Drawer>
    </DashboardLayout>
  )
}
