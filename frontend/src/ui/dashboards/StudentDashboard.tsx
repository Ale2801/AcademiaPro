import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import CurriculumGraph from '../components/CurriculumGraph'

function Widget({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card withBorder radius="md" className="hover-card">
      <Title order={4}>{title}</Title>
      <Text c="dimmed" size="sm" mt={4}>{description}</Text>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </Card>
  )
}

type StudentProfile = {
  id: number
  program_id?: number | null
}

type ProgramInfo = {
  id: number
  name?: string | null
  code?: string | null
}

export default function StudentDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [programInfo, setProgramInfo] = useState<ProgramInfo | null>(null)
  const [curriculumLoading, setCurriculumLoading] = useState(false)
  const [curriculumError, setCurriculumError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      setCurriculumLoading(true)
      setCurriculumError(null)
      try {
        const { data } = await api.get<StudentProfile>('/students/me')
        if (!active) return
        setProfile(data)
        if (data?.program_id) {
          try {
            const programRes = await api.get<ProgramInfo>(`/programs/${data.program_id}`)
            if (!active) return
            setProgramInfo(programRes.data)
          } catch (programErr: any) {
            if (!active) return
            const detail = programErr?.response?.data?.detail || programErr?.message || 'No se pudo cargar la información del programa'
            setCurriculumError(detail)
          }
        } else {
          setProgramInfo(null)
        }
      } catch (err: any) {
        if (!active) return
        const detail = err?.response?.data?.detail || err?.message || 'No pudimos cargar tu programa'
        setCurriculumError(detail)
      } finally {
        if (active) setCurriculumLoading(false)
      }
    }
    void loadProfile()
    return () => {
      active = false
    }
  }, [])

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
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <Widget title="Materiales y tareas" description="Descarga recursos y entrega evaluaciones"
            action={<Button variant="filled" color="dark" onClick={() => navigate('/dashboard/student/learning')}>Abrir módulo</Button>} />
          <Widget title="Mis cursos" description="Consulta contenidos y calificaciones"
            action={<Button variant="light" color="dark">Ver cursos</Button>} />
          <Widget title="Calificaciones" description="Resumen de notas por evaluación"
            action={<Button variant="filled" color="dark">Revisar</Button>} />
          <Widget title="Planificador" description="Ajusta tu carga académica"
            action={<Button variant="filled" color="dark" onClick={() => navigate('/dashboard/student/planificador')}>Abrir</Button>} />
          <Widget title="Mi horario" description="Consulta los bloques asignados"
            action={<Button variant="filled" color="dark" onClick={() => navigate('/dashboard/student/horario')}>Ver horario</Button>} />
          <Widget title="Matrícula" description="Gestiona tu semestre activo y revisa tu historial"
            action={<Button variant="filled" color="dark" onClick={() => navigate('/dashboard/student/matricula')}>Gestionar</Button>} />
        </SimpleGrid>

        <Card withBorder radius="lg" padding="xl">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={4}>Mi malla curricular</Title>
                <Text size="sm" c="dimmed">
                  {programInfo?.name || programInfo?.code
                    ? `Programa ${programInfo.name || programInfo.code}`
                    : 'Visualiza el avance del programa al que perteneces.'}
                </Text>
              </div>
              <Button variant="light" color="dark" onClick={() => navigate('/dashboard/student/planificador')}>
                Ajustar plan académico
              </Button>
            </Group>

            {curriculumLoading ? (
              <Group justify="center" py="md">
                <Loader color="dark" />
              </Group>
            ) : curriculumError ? (
              <Alert color="red" variant="light">
                {curriculumError}
              </Alert>
            ) : profile?.program_id ? (
              <CurriculumGraph forcedProgramId={profile.program_id} hideProgramSelector />
            ) : (
              <Alert color="yellow" variant="light">
                Aún no tienes un programa académico asignado. Ponte en contacto con tu coordinación.
              </Alert>
            )}
          </Stack>
        </Card>
      </Stack>
    </DashboardLayout>
  )
}
