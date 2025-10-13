import React, { useEffect, useMemo, useState } from 'react'
import { Title, Text, Group, Avatar, Badge, ActionIcon, Tooltip, Modal, Button, Stack } from '@mantine/core'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  IconChevronLeft,
  IconChevronRight,
  IconLayoutDashboard,
  IconChalkboard,
  IconNotebook,
  IconCalendarStats,
  IconUserCheck,
  IconSettings,
} from '@tabler/icons-react'

export default function DashboardLayout({ title, subtitle, actions, children }: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const { token: authToken } = useAuth()
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
  const navItems = useMemo(() => ([
    { label: 'Inicio', to: '/dashboard/admin', icon: IconLayoutDashboard },
    { label: 'Cursos', to: '#', icon: IconChalkboard },
    { label: 'Evaluaciones', to: '#', icon: IconNotebook },
    { label: 'Horario', to: '#', icon: IconCalendarStats },
    { label: 'Asistencia', to: '#', icon: IconUserCheck },
    { label: 'Ajustes', to: '#', icon: IconSettings },
  ]), [])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: collapsed ? '84px 1fr' : '240px 1fr', minHeight: '100svh', transition: 'grid-template-columns 220ms ease' }}>
      <aside style={{
        borderRight: '1px solid var(--mantine-color-dark-5, #1f2937)',
        background: 'linear-gradient(180deg, rgba(2,6,23,0.85), rgba(15,23,42,0.9))',
        color: 'white',
        padding: collapsed ? '16px 10px' : 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: collapsed ? 'center' : 'stretch',
        gap: collapsed ? 28 : 16,
        transition: 'padding 220ms ease'
      }}>
        <div style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch', gap: collapsed ? 24 : 16 }}>
          <div style={{ display: 'flex', flexDirection: collapsed ? 'column' : 'row', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: collapsed ? 16 : 12 }}>
            <Title
              order={3}
              style={{
                color: 'white',
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
              const isActive = item.to === '/dashboard/admin'
              return collapsed ? (
                <Tooltip key={item.label} label={item.label} position="right" withinPortal>
                  <ActionIcon
                    component={Link}
                    to={item.to}
                    variant={isActive ? 'filled' : 'subtle'}
                    color={isActive ? 'indigo' : 'gray'}
                    radius="md"
                    size="lg"
                    aria-label={item.label}
                    style={{
                      width: 44,
                      height: 44,
                      border: isActive ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.12)',
                      color: 'white'
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
                    color: 'white',
                    textDecoration: 'none',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                    transition: 'background 180ms ease',
                    fontWeight: 500,
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
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
