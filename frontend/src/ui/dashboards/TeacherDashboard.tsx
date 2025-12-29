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

export default function TeacherDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSchedule = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<ScheduleEntry[]>('/schedule/my')
      setSchedule(data)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo obtener tu horario'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  return (
    <DashboardLayout
      title="Panel de Profesor"
      subtitle="Tus cursos, evaluaciones y asistencia"
      actions={
        <Group>
          <Button variant="filled" color="dark" onClick={() => { logout(); navigate('/app') }}>Cerrar sesión</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <Widget title="Materiales y evaluaciones" description="Publica recursos y revisa entregas"
          action={<Button variant="filled" color="dark" onClick={() => navigate('/dashboard/teacher/learning')}>Abrir módulo</Button>} />
        <Widget title="Evaluaciones" description="Crea y califica evaluaciones"
          action={<Button variant="filled" color="dark">Gestionar</Button>} />
        <Widget title="Asistencia" description="Marca asistencia por clase"
          action={<Button variant="filled" color="dark">Tomar asistencia</Button>} />
      </SimpleGrid>

      <Card withBorder radius="md" mt="md" padding="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4}>Mi horario semanal</Title>
              <Text size="sm" c="dimmed">Consulta tus bloques asignados y mantente sincronizado con tus cursos.</Text>
            </div>
            <ActionIcon variant="light" color="dark" onClick={() => void loadSchedule()} aria-label="Actualizar" disabled={loading}>
              {loading ? <Loader size="sm" /> : <IconRefresh size={18} />}
            </ActionIcon>
          </Group>
          {error && (
            <Alert color="red" variant="light" title="No se pudo cargar el horario">
              {error}
            </Alert>
          )}
          {loading ? (
            <Group justify="center">
              <Loader color="dark" />
            </Group>
          ) : (
            <ScheduleTimeline entries={schedule} />
          )}
        </Stack>
      </Card>
    </DashboardLayout>
  )
}
