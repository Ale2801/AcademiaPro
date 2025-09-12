import React from 'react'
import { Title, Text, Group, Avatar, Badge } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export default function DashboardLayout({ title, subtitle, actions, children }: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : undefined
  let user: { name: string; role: string } = { name: 'Usuario', role: 'admin' }
  if (token) {
    try {
      const [, payload] = token.split('.')
      const json = JSON.parse(decodeURIComponent(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')))
      user = { name: json.full_name || 'Usuario', role: json.role || 'admin' }
    } catch {}
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: '100svh' }}>
      <aside style={{
        borderRight: '1px solid var(--mantine-color-dark-5, #1f2937)',
        background: 'linear-gradient(180deg, rgba(2,6,23,0.85), rgba(15,23,42,0.9))',
        color: 'white', padding: 16
      }}>
        <div style={{ position: 'sticky', top: 0 }}>
          <Title order={3} style={{ color: 'white', marginBottom: 16 }}>AcademiaPro</Title>
          <nav style={{ display: 'grid', gap: 8 }}>
            <Link to="/dashboard/admin" style={{ color: 'white', textDecoration: 'none', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>Inicio</Link>
            <Link to="#" style={{ color: 'white', textDecoration: 'none', padding: '8px 10px', borderRadius: 8, background: 'transparent' }}>Cursos</Link>
            <Link to="#" style={{ color: 'white', textDecoration: 'none', padding: '8px 10px', borderRadius: 8, background: 'transparent' }}>Evaluaciones</Link>
            <Link to="#" style={{ color: 'white', textDecoration: 'none', padding: '8px 10px', borderRadius: 8, background: 'transparent' }}>Horario</Link>
            <Link to="#" style={{ color: 'white', textDecoration: 'none', padding: '8px 10px', borderRadius: 8, background: 'transparent' }}>Asistencia</Link>
            <Link to="#" style={{ color: 'white', textDecoration: 'none', padding: '8px 10px', borderRadius: 8, background: 'transparent' }}>Ajustes</Link>
          </nav>
        </div>
      </aside>
      <main style={{ padding: '24px 28px' }}>
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
