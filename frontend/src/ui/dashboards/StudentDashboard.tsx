import React, { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Alert, Button, Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import ScheduleTimeline, { ScheduleEntry } from '../components/ScheduleTimeline'
import { IconRefresh } from '@tabler/icons-react'

function Widget({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card withBorder radius="md" className="hover-card">
      <Title order={4}>{title}</Title>
      <Text c="dimmed" size="sm" mt={4}>{description}</Text>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </Card>
  )
}

export default function StudentDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  const loadSchedule = useCallback(async () => {
    setLoadingSchedule(true)
    setScheduleError(null)
    try {
      const { data } = await api.get<ScheduleEntry[]>('/schedule/my')
      setSchedule(Array.isArray(data) ? data : [])
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'No se pudo obtener tu horario'
      setScheduleError(detail)
    } finally {
      setLoadingSchedule(false)
    }
  }, [])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  return (
    <DashboardLayout
      title="Panel de Estudiante"
      subtitle="Tu progreso, cursos y horarios"
      actions={
        <Group>
          <Button variant="filled" color="dark" onClick={() => { logout(); navigate('/app') }}>Cerrar sesión</Button>
        </Group>
      }
    >
      <Stack gap="xl">
        <Card id="horario" withBorder radius="lg" padding="xl">
          <Stack gap="lg">
            <Group justify="space-between" align="center">
              <div>
                <Title order={4}>Mi horario semanal</Title>
                <Text size="sm" c="dimmed">Revisa tus clases confirmadas y mantente al día.</Text>
              </div>
              <Group gap="xs">
                <Button variant="light" color="dark" onClick={() => navigate('/dashboard/student/planificador')}>
                  Abrir planificador
                </Button>
                <ActionIcon
                  variant="light"
                  color="dark"
                  onClick={() => void loadSchedule()}
                  aria-label="Actualizar horario"
                  disabled={loadingSchedule}
                >
                  {loadingSchedule ? <Loader size="sm" /> : <IconRefresh size={18} />}
                </ActionIcon>
              </Group>
            </Group>

            {scheduleError && (
              <Alert color="red" variant="light">
                {scheduleError}
              </Alert>
            )}

            {loadingSchedule && schedule.length === 0 ? (
              <Group justify="center" py="lg">
                <Loader color="dark" />
              </Group>
            ) : (
              <ScheduleTimeline entries={schedule} />
            )}
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <Widget title="Mis cursos" description="Consulta contenidos y calificaciones"
            action={<Button variant="filled" color="dark">Ver cursos</Button>} />
          <Widget title="Calificaciones" description="Resumen de notas por evaluación"
            action={<Button variant="filled" color="dark">Revisar</Button>} />
          <Widget title="Planificador" description="Ajusta tu carga académica"
            action={<Button variant="filled" color="dark" onClick={() => navigate('/dashboard/student/planificador')}>Abrir</Button>} />
          <Widget title="Matrícula" description="Gestiona tu semestre activo y revisa tu historial"
            action={<Button variant="filled" color="dark" onClick={() => navigate('/dashboard/student/matricula')}>Gestionar</Button>} />
        </SimpleGrid>
      </Stack>
    </DashboardLayout>
  )
}
