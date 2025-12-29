import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useAuth } from '../lib/auth'
import { useBrandingSettings } from '../lib/settings'
import { Admin } from './Admin'
import { api } from '../lib/api'
import {
  Container,
  Center,
  Paper,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Group,
  Anchor,
  ActionIcon,
  Tooltip,
  AppShell,
  Burger,
  ScrollArea,
  Divider,
  ThemeIcon,
  Badge,
  SimpleGrid,
  Card,
  Skeleton,
  Progress,
  List,
  Table,
  Tabs,
  Menu,
  Indicator,
  Avatar,
  Loader,
  rem,
} from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import {
  IconHome,
  IconLayoutDashboard,
  IconUsersGroup,
  IconBook2,
  IconCalendarEvent,
  IconCheckbox,
  IconSettingsFilled,
  IconChartHistogram,
  IconCalendarStats,
  IconBell,
  IconInbox,
  IconLogout,
  IconMoodSmile,
  IconUserShield,
  IconDeviceAnalytics,
  IconSchool,
  IconDatabase,
} from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'

type Student = {
  id: number
  user_id: number
  enrollment_year: number
}

export function App() {
  const { token, login, signup, logout } = useAuth()
  const { appName, enableLanding, portalUrl } = useBrandingSettings()
  const navigate = useNavigate()
  const [navbarOpened, { toggle: toggleNavbar, close: closeNavbar }] = useDisclosure(false)
  const [email, setEmail] = useState('admin@academiapro.dev')
  const [password, setPassword] = useState('admin123')
  const [students, setStudents] = useState<Student[]>([])
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  const handleLogin = useCallback(async (emailValue: string, passwordValue: string) => {
    setError(undefined)
    setLoading(true)
    try {
      await login(emailValue, passwordValue)
      const base64 = (s: string) =>
        decodeURIComponent(
          atob(s.replace(/-/g, '+').replace(/_/g, '/'))
            .split('')
            .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
            .join('')
        )
      const hdr = api.defaults.headers.common['Authorization']
      const headerToken = typeof hdr === 'string' && hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
      const stored = localStorage.getItem('authToken') || ''
      const tokenValue = (stored || headerToken).trim()
      try {
        const [, payload] = tokenValue.split('.')
        const json = JSON.parse(base64(payload))
        const role = json.role || 'admin'
  if (role === 'admin') navigate('/dashboard/admin')
  else if (role === 'coordinator') navigate('/dashboard/coordinator')
  else if (role === 'teacher') navigate('/dashboard/teacher')
  else navigate('/dashboard/student')
      } catch {
        navigate('/dashboard/admin')
      }
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }, [login, navigate])

  const handleQuickLogin = useCallback(
    (emailValue: string, passwordValue: string) => {
      setEmail(emailValue)
      setPassword(passwordValue)
      void handleLogin(emailValue, passwordValue)
    },
    [handleLogin]
  )

  const handleNavigateHome = useCallback(() => {
    if (enableLanding || !portalUrl) {
      navigate('/')
      return
    }
    if (portalUrl.startsWith('/')) {
      navigate(portalUrl)
      return
    }
    if (typeof window !== 'undefined') {
      window.location.href = portalUrl
    }
  }, [enableLanding, navigate, portalUrl])

  useEffect(() => {
    if (!token) {
      setStudents([])
      setError(undefined)
      return
    }
    const controller = new AbortController()
    setError(undefined)
    api.get('/students/', { signal: controller.signal })
      .then(r => setStudents(r.data))
      .catch((e: any) => {
        // Ignora errores por cancelación al cambiar de token o desmontar
        if (axios.isCancel?.(e) || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return
        const detail = e?.response?.data?.detail || e?.message || 'Error al cargar estudiantes'
        setError(detail)
      })
    return () => controller.abort()
  }, [token])

  const currentUser = useMemo(() => {
    if (!token) return undefined
    try {
      const stored = localStorage.getItem('authToken') || token
      const [, payload] = stored.split('.')
      const decoded = JSON.parse(
        decodeURIComponent(
          atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
            .split('')
            .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
            .join('')
        )
      )
      return {
        name: decoded.full_name || decoded.name || 'Usuario',
        role: decoded.role || 'admin',
        email: decoded.sub,
      }
    } catch {
      return { name: 'Usuario', role: 'admin', email: undefined }
    }
  }, [token])

  const roleTarget = useMemo(() => {
    if (!token) return null
    const role = currentUser?.role || 'admin'
  if (role === 'coordinator') return '/dashboard/coordinator'
  if (role === 'teacher') return '/dashboard/teacher'
    if (role === 'student') return '/dashboard/student'
    return '/dashboard/admin'
  }, [currentUser?.role, token])

  useEffect(() => {
    if (!token || !roleTarget) return
    navigate(roleTarget, { replace: true })
  }, [navigate, roleTarget, token])

  const insights = useMemo(
    () => [
      { label: 'Estudiantes activos', value: students.length || 0, diff: '+12% vs. mes anterior', icon: IconUsersGroup },
      { label: 'Cursos en progreso', value: 24, diff: '+3 nuevos', icon: IconBook2 },
      { label: 'Evaluaciones esta semana', value: 14, diff: 'Calendario al día', icon: IconCheckbox },
      { label: 'Alertas críticas', value: 2, diff: 'Revisar asistencia', icon: IconMoodSmile },
    ],
    [students]
  )

  const upcomingSchedule = [
    { id: 1, title: 'Reunión con coordinación académica', time: '08:30', location: 'Sala 3B', type: 'Evento institucional' },
    { id: 2, title: 'Clase - Matemáticas IV', time: '10:00', location: 'Aula A-201', type: 'Clase' },
    { id: 3, title: 'Entrega de planeaciones', time: '12:00', location: 'Intranet', type: 'Recordatorio' },
    { id: 4, title: 'Sesión de tutorías', time: '16:00', location: 'Lab. Innovación', type: 'Tutoría' },
  ]

  const announcements = [
    { title: 'Nueva política de evaluaciones', by: 'Dirección Académica', time: 'Hace 2 horas' },
    { title: 'Mantenimiento programado del LMS', by: 'TI', time: 'Mañana 22:00' },
    { title: 'Convocatoria feria de proyectos', by: 'Bienestar', time: 'Esta semana' },
  ]

  const modulePlaceholders = [
    { title: 'Gestión de talento', description: 'Contrataciones, perfiles docentes, desempeño y capacitaciones.', icon: IconUserShield },
    { title: 'Control financiero', description: 'Ingresos, colegiaturas, becas, pagos por procesar y reportes.', icon: IconDeviceAnalytics },
    { title: 'Ecosistema estudiantil', description: 'Plan de estudios, asesorías, alertas tempranas y métricas de retención.', icon: IconSchool },
    { title: 'Repositorio institucional', description: 'Documentos oficiales, reglamentos y expedientes digitalizados.', icon: IconDatabase },
  ]

  if (token) {
    return (
      <Center style={{ minHeight: '100svh' }}>
        <Loader color="indigo" size="lg" />
      </Center>
    )
  }

  return (
    !token ? (
      // Vista de login a pantalla completa, sin Navbar
      <div className="lp-hero" style={{ minHeight: '100svh', width: '100%', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 20 }}>
          <Tooltip label="Volver a la landing" withArrow>
            <ActionIcon size="lg" variant="filled" color="dark" aria-label="Volver a la landing" onClick={handleNavigateHome}>
              <IconHome size={18} />
            </ActionIcon>
          </Tooltip>
        </div>
        <Container size="xs">
          <Paper p="xl" radius="lg" withBorder className="lp-card">
            <Stack>
              <Title order={2} ta="center">Inicia sesión</Title>
              <Text c="dimmed" ta="center">Accede a tu panel personalizado</Text>
              <TextInput label="Email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <PasswordInput label="Contraseña" placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {error && <Text c="red" size="sm">{error}</Text>}
              <Button loading={loading} onClick={() => handleLogin(email, password)}>Entrar</Button>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">¿No tienes cuenta?</Text>
                <Anchor component="button" size="sm" onClick={async () => {
                      setError(undefined)
                      setLoading(true)
                      try {
                        await signup(email, 'User One', password, 'admin')
                        navigate('/dashboard/admin')
                      } catch (e: any) {
                        setError(String(e.message || e))
                      } finally {
                        setLoading(false)
                      }
                    }}>Crear administrador</Anchor>
              </Group>
              <Divider label="Accesos rápidos" labelPosition="center" my="sm" />
              <Stack gap="xs">
                {[
                  {
                    label: 'Entrar como administrador demo',
                    email: 'admin@academiapro.dev',
                    password: 'admin123',
                    color: 'dark',
                    icon: IconUserShield,
                  },
                  {
                    label: 'Entrar como coordinador demo',
                    email: 'coordinador@academiapro.dev',
                    password: 'coordinador123',
                    color: 'violet',
                    icon: IconCalendarStats,
                  },
                  {
                    label: 'Entrar como docente demo',
                    email: 'docente1@academiapro.dev',
                    password: 'teacher123',
                    color: 'indigo',
                    icon: IconSchool,
                  },
                  {
                    label: 'Entrar como estudiante demo',
                    email: 'estudiante1@academiapro.dev',
                    password: 'student123',
                    color: 'teal',
                    icon: IconMoodSmile,
                  },
                ].map(({ label, email: quickEmail, password: quickPassword, color, icon: Icon }) => (
                  <Button
                    key={label}
                    variant="light"
                    color={color}
                    leftSection={<Icon size={16} />}
                    onClick={() => handleQuickLogin(quickEmail, quickPassword)}
                    disabled={loading}
                  >
                    {label}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </Paper>
        </Container>
      </div>
    ) : (
      <AppShell
        padding="xl"
        header={{ height: 72 }}
        navbar={{ width: 296, breakpoint: 'lg', collapsed: { mobile: !navbarOpened } }}
        styles={{
          main: {
            backgroundColor: 'var(--app-surface-color)',
          },
        }}
      >
        <AppShell.Header>
          <Group justify="space-between" h="100%" px="md">
            <Group>
              <Burger opened={navbarOpened} onClick={toggleNavbar} hiddenFrom="lg" size="sm" aria-label="Abrir menú" />
              <div>
                <Text size="xs" c="dimmed">Bienvenido a</Text>
                <Title order={4}>{appName} Intranet</Title>
              </div>
            </Group>
            <Group gap="md">
              <TextInput
                placeholder="Buscar estudiantes, cursos o tickets"
                leftSection={<IconInbox size={16} stroke={1.5} />}
                radius="md"
                style={{ minWidth: rem(240) }}
              />
              <Indicator inline label="3" size={16} color="red" offset={4}>
                <ActionIcon variant="light" size="lg" radius="lg" aria-label="Notificaciones">
                  <IconBell size={18} />
                </ActionIcon>
              </Indicator>
              <Menu shadow="lg" width={220} radius="md">
                <Menu.Target>
                  <Group gap="xs" style={{ cursor: 'pointer' }}>
                    <div style={{ textAlign: 'right' }}>
                      <Text fw={600}>{currentUser?.name}</Text>
                      <Text size="xs" c="dimmed">{currentUser?.email || 'usuario@academiapro.edu'}</Text>
                    </div>
                    <Avatar radius="xl" src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(currentUser?.name || 'A')}`} alt={currentUser?.name} />
                  </Group>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Perfil</Menu.Label>
                  <Menu.Item leftSection={<IconUserShield size={16} />}>
                    Rol: {currentUser?.role}
                  </Menu.Item>
                  <Menu.Item leftSection={<IconSettingsFilled size={16} />}>Preferencias</Menu.Item>
                  <Divider />
                  <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => { logout(); closeNavbar(); navigate('/app') }}>
                    Cerrar sesión
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="lg">
          <ScrollArea type="always" style={{ height: '100%' }}>
            <Stack gap="lg">
              <div>
                <Text tt="uppercase" size="xs" c="dimmed" fw={600} mb={8}>Navegación</Text>
                <Stack gap={6}>
                  {[
                    { label: 'Tablero', description: 'Resumen integral de la institución', icon: IconLayoutDashboard },
                    { label: 'Estudiantes', description: 'Expedientes, matrículas y alertas', icon: IconUsersGroup },
                    { label: 'Cursos y asignaturas', description: 'Planes, contenidos, horarios', icon: IconBook2 },
                    { label: 'Horario maestro', description: 'Aulas, ocupación y disponibilidad', icon: IconCalendarEvent },
                    { label: 'Evaluaciones y notas', description: 'Rubricas, revisión y cierres', icon: IconCheckbox },
                    { label: 'Configuración', description: 'Roles, integraciones, seguridad', icon: IconSettingsFilled },
                  ].map((item) => {
                    const isSettingsCard = item.label === 'Configuración'
                    return (
                      <Card
                        key={item.label}
                        withBorder
                        padding="md"
                        radius="md"
                        style={{
                          background: 'rgba(17, 24, 39, 0.7)',
                          color: 'white',
                          cursor: isSettingsCard ? 'pointer' : undefined,
                        }}
                        onClick={isSettingsCard ? () => navigate('/dashboard/admin/settings') : undefined}
                      >
                      <Group align="flex-start" gap="sm">
                        <ThemeIcon variant="white" size={36} radius="md">
                          <item.icon size={18} />
                        </ThemeIcon>
                        <div>
                          <Text fw={600}>{item.label}</Text>
                          <Text size="xs" c="gray.2">
                            {item.description}
                          </Text>
                        </div>
                      </Group>
                      </Card>
                    )
                  })}
                </Stack>
              </div>
              <Divider
                label={<Text size="xs" c="gray.5" fw={500}>Métricas de cumplimiento</Text>}
                labelPosition="center"
              />
              <Stack gap="md">
                <Card radius="lg" withBorder>
                  <Text fw={600} mb="sm">Plan académico 2025</Text>
                  <Text size="xs" c="dimmed">Ejecución general</Text>
                  <Progress value={68} color="indigo" mt="xs" radius="xl" />
                </Card>
                <Card radius="lg" withBorder>
                  <Text fw={600} mb="xs">Integraciones activas</Text>
                  <List size="xs" spacing={4} withPadding icon={<ThemeIcon size={16} radius="xl" color="teal"><IconMoodSmile size={12} /></ThemeIcon>}>
                    <List.Item>LMS Canvas — Sincronización nocturna</List.Item>
                    <List.Item>Biblioteca digital — API GraphQL</List.Item>
                    <List.Item>Gob. escolar — Intercambio de credenciales</List.Item>
                  </List>
                </Card>
              </Stack>
            </Stack>
          </ScrollArea>
        </AppShell.Navbar>
        <AppShell.Main>
          <Stack gap="xl">
            <Stack gap={0}>
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">Visión general</Text>
              <Title order={2}>Buen día, {currentUser?.name?.split(' ')[0] ?? 'equipo'}</Title>
              <Text size="sm" c="dimmed">Aquí tienes una instantánea de la operación académica. Puedes personalizar los widgets para tu rol.</Text>
            </Stack>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
              {insights.map(({ label, value, diff, icon: Icon }) => (
                <Card key={label} radius="lg" padding="lg" withBorder shadow="sm">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
                      <Title order={2} mt={6}>{value}</Title>
                      <Text size="xs" c="teal.6" mt={6}>{diff}</Text>
                    </div>
                    <ThemeIcon color="indigo" variant="light" size={42} radius="md">
                      <Icon size={20} />
                    </ThemeIcon>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
              <Card radius="lg" padding="lg" withBorder shadow="sm">
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={600}>Agenda de hoy</Text>
                    <Text size="sm" c="dimmed">Reservas confirmadas y compromisos clave</Text>
                  </div>
                  <Badge color="indigo" variant="light">Sincronizado</Badge>
                </Group>
                <Stack gap="sm">
                  {upcomingSchedule.map((item) => (
                    <Card key={item.id} withBorder padding="md" radius="md" shadow="xs">
                      <Group justify="space-between" align="flex-start" mb={4}>
                        <div>
                          <Text fw={600}>{item.title}</Text>
                          <Text size="xs" c="dimmed">{item.type}</Text>
                        </div>
                        <Badge color="dark" variant="outline">{item.time}</Badge>
                      </Group>
                      <Text size="sm" c="dimmed">{item.location}</Text>
                    </Card>
                  ))}
                </Stack>
              </Card>

              <Card radius="lg" padding="lg" withBorder shadow="sm">
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={600}>Comunicados recientes</Text>
                    <Text size="sm" c="dimmed">Anuncios institucionales y alertas del campus</Text>
                  </div>
                  <Badge color="teal" variant="light">3 nuevos</Badge>
                </Group>
                <Stack gap="md">
                  {announcements.map((item) => (
                    <div key={item.title} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', paddingBottom: 12 }}>
                      <Text fw={600}>{item.title}</Text>
                      <Group gap={6} c="dimmed">
                        <Text size="xs">{item.by}</Text>
                        <Text size="xs">•</Text>
                        <Text size="xs">{item.time}</Text>
                      </Group>
                      <Text size="xs" mt={6} c="dimmed">Contenido disponible próximamente. Integraremos workflow de firmas y publicación automática.</Text>
                    </div>
                  ))}
                </Stack>
                <Button variant="light" color="indigo" fullWidth mt="md">Abrir centro de comunicaciones</Button>
              </Card>
            </SimpleGrid>

            <Card radius="lg" padding="lg" withBorder shadow="sm">
              <Tabs defaultValue="mapa">
                <Tabs.List>
                  <Tabs.Tab value="mapa" leftSection={<IconChartHistogram size={16} />}>Mapa académico</Tabs.Tab>
                  <Tabs.Tab value="recursos" leftSection={<IconInbox size={16} />}>Recursos</Tabs.Tab>
                  <Tabs.Tab value="seguimiento" leftSection={<IconCalendarStats size={16} />}>Seguimiento</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="mapa" pt="md">
                  <Skeleton height={220} radius="lg">
                    <div style={{ height: 220, display: 'grid', placeItems: 'center', color: '#64748b' }}>
                      Visualización interactiva de dependencias y carga docente (próximamente).
                    </div>
                  </Skeleton>
                </Tabs.Panel>
                <Tabs.Panel value="recursos" pt="md">
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    {modulePlaceholders.map((module) => (
                      <Card key={module.title} withBorder padding="md" radius="md">
                        <Group align="flex-start" gap="md">
                          <ThemeIcon size={36} radius="md" color="gray.7">
                            <module.icon size={18} />
                          </ThemeIcon>
                          <div>
                            <Text fw={600}>{module.title}</Text>
                            <Text size="sm" c="dimmed">{module.description}</Text>
                            <Button variant="subtle" color="indigo" size="xs" mt="sm">Configurar módulo</Button>
                          </div>
                        </Group>
                      </Card>
                    ))}
                  </SimpleGrid>
                </Tabs.Panel>
                <Tabs.Panel value="seguimiento" pt="md">
                  <Stack gap="sm">
                    <Card withBorder padding="md" radius="md">
                      <Text fw={600}>Alertas de asistencia</Text>
                      <Text size="sm" c="dimmed">Integración con módulo de asistencia en progreso.</Text>
                    </Card>
                    <Card withBorder padding="md" radius="md">
                      <Text fw={600}>Indicadores de satisfacción</Text>
                      <Text size="sm" c="dimmed">Se habilitará una conexión con encuestas y mesas de ayuda.</Text>
                    </Card>
                  </Stack>
                </Tabs.Panel>
              </Tabs>
            </Card>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="xl">
              <Card radius="lg" padding="lg" withBorder shadow="sm">
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={600}>Últimos estudiantes registrados</Text>
                    <Text size="sm" c="dimmed">Fuente: API /students</Text>
                  </div>
                  <Button variant="light" size="xs" onClick={() => api.get('/students/').then((r) => setStudents(r.data)).catch(() => {})}>Actualizar</Button>
                </Group>
                {loading ? (
                  <Skeleton height={160} radius="md" />
                ) : students.length === 0 ? (
                  <Stack align="center" py="lg" gap="sm">
                    <Text c="dimmed">Aún no hay registros. Puedes cargar alumnos desde el módulo de matrículas.</Text>
                    <Button variant="light" onClick={() => navigate('/dashboard/admin')}>Ir al gestor de datos</Button>
                  </Stack>
                ) : (
                  <Table verticalSpacing="sm" striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>Usuario</Table.Th>
                        <Table.Th>Año ingreso</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {students.slice(0, 6).map((student) => (
                        <Table.Tr key={student.id}>
                          <Table.Td>
                            <Badge color="dark" variant="light">#{student.id}</Badge>
                          </Table.Td>
                          <Table.Td>{student.user_id}</Table.Td>
                          <Table.Td>{student.enrollment_year}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </Card>

              <Card radius="lg" padding="lg" withBorder shadow="sm">
                <Text fw={600} mb="xs">Flujos administrativos</Text>
                <Text size="sm" c="dimmed">Conecta los módulos críticos en un solo lugar.</Text>
                <Stack gap="sm" mt="md">
                  <Card withBorder radius="md" padding="md">
                    <Group justify="space-between">
                      <div>
                        <Text fw={500}>Generador de reportes</Text>
                        <Text size="xs" c="dimmed">Dashboards ejecutivos y descargas programadas.</Text>
                      </div>
                      <Button size="xs" variant="light">Configurar</Button>
                    </Group>
                  </Card>
                  <Card withBorder radius="md" padding="md">
                    <Group justify="space-between">
                      <div>
                        <Text fw={500}>Mesa de ayuda</Text>
                        <Text size="xs" c="dimmed">Tickets, SLA y catálogo de servicios académicos.</Text>
                      </div>
                      <Button size="xs" variant="light">Asignar responsables</Button>
                    </Group>
                  </Card>
                  <Card withBorder radius="md" padding="md">
                    <Group justify="space-between">
                      <div>
                        <Text fw={500}>Integración OR-Tools</Text>
                        <Text size="xs" c="dimmed">Optimización avanzada de horarios con seguimiento manual.</Text>
                      </div>
                      <Button size="xs" variant="light">Ver configuración</Button>
                    </Group>
                  </Card>
                </Stack>
                <Button variant="filled" color="dark" mt="lg" onClick={() => navigate('/dashboard/admin')}>
                  Abrir consola administrativa avanzada
                </Button>
              </Card>
            </SimpleGrid>

            <Card radius="lg" padding="lg" withBorder shadow="sm">
              <Group justify="space-between" mb="md">
                <div>
                  <Text fw={600}>Bitácora de actividad</Text>
                  <Text size="sm" c="dimmed">Historial cronológico — placeholder hasta conectar con auditoría</Text>
                </div>
                <Button variant="light" size="xs">Exportar</Button>
              </Group>
              <Stack gap="sm">
                {[1, 2, 3, 4].map((idx) => (
                  <Card key={idx} withBorder padding="md" radius="md">
                    <Group justify="space-between">
                      <div>
                        <Text fw={500}>Acción #{idx}</Text>
                        <Text size="xs" c="dimmed">Detalle del evento, usuario responsable y resultado esperado.</Text>
                      </div>
                      <Badge color="gray" variant="light">Placeholder</Badge>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Card>

            <Stack gap="sm" align="center" c="dimmed" py="md">
              <Text size="xs">Esta intranet está en evolución. Personaliza widgets y permisos desde la consola de administración.</Text>
              <Anchor size="xs" onClick={() => navigate('/dashboard/admin')}>Ir a configuración avanzada</Anchor>
            </Stack>
          </Stack>
        </AppShell.Main>
      </AppShell>
    )
  )
}
