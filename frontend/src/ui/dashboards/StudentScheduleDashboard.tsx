import React, { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Alert, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { IconCalendarStats, IconRefresh } from '@tabler/icons-react'
import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import ScheduleTimeline, { ScheduleEntry } from '../components/ScheduleTimeline'

export default function StudentScheduleDashboard() {
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
      title="Mi horario confirmado"
      subtitle="Consulta los bloques asignados por el optimizador y mantente al día con tus clases"
      actions={
        <Group>
          <Button variant="light" color="dark" onClick={() => navigate('/dashboard/student')}>
            Volver al panel
          </Button>
          <Button variant="filled" color="dark" onClick={() => { logout(); navigate('/app') }}>
            Cerrar sesión
          </Button>
        </Group>
      }
    >
      <Stack gap="xl">
        <Card withBorder radius="lg" padding="xl">
          <Stack gap="lg">
            <Group justify="space-between" align="center">
              <div>
                <Title order={3}>Mi mapa semanal</Title>
                <Text size="sm" c="dimmed">
                  Vista consolidada de los cursos publicados por coordinación.
                </Text>
              </div>
              <Group gap="xs">
                <Button variant="light" color="dark" leftSection={<IconCalendarStats size={16} />} onClick={() => navigate('/dashboard/student/planificador')}>
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
      </Stack>
    </DashboardLayout>
  )
}
