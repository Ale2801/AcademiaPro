import React from 'react'
import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'
import { StudentSemesterProvider } from '../student-schedule/StudentSemesterContext'
import StudentSchedulePlanner from '../student-schedule/StudentSchedulePlanner'

export default function StudentSchedulePlannerDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <DashboardLayout
      title="Planificador de horario"
      subtitle="Selecciona tus materias disponibles, asigna grupos y construye tu semana ideal."
      actions={(
        <Group>
          <Button variant="filled" color="dark" onClick={() => { logout(); navigate('/app') }}>
            Cerrar sesión
          </Button>
        </Group>
      )}
    >
      <StudentSemesterProvider>
        <Stack gap="xl">
          <Stack gap={4}>
            <Title order={4}>Construye tu horario</Title>
            <Text c="dimmed" size="sm">
              Revisa las alternativas disponibles por asignatura, arrastra los grupos a tu horario y solicita apoyo a coordinación cuando lo necesites.
            </Text>
          </Stack>
          <StudentSchedulePlanner />
        </Stack>
      </StudentSemesterProvider>
    </DashboardLayout>
  )
}
