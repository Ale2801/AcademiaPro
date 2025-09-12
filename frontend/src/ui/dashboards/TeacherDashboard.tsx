import React from 'react'
import { Card, Title, Text, SimpleGrid, Button, Group, Badge } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'

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
        <Widget title="Mis cursos" description="Lista y administra secciones a tu cargo"
          action={<Button variant="filled" color="dark">Ver cursos</Button>} />
        <Widget title="Evaluaciones" description="Crea y califica evaluaciones"
          action={<Button variant="filled" color="dark">Gestionar</Button>} />
        <Widget title="Asistencia" description="Marca asistencia por clase"
          action={<Button variant="filled" color="dark">Tomar asistencia</Button>} />
      </SimpleGrid>

      <Card withBorder radius="md" mt="md">
        <Group justify="space-between" align="center">
          <Title order={4}>Próximas sesiones</Title>
          <Badge color="blue" variant="light">Esta semana</Badge>
        </Group>
        <Text c="dimmed" size="sm" mt={8}>Pronto conectaremos esto a tu horario y cursos reales.</Text>
      </Card>
    </DashboardLayout>
  )
}
