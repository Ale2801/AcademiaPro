import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useAuth } from '../lib/auth'
import { Admin } from './Admin'
import { api } from '../lib/api'
import { Container, Paper, Title, Text, TextInput, PasswordInput, Button, Stack, Group, Anchor, ActionIcon, Tooltip } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { IconHome } from '@tabler/icons-react'

type Student = {
  id: number
  user_id: number
  enrollment_year: number
}

export function App() {
  const { token, login, signup, logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('user1@test.com')
  const [password, setPassword] = useState('pass1234')
  const [students, setStudents] = useState<Student[]>([])
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

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

  return (
    !token ? (
      // Vista de login a pantalla completa, sin Navbar
      <div className="lp-hero" style={{ minHeight: '100svh', width: '100%', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 20 }}>
          <Tooltip label="Volver a la landing" withArrow>
            <ActionIcon size="lg" variant="filled" color="dark" aria-label="Volver a la landing" onClick={() => navigate('/') }>
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
              <Button loading={loading} onClick={async () => {
                    setError(undefined)
                    setLoading(true)
                    try {
                      await login(email, password)
                      // Leer role del token via endpoint opcional o decodificar JWT en frontend si se requiere.
                      // Simplicidad: consultar al backend el usuario por email si eres admin.
                      // Mejor: decodificar JWT y redirigir según 'role'.
                      const base64 = (s: string) => decodeURIComponent(atob(s.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''))
                      // persistimos token para decodificarlo sin depender del header
                      const hdr = api.defaults.headers.common['Authorization']
                      const headerToken = typeof hdr === 'string' && hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
                      const stored = localStorage.getItem('authToken') || ''
                      const t = (stored || headerToken).trim()
                      try {
                        const [, payload] = t.split('.')
                        const json = JSON.parse(base64(payload))
                        const role = json.role || 'admin'
                        if (role === 'admin') navigate('/dashboard/admin')
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
                  }}>Entrar</Button>
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
            </Stack>
          </Paper>
        </Container>
      </div>
    ) : (
      // Vista simplificada post login (de momento) con ancho contenido
      <div style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'system-ui' }}>
        <h1>AcademiaPro</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong>Sesión iniciada</strong>
          <button onClick={logout}>Salir</button>
        </div>
        <h2>Estudiantes</h2>
        {students.length === 0 ? (
          <p>No hay estudiantes</p>
        ) : (
          <ul>
            {students.map(s => (
              <li key={s.id}>ID {s.id} — user_id {s.user_id} — año {s.enrollment_year}</li>
            ))}
          </ul>
        )}
        <hr style={{ margin: '16px 0' }} />
        <Admin />
      </div>
    )
  )
}
