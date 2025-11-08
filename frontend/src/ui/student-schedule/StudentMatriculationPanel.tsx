import React, { useMemo, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Card, Divider, Group, Loader, Paper, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconBook, IconCheck, IconRefresh } from '@tabler/icons-react'
import { useStudentSemesters, getSemesterErrorMessage, ProgramSemesterSummary, StudentProgramEnrollmentSummary } from './StudentSemesterContext'

const STATE_LABELS: Record<ProgramSemesterSummary['state'], { label: string; color: string }> = {
  planned: { label: 'Planificado', color: 'blue' },
  current: { label: 'En curso', color: 'teal' },
  finished: { label: 'Finalizado', color: 'gray' },
}

const STATUS_LABELS: Record<StudentProgramEnrollmentSummary['status'], { label: string; color: string }> = {
  active: { label: 'Activo', color: 'teal' },
  completed: { label: 'Completado', color: 'gray' },
  withdrawn: { label: 'Retirado', color: 'red' },
}

type Feedback = { color: 'teal' | 'red'; message: string }

export default function StudentMatriculationPanel() {
  const { data, loading, error, needsSelection, selectSemester, refresh, selecting } = useStudentSemesters()
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busySemester, setBusySemester] = useState<number | null>(null)

  const handleRefresh = async () => {
    setFeedback(null)
    await refresh()
  }

  const handleSelect = async (semesterId: number) => {
    setBusySemester(semesterId)
    setFeedback(null)
    try {
      const response = await selectSemester(semesterId)
      const next = response.current?.program_semester
      if (next) {
        setFeedback({ color: 'teal', message: `Asignaste ${next.label ?? `Semestre ${next.semester_number}`} como semestre activo.` })
      } else {
        setFeedback({ color: 'teal', message: `Actualizaste tu selección de semestre.` })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : getSemesterErrorMessage(err)
      setFeedback({ color: 'red', message })
    } finally {
      setBusySemester(null)
    }
  }

  const activeSemester = data?.current?.program_semester ?? null
  const registrationNumber = data?.registration_number ?? null

  const orderedAvailable = useMemo(() => {
    if (!data?.available) return []
    return [...data.available].sort((a, b) => a.semester_number - b.semester_number)
  }, [data?.available])

  const history = data?.history ?? []

  return (
    <Card withBorder radius="lg" padding="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>Gestión de matrícula</Title>
            <Text size="sm" c="dimmed">Selecciona el semestre en el que cursarás tus asignaturas y consulta tu historial.</Text>
          </div>
          <Tooltip label="Actualizar" withinPortal>
            <ActionIcon
              variant="light"
              color="teal"
              onClick={() => void handleRefresh()}
              disabled={loading || selecting}
              aria-label="Actualizar información de matrícula"
            >
              {loading || selecting ? <Loader size="sm" color="teal" /> : <IconRefresh size={18} />}
            </ActionIcon>
          </Tooltip>
        </Group>

        {error && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>{error}</Alert>
        )}

        {feedback && (
          <Alert color={feedback.color} variant="light" withCloseButton onClose={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        )}

        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group gap="xs" align="center">
              <IconBook size={18} />
              <Text fw={600}>Semestre actual</Text>
            </Group>
            {activeSemester ? (
              <Group gap="sm" align="center" wrap="wrap">
                <Badge color={STATE_LABELS[activeSemester.state].color} variant="light">
                  {STATE_LABELS[activeSemester.state].label}
                </Badge>
                <Text fw={600}>{activeSemester.label ?? `Semestre ${activeSemester.semester_number}`}</Text>
                {registrationNumber && (
                  <Badge color="gray" variant="light">Matrícula {registrationNumber}</Badge>
                )}
              </Group>
            ) : (
              <Alert color="blue" variant="light" icon={<IconAlertTriangle size={18} />}>
                No tienes un semestre activo asignado. Selecciona una opción disponible para continuar.
              </Alert>
            )}
          </Stack>
        </Paper>

        {needsSelection && !loading && !error && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
            Debes elegir un semestre habilitado para continuar con tu inscripción.
          </Alert>
        )}

        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={600}>Semestres disponibles</Text>
            {selecting && <Loader size="sm" color="teal" />}
          </Group>
          {orderedAvailable.length === 0 ? (
            <Text size="sm" c="dimmed">No hay semestres habilitados en este momento.</Text>
          ) : (
            <Stack gap="sm">
              {orderedAvailable.map((semester) => {
                const stateConfig = STATE_LABELS[semester.state]
                const isCurrent = activeSemester && activeSemester.id === semester.id
                const disabled = selecting || busySemester === semester.id || semester.state === 'finished'
                const label = semester.label ?? `Semestre ${semester.semester_number}`
                return (
                  <Paper key={semester.id} withBorder radius="md" p="md">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Group gap="xs" align="center">
                          <Badge color={stateConfig.color} variant="light">{stateConfig.label}</Badge>
                          {!semester.is_active && <Badge color="gray" variant="outline">Inhabilitado</Badge>}
                        </Group>
                        <Text fw={600}>{label}</Text>
                        {semester.description && (
                          <Text size="sm" c="dimmed">{semester.description}</Text>
                        )}
                      </Stack>
                      <Button
                        color={isCurrent ? 'teal' : 'dark'}
                        variant={isCurrent ? 'light' : 'filled'}
                        onClick={() => void handleSelect(semester.id)}
                        disabled={disabled || isCurrent || !semester.is_active}
                        leftSection={isCurrent ? <IconCheck size={16} /> : undefined}
                      >
                        {isCurrent ? 'Semestre activo' : 'Seleccionar'}
                      </Button>
                    </Group>
                  </Paper>
                )
              })}
            </Stack>
          )}
        </Stack>

        <Divider variant="dashed" label="Historial" labelPosition="center" />

        {history.length === 0 ? (
          <Text size="sm" c="dimmed">Aún no tienes registros de matrícula previos.</Text>
        ) : (
          <Stack gap="sm">
            {history.map((entry) => {
              const semester = entry.program_semester
              const stateConfig = STATE_LABELS[semester.state]
              const statusConfig = STATUS_LABELS[entry.status]
              const enrolledAt = new Date(entry.enrolled_at)
              const formattedDate = Number.isNaN(enrolledAt.getTime())
                ? entry.enrolled_at
                : enrolledAt.toLocaleString()
              return (
                <Paper key={entry.enrollment_id} withBorder radius="md" p="md">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Group gap="xs" align="center">
                        <Badge color={statusConfig.color} variant="light">{statusConfig.label}</Badge>
                        <Badge color={stateConfig.color} variant="light">{stateConfig.label}</Badge>
                      </Group>
                      <Text fw={600}>{semester.label ?? `Semestre ${semester.semester_number}`}</Text>
                      <Text size="xs" c="dimmed">Inscrito el {formattedDate}</Text>
                    </Stack>
                  </Group>
                </Paper>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
