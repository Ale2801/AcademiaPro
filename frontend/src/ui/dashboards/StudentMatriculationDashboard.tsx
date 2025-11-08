import React from 'react'
import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'
import { StudentSemesterProvider } from '../student-schedule/StudentSemesterContext'
import StudentMatriculationPanel from '../student-schedule/StudentMatriculationPanel'

export default function StudentMatriculationDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <DashboardLayout
      title="Gestión de matrícula"
      subtitle="Selecciona tu semestre activo, revisa disponibilidad y consulta tu historial."
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
            <Title order={4}>Tu progreso académico</Title>
            <Text c="dimmed" size="sm">
              Aquí podrás activar el semestre que cursarás, revisar opciones habilitadas y consultar tus matrículas previas.
            </Text>
          </Stack>
          <StudentMatriculationPanel />
        </Stack>
      </StudentSemesterProvider>
    </DashboardLayout>
  )
}
