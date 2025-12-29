import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Divider,
  Drawer,
  FileInput,
  Group,
  Loader,
  RingProgress,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { IconAlertCircle, IconArrowLeft, IconBook2, IconCheck, IconFileDescription, IconLink, IconUpload } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../dashboards/DashboardLayout'
import {
  Assignment,
  AssignmentSubmission,
  Course,
  CourseMaterial,
  SubmissionCreatePayload,
  fetchAssignments,
  fetchCourseMaterials,
  fetchCourses,
  fetchSubmissions,
  submitAssignment,
} from '../../lib/learning'
import { useAuth } from '../../lib/auth'
import { buildAuthorizedFileUrl, uploadFile } from '../../lib/files'

const formatDate = (date?: string | null) => {
  if (!date) return 'Sin fecha'
  try {
    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date))
  } catch {
    return date
  }
}

const formatBytes = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`
}

type AssignmentState = 'pendiente' | 'entregada' | 'calificada'

const getAssignmentState = (assignment: Assignment, submission?: AssignmentSubmission | null): AssignmentState => {
  if (submission?.grade_score !== undefined && submission?.grade_score !== null) return 'calificada'
  if (submission) return 'entregada'
  return 'pendiente'
}

export default function StudentLearningPage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null)
  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissionsMap, setSubmissionsMap] = useState<Record<number, AssignmentSubmission | null>>({})
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null)
  const [submissionPayload, setSubmissionPayload] = useState<SubmissionCreatePayload>({
    text_response: '',
    external_url: '',
    file_url: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [fileUploading, setFileUploading] = useState(false)
  const [fileUploadError, setFileUploadError] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null)
  const [fileInputValue, setFileInputValue] = useState<File | null>(null)
  const { token } = useAuth()

  const resolveFileUrl = useCallback(
    (url?: string | null) => {
      if (!url) return undefined
      return buildAuthorizedFileUrl(url, token) ?? url
    },
    [token],
  )

  useEffect(() => {
    const loadCourses = async () => {
      setLoadingCourses(true)
      setError(null)
      try {
        const data = await fetchCourses()
        setCourses(data)
        setSelectedCourse((prev) => prev ?? data[0]?.id ?? null)
      } catch (e: any) {
        const detail = e?.response?.data?.detail || e?.message || 'No pudimos cargar tus cursos'
        setError(detail)
      } finally {
        setLoadingCourses(false)
      }
    }
    void loadCourses()
  }, [])

  const loadContent = useCallback(async (courseId: number | null) => {
    if (!courseId) {
      setMaterials([])
      setAssignments([])
      setSubmissionsMap({})
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
      if (assignmentData.length) {
        const entries = await Promise.all(
          assignmentData.map(async (assignment) => {
            try {
              const submissionList = await fetchSubmissions(assignment.id, true)
              return [assignment.id, submissionList[0] ?? null] as const
            } catch {
              return [assignment.id, null] as const
            }
          })
        )
        setSubmissionsMap(Object.fromEntries(entries))
      } else {
        setSubmissionsMap({})
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos cargar el contenido del curso'
      setError(detail)
    } finally {
      setLoadingContent(false)
    }
  }, [])

  useEffect(() => {
    void loadContent(selectedCourse)
  }, [loadContent, selectedCourse])

  const assignmentStats = useMemo(() => {
    const base = { pendiente: 0, entregada: 0, calificada: 0 }
    assignments.forEach((assignment) => {
      const submission = submissionsMap[assignment.id]
      const state = getAssignmentState(assignment, submission)
      base[state] += 1
    })
    return base
  }, [assignments, submissionsMap])

  const handleOpenDrawer = (assignment: Assignment) => {
    setActiveAssignment(assignment)
    const submission = submissionsMap[assignment.id]
    setSubmissionPayload({
      text_response: submission?.text_response ?? '',
      external_url: submission?.external_url ?? '',
      file_url: submission?.file_url ?? '',
    })
    setFileInfo(submission?.file_url ? { name: submission.file_url.split('/').pop() ?? 'Archivo adjunto', size: 0 } : null)
    setFileUploadError(null)
    setFileInputValue(null)
    setFileUploading(false)
    setSubmissionError(null)
    setDrawerOpen(true)
  }

  const handleSubmitAssignment = async () => {
    if (!activeAssignment) return
    setSubmissionError(null)
    setSubmitting(true)
    try {
      const payload: SubmissionCreatePayload = {
        text_response: submissionPayload.text_response?.trim() || undefined,
        external_url: submissionPayload.external_url?.trim() || undefined,
        file_url: submissionPayload.file_url?.trim() || undefined,
      }
      const submission = await submitAssignment(activeAssignment.id, payload)
      setSubmissionsMap((prev) => ({ ...prev, [activeAssignment.id]: submission }))
      setDrawerOpen(false)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos registrar tu entrega'
      setSubmissionError(detail)
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileUpload = async (file: File | null) => {
    setFileInputValue(file)
    if (!file) return
    setFileUploadError(null)
    setFileUploading(true)
    try {
      const uploaded = await uploadFile(file, 'assignment_submission')
      setSubmissionPayload((prev) => ({ ...prev, file_url: uploaded.download_url }))
      setFileInfo({ name: uploaded.original_name, size: uploaded.size_bytes })
      setFileInputValue(null)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No pudimos subir el archivo'
      setFileUploadError(detail)
    } finally {
      setFileUploading(false)
    }
  }

  const handleRemoveFile = () => {
    setSubmissionPayload((prev) => ({ ...prev, file_url: '' }))
    setFileInfo(null)
    setFileInputValue(null)
  }

  const selectedCourseInfo = useMemo(() => courses.find((c) => c.id === selectedCourse), [courses, selectedCourse])

  return (
    <DashboardLayout
      title="Materiales y evaluaciones"
      subtitle="Encuentra todo lo que necesitas para tus clases"
      actions={
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={14} />} onClick={() => navigate('/dashboard/student')}>
            Volver al panel
          </Button>
        </Group>
      }
    >
      <Stack gap="lg">
        <Card withBorder padding="lg" radius="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-end">
              <div>
                <Title order={4}>Selecciona un curso</Title>
                <Text size="sm" c="dimmed">
                  {selectedCourseInfo ? `Term ${selectedCourseInfo.term} · Grupo ${selectedCourseInfo.group}` : 'Tus cursos activos aparecerán aquí'}
                </Text>
              </div>
              <Tooltip label="Actualiza la lista de cursos">
                <ActionIcon variant="light" onClick={() => void (async () => {
                  setSelectedCourse(null)
                  await loadContent(null)
                  const refreshed = await fetchCourses()
                  setCourses(refreshed)
                  setSelectedCourse(refreshed[0]?.id ?? null)
                })()} aria-label="Actualizar cursos">
                  <IconBook2 size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {loadingCourses ? (
              <Group justify="center" py="md">
                <Loader />
              </Group>
            ) : courses.length ? (
              <Select
                data={courses.map((course) => ({
                  value: String(course.id),
                  label: `Curso ${course.id} · Grupo ${course.group}`,
                }))}
                value={selectedCourse ? String(selectedCourse) : null}
                onChange={(value) => setSelectedCourse(value ? Number(value) : null)}
                placeholder="Elige un curso"
              />
            ) : (
              <Alert color="yellow" title="Sin cursos disponibles">
                No encontramos cursos asignados a tu cuenta. Revisa con tu coordinación académica.
              </Alert>
            )}
          </Stack>
        </Card>

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>
        )}

        <Tabs defaultValue="materials" keepMounted={false} variant="pills">
          <Tabs.List>
            <Tabs.Tab value="materials">Materiales</Tabs.Tab>
            <Tabs.Tab value="assignments">Evaluaciones y tareas</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="materials" pt="md">
            {loadingContent ? (
              <Group justify="center" py="xl"><Loader /></Group>
            ) : materials.length ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                {materials.map((material) => (
                  <Card key={material.id} withBorder radius="lg" padding="md" className="hover-card">
                    <Stack gap={6}>
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={600}>{material.title}</Text>
                          {material.description && <Text size="sm" c="dimmed">{material.description}</Text>}
                        </div>
                        <Badge variant="light" color="dark" radius="sm">
                          {material.material_type}
                        </Badge>
                      </Group>
                      <Divider my="xs" />
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
                          >
                            Recurso externo
                          </Button>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">Publicado {formatDate(material.published_at)}</Text>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            ) : (
              <Alert color="blue" variant="light">Aún no hay materiales publicados para este curso.</Alert>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="assignments" pt="md">
            {loadingContent ? (
              <Group justify="center" py="xl"><Loader /></Group>
            ) : assignments.length ? (
              <Stack gap="lg">
                <Group align="stretch">
                  {(['pendiente', 'entregada', 'calificada'] as AssignmentState[]).map((state) => {
                    const total = assignments.length
                    const count = assignmentStats[state]
                    const percentage = total ? Math.round((count / total) * 100) : 0
                    const tone = state === 'pendiente' ? 'gray' : state === 'entregada' ? 'yellow' : 'teal'
                    const label = state === 'pendiente' ? 'Pendientes' : state === 'entregada' ? 'Entregadas' : 'Calificadas'
                    return (
                      <Card key={state} withBorder radius="lg" style={{ flex: 1 }}>
                        <Group justify="space-between" align="center" gap="md" wrap="nowrap">
                          <Stack gap={2} style={{ flex: 1 }}>
                            <Text size="sm" c="dimmed">{label}</Text>
                            <Title order={2}>{count}</Title>
                            <Text size="xs" c="dimmed">{percentage}% del total</Text>
                          </Stack>
                          <RingProgress
                            size={76}
                            thickness={8}
                            sections={[{ value: percentage, color: tone }]}
                            label={(
                              <Center h="100%" w="100%">
                                <Text size="xs" fw={600}>{percentage}%</Text>
                              </Center>
                            )}
                            style={{ minWidth: 76 }}
                          />
                        </Group>
                      </Card>
                    )
                  })}
                </Group>

                <Stack gap="md">
                  {assignments.map((assignment) => {
                    const submission = submissionsMap[assignment.id]
                    const state = getAssignmentState(assignment, submission)
                    const late = submission?.is_late
                    return (
                      <Card key={assignment.id} withBorder radius="lg">
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start">
                            <div>
                              <Title order={5}>{assignment.title}</Title>
                              {assignment.instructions && <Text size="sm" c="dimmed">{assignment.instructions}</Text>}
                            </div>
                            <Badge color={state === 'calificada' ? 'teal' : state === 'entregada' ? 'yellow' : 'gray'}>
                              {state.toUpperCase()}
                            </Badge>
                          </Group>
                          <Text size="sm" c="dimmed">Entrega límite: {formatDate(assignment.due_date)}</Text>
                          {submission?.grade_score != null && (
                            <Text size="sm" fw={600}>Nota: {submission.grade_score} / {assignment.max_score}</Text>
                          )}
                          {submission?.feedback && (
                            <Alert color="teal" variant="light" icon={<IconCheck size={14} />}>
                              {submission.feedback}
                            </Alert>
                          )}
                          <Group gap="xs">
                            <Button
                              variant="light"
                              color="dark"
                              leftSection={<IconUpload size={16} />}
                              onClick={() => handleOpenDrawer(assignment)}
                            >
                              {submission ? 'Actualizar entrega' : 'Entregar ahora'}
                            </Button>
                            {assignment.resource_url && (
                              <Button
                                component="a"
                                href={assignment.resource_url}
                                target="_blank"
                                rel="noreferrer"
                                variant="subtle"
                                leftSection={<IconLink size={16} />}
                              >
                                Guía del docente
                              </Button>
                            )}
                          </Group>
                          {late && (
                            <Alert color="red" variant="light" icon={<IconAlertCircle size={14} />}>
                              Tu entrega anterior se registró fuera de plazo.
                            </Alert>
                          )}
                        </Stack>
                      </Card>
                    )
                  })}
                </Stack>
              </Stack>
            ) : (
              <Alert color="blue" variant="light">No hay evaluaciones activas para este curso.</Alert>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <Drawer opened={drawerOpen} onClose={() => setDrawerOpen(false)} position="right" size="lg" title={activeAssignment?.title ?? 'Entrega'}>
        {activeAssignment ? (
          <Stack gap="md">
            <Text c="dimmed">{activeAssignment.instructions || 'Describe tu entrega y adjunta enlaces necesarios.'}</Text>
            {submissionError && <Alert color="red">{submissionError}</Alert>}
            <Textarea
              label="Respuesta textual"
              minRows={4}
              value={submissionPayload.text_response ?? ''}
              onChange={(event) => setSubmissionPayload((prev) => ({ ...prev, text_response: event.currentTarget.value }))}
            />
            <TextInput
              label="Enlace externo"
              placeholder="https://..."
              value={submissionPayload.external_url ?? ''}
              onChange={(event) => setSubmissionPayload((prev) => ({ ...prev, external_url: event.currentTarget.value }))}
            />
            <FileInput
              label="Subir archivo (opcional)"
              placeholder="Selecciona un archivo"
              value={fileInputValue}
              onChange={(file) => void handleFileUpload(file)}
              disabled={fileUploading}
            />
            {fileUploadError && <Alert color="red" variant="light">{fileUploadError}</Alert>}
            {submissionPayload.file_url && (
              <Alert color="blue" variant="light">
                <Stack gap={4}>
                  <Text size="sm">Archivo listo: {fileInfo?.name || 'Archivo adjunto'} · {formatBytes(fileInfo?.size)}</Text>
                  <Group gap="xs">
                    <Button
                      component="a"
                          href={resolveFileUrl(submissionPayload.file_url)}
                      target="_blank"
                      rel="noreferrer"
                      variant="light"
                      size="compact-sm"
                    >
                      Ver archivo
                    </Button>
                    <Button variant="subtle" color="red" size="compact-sm" onClick={handleRemoveFile}>Quitar</Button>
                  </Group>
                </Stack>
              </Alert>
            )}
            <TextInput
              label="Archivo (URL manual)"
              placeholder="https://tu-archivo.pdf"
              value={submissionPayload.file_url ?? ''}
              onChange={(event) => setSubmissionPayload((prev) => ({ ...prev, file_url: event.currentTarget.value }))}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
              <Button loading={submitting} onClick={() => void handleSubmitAssignment()} leftSection={<IconCheck size={16} />}>
                Guardar entrega
              </Button>
            </Group>
          </Stack>
        ) : (
          <Loader />
        )}
      </Drawer>
    </DashboardLayout>
  )
}
