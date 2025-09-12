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

export default function StudentDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
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
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <Widget title="Mis cursos" description="Consulta contenidos y calificaciones"
          action={<Button variant="filled" color="dark">Ver cursos</Button>} />
        <Widget title="Calificaciones" description="Resumen de notas por evaluación"
          action={<Button variant="filled" color="dark">Revisar</Button>} />
        <Widget title="Horario" description="Tu calendario semanal"
          action={<Button variant="filled" color="dark">Abrir</Button>} />
      </SimpleGrid>

      <Card withBorder radius="md" mt="md">
        <Group justify="space-between" align="center">
          <Title order={4}>Alertas</Title>
          <Badge color="yellow" variant="light">Novedades</Badge>
        </Group>
        <Text c="dimmed" size="sm" mt={8}>Aquí verás recordatorios y anuncios importantes.</Text>
      </Card>
    </DashboardLayout>
  )
}
