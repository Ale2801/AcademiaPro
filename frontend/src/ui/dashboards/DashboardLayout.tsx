import React, { useEffect, useMemo, useState } from 'react'
import { Title, Text, Group, Avatar, Badge, ActionIcon, Tooltip, Modal, Button, Stack, useMantineColorScheme } from '@mantine/core'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  IconChevronLeft,
  IconChevronRight,
  IconLayoutDashboard,
  IconChalkboard,
  IconNotebook,
  IconCalendarStats,
  IconUserCheck,
  IconClipboardList,
  IconUsersGroup,
  IconSettings,
  IconMoon,
  IconSun,
} from '@tabler/icons-react'

export default function DashboardLayout({ title, subtitle, actions, children }: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = window.localStorage.getItem('dashboard_nav_collapsed')
      return stored === '1'
    } catch {
      return false
    }
  })
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const navigate = useNavigate()
  const { token: authToken } = useAuth()
  const location = useLocation()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const [storedToken, setStoredToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem('authToken') } catch { return null }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { setStoredToken(localStorage.getItem('authToken')) } catch { setStoredToken(null) }
  }, [authToken])
  const tokenFromStorage = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : undefined
  let user: { name: string; role: string } = { name: 'Usuario', role: 'admin' }
  const activeToken = authToken || storedToken || tokenFromStorage || undefined
  if (activeToken) {
    try {
      const [, payload] = activeToken.split('.')
      const json = JSON.parse(decodeURIComponent(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')))
      user = { name: json.full_name || 'Usuario', role: json.role || 'admin' }
    } catch {}
  }
  const isAuthenticated = Boolean(authToken || storedToken || tokenFromStorage)
  const navItems = useMemo(() => {
    const config = {
      admin: [
        {
          label: 'Inicio',
          to: '/dashboard/admin',
          icon: IconLayoutDashboard,
          matcher: (path: string) => path === '/dashboard/admin',
        },
        { label: 'Cursos', to: '/dashboard/admin#cursos', icon: IconChalkboard },
        { label: 'Evaluaciones', to: '/dashboard/admin#evaluaciones', icon: IconNotebook },
        { label: 'Horario', to: '/dashboard/admin#horario', icon: IconCalendarStats },
        { label: 'Asistencia', to: '/dashboard/admin#asistencia', icon: IconUserCheck },
        {
          label: 'Ajustes',
          to: '/dashboard/admin/settings',
          icon: IconSettings,
          matcher: (path: string) => path.startsWith('/dashboard/admin/settings'),
        },
      ],
      coordinator: [
        {
          label: 'Resumen',
          to: '/dashboard/coordinator',
          icon: IconLayoutDashboard,
          matcher: (path: string) => path === '/dashboard/coordinator',
        },
        { label: 'Programas', to: '/dashboard/coordinator#programas', icon: IconChalkboard },
        { label: 'Planeación', to: '/dashboard/coordinator#planeacion', icon: IconClipboardList },
        { label: 'Horarios', to: '/dashboard/coordinator#horarios', icon: IconCalendarStats },
        { label: 'Docentes', to: '/dashboard/coordinator#docentes', icon: IconUsersGroup },
      ],
      teacher: [
        {
          label: 'Inicio',
          to: '/dashboard/teacher',
          icon: IconLayoutDashboard,
          matcher: (path: string) => path === '/dashboard/teacher',
        },
        { label: 'Mis cursos', to: '/dashboard/teacher#cursos', icon: IconChalkboard },
        { label: 'Mi horario', to: '/dashboard/teacher#horario', icon: IconCalendarStats },
      ],
      student: [
        {
          label: 'Inicio',
          to: '/dashboard/student',
          icon: IconLayoutDashboard,
          matcher: (path: string) => path === '/dashboard/student',
        },
        {
          label: 'Matrícula',
          to: '/dashboard/student/matricula',
          icon: IconUserCheck,
          matcher: (path: string) => path.startsWith('/dashboard/student/matricula'),
        },
        { label: 'Mis cursos', to: '/dashboard/student#cursos', icon: IconNotebook },
        { label: 'Horario', to: '/dashboard/student#horario', icon: IconCalendarStats },
      ],
    }
    const role = (user.role || 'admin') as keyof typeof config
    return config[role] ?? config.admin
  }, [user.role])

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragStartX(e.clientX)
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || dragStartX === null) return

    const deltaX = e.clientX - dragStartX
    const threshold = 20

    if (Math.abs(deltaX) > threshold) {
      if (deltaX > 0 && collapsed) {
        setCollapsed(false)
        setIsDragging(false)
        setDragStartX(null)
      } else if (deltaX < 0 && !collapsed) {
        setCollapsed(true)
        setIsDragging(false)
        setDragStartX(null)
      }
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragStartX(null)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setDragStartX(null)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('dashboard_nav_collapsed', collapsed ? '1' : '0')
    } catch {
      /* ignore persistence errors */
    }
  }, [collapsed])

  const sidebarBg = colorScheme === 'dark'
    ? (isDragging 
        ? 'linear-gradient(180deg, rgba(99,102,241,0.15), rgba(2,6,23,0.85), rgba(15,23,42,0.9))'
        : 'linear-gradient(180deg, rgba(2,6,23,0.85), rgba(15,23,42,0.9))')
    : (isDragging
        ? 'linear-gradient(180deg, rgba(99,102,241,0.08), rgba(248,250,252,0.95), rgba(241,245,249,0.98))'
        : 'linear-gradient(180deg, rgba(248,250,252,0.95), rgba(241,245,249,0.98))')

  const sidebarTextColor = colorScheme === 'dark' ? 'white' : '#1e293b'
  const sidebarBorder = colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(226,232,240,0.8)'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: collapsed ? '84px 1fr' : '240px 1fr', minHeight: '100svh', transition: 'grid-template-columns 220ms ease' }}>
      <aside 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          borderRight: sidebarBorder,
          background: sidebarBg,
          color: sidebarTextColor,
          padding: collapsed ? '16px 10px' : 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'stretch',
          gap: collapsed ? 28 : 16,
          transition: isDragging ? 'background 150ms ease' : 'padding 220ms ease, background 150ms ease',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: isDragging ? 'none' : 'auto',
        }}
      >
        <div style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch', gap: collapsed ? 24 : 16 }}>
          <div style={{ display: 'flex', flexDirection: collapsed ? 'column' : 'row', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: collapsed ? 16 : 12 }}>
            <Title
              order={3}
              style={{
                color: sidebarTextColor,
                margin: 0,
                writingMode: collapsed ? 'vertical-rl' as any : 'horizontal-tb',
                textOrientation: collapsed ? 'upright' as any : 'mixed',
                transform: collapsed ? 'none' : 'none',
                letterSpacing: collapsed ? '0.12em' : undefined,
                textAlign: collapsed ? 'center' : 'left',
                transition: 'writing-mode 220ms ease, letter-spacing 220ms ease'
              }}
            >
              AcademiaPro
            </Title>
            <Tooltip label={collapsed ? 'Expandir menú' : 'Colapsar menú'} withinPortal position="right">
              <ActionIcon
                variant="light"
                color="gray"
                onClick={() => setCollapsed((prev) => !prev)}
                aria-label={collapsed ? 'Expandir menú de navegación' : 'Colapsar menú de navegación'}
              >
                {collapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
              </ActionIcon>
            </Tooltip>
          </div>
          <nav style={{ display: 'grid', gap: collapsed ? 12 : 8, justifyItems: collapsed ? 'center' : 'stretch' }}>
            {navItems.map((item) => {
              const IconComponent = item.icon
              const isActive = item.matcher
                ? item.matcher(location.pathname)
                : (item.to !== '#' && location.pathname === item.to)
              return collapsed ? (
                <Tooltip key={item.label} label={item.label} position="right" withinPortal>
                  <ActionIcon
                    component={Link}
                    to={item.to}
                    variant="subtle"
                    color="gray"
                    radius="md"
                    size="lg"
                    aria-label={item.label}
                    style={{
                      width: 44,
                      height: 44,
                      border: colorScheme === 'dark'
                        ? '1px solid rgba(255,255,255,0.12)'
                        : '1px solid rgba(100,116,139,0.2)',
                      color: sidebarTextColor
                    }}
                  >
                    <IconComponent size={20} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Link
                  key={item.label}
                  to={item.to}
                  style={{
                    color: sidebarTextColor,
                    textDecoration: 'none',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'transparent',
                    transition: 'color 180ms ease',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div style={{ 
            marginTop: 'auto', 
            paddingTop: 16, 
            borderTop: colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(100,116,139,0.2)',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <Tooltip label={colorScheme === 'light' ? 'Modo oscuro' : 'Modo claro'} position="right" withinPortal>
              <ActionIcon
                variant="light"
                color="gray"
                size="lg"
                onClick={() => setColorScheme(colorScheme === 'light' ? 'dark' : 'light')}
                aria-label={colorScheme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
                style={{
                  width: 44,
                  height: 44,
                  border: colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(100,116,139,0.2)',
                  color: sidebarTextColor,
                }}
              >
                {colorScheme === 'light' ? <IconMoon size={20} /> : <IconSun size={20} />}
              </ActionIcon>
            </Tooltip>
          </div>
        </div>
      </aside>
      <main style={{ padding: collapsed ? '24px 20px' : '24px 28px', transition: 'padding 220ms ease' }}>
        <Modal
          opened={!isAuthenticated}
          onClose={() => navigate('/app')}
          withCloseButton={false}
          centered
          overlayProps={{ opacity: 0.75, blur: 4 }}
        >
          <Stack gap="md" align="center" ta="center">
            <Title order={3}>Sesión no iniciada</Title>
            <Text c="dimmed">
              Necesitas iniciar sesión para acceder a este panel. Te redirigiremos al formulario de acceso para que continúes.
            </Text>
            <Button onClick={() => navigate('/app')} color="indigo" fullWidth>
              Ir a iniciar sesión
            </Button>
          </Stack>
        </Modal>
        <Group justify="space-between" align="center" mb="md">
          <div>
            <Title order={2}>{title}</Title>
            {subtitle && <Text c="dimmed" size="sm">{subtitle}</Text>}
          </div>
          <Group gap="sm">
            <div style={{ textAlign: 'right' }}>
              <Text fw={600}>{user.name}</Text>
              <Badge color="gray" variant="light" size="sm">{user.role}</Badge>
            </div>
            <Avatar radius="xl" src={`https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(user.name)}`} alt={user.name} />
            {actions}
          </Group>
        </Group>
        {children}
      </main>
    </div>
  )
}
