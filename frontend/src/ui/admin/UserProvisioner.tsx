import React, { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { IconAlertCircle, IconCheck, IconCopy, IconDownload, IconKey, IconRefresh } from '@tabler/icons-react'
import { api } from '../../lib/api'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'coordinator', label: 'Coordinador' },
  { value: 'teacher', label: 'Profesor' },
  { value: 'student', label: 'Estudiante' },
]

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$!%*?&'

const generatePassword = (length = 12) => {
  const chars = PASSWORD_CHARS
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

type ProvisionResult = {
  id: number
  email: string
  full_name: string
  role: string
  temporary_password: string
}

export default function UserProvisioner() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('teacher')
  const [tempPassword, setTempPassword] = useState(() => generatePassword())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProvisionResult | null>(null)

  const isFormValid = useMemo(() => {
    return fullName.trim().length >= 3 && email.trim().length > 5 && Boolean(role) && tempPassword.trim().length >= 8
  }, [email, fullName, role, tempPassword])

  const handleGenerate = () => {
    setTempPassword(generatePassword())
  }

  const resetForm = () => {
    setFullName('')
    setEmail('')
    setRole('teacher')
    setTempPassword(generatePassword())
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      const payload = {
        email,
        full_name: fullName,
        role,
        password: tempPassword,
        require_password_change: true,
      }
      const { data } = await api.post('/users/', payload)
      setResult(data)
      setTempPassword(generatePassword())
      resetForm()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo crear el usuario'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const content = `Credenciales temporales\nNombre: ${result.full_name}\nCorreo: ${result.email}\nRol: ${result.role}\nContraseña provisoria: ${result.temporary_password}\n`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `credenciales-${result.email}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <Stack gap="xl">
      <Card withBorder radius="lg" padding="xl" shadow="sm">
        <Stack gap="md">
          <div>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              Alta rápida de usuarios
            </Text>
            <Text fz="xl" fw={600} mt={2}>
              Genera cuentas y entrega credenciales temporales
            </Text>
            <Text size="sm" c="dimmed">
              Define el rol y una contraseña provisoria. El sistema exigirá que el usuario la cambie en su primer inicio de sesión.
            </Text>
          </div>
          {error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>
          )}
          <SimpleGridWrapper>
            <TextInput
              label="Nombre completo"
              placeholder="Ej. Camila Rojas"
              value={fullName}
              onChange={(event) => setFullName(event.currentTarget.value)}
              required
              disabled={loading}
            />
            <TextInput
              label="Correo institucional"
              placeholder="usuario@academia.edu"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              disabled={loading}
            />
            <Select
              label="Rol asignado"
              placeholder="Selecciona un rol"
              data={ROLE_OPTIONS}
              value={role}
              onChange={(value) => setRole(value ?? 'teacher')}
              required
              disabled={loading}
            />
            <PasswordInput
              label="Contraseña provisoria"
              description="Mínimo 8 caracteres"
              value={tempPassword}
              onChange={(event) => setTempPassword(event.currentTarget.value)}
              required
              disabled={loading}
              rightSection={
                <Tooltip label="Generar otra" withinPortal>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    onClick={handleGenerate}
                    leftSection={<IconRefresh size={14} />}
                    disabled={loading}
                  >
                    Random
                  </Button>
                </Tooltip>
              }
            />
          </SimpleGridWrapper>
          <Group justify="flex-end">
            <Button
              leftSection={<IconKey size={16} />}
              onClick={handleSubmit}
              disabled={!isFormValid || loading}
              loading={loading}
            >
              Crear usuario
            </Button>
          </Group>
        </Stack>
      </Card>

      {result && (
        <Card withBorder radius="lg" padding="lg" shadow="sm">
          <Stack gap="sm">
            <Group justify="space-between">
              <div>
                <Text fw={600}>Credenciales generadas</Text>
                <Text size="sm" c="dimmed">
                  Comparte este archivo con el usuario y recuerda garantizar el cambio de contraseña.
                </Text>
              </div>
              <Group gap="xs">
                <CopyButton value={`Correo: ${result.email}\nContraseña: ${result.temporary_password}`}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copiado' : 'Copiar credenciales'} withinPortal>
                      <Button
                        variant={copied ? 'light' : 'default'}
                        color={copied ? 'teal' : 'gray'}
                        size="compact-sm"
                        leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        onClick={copy}
                      >
                        {copied ? 'Copiado' : 'Copiar'}
                      </Button>
                    </Tooltip>
                  )}
                </CopyButton>
                <Button
                  variant="light"
                  color="indigo"
                  size="compact-sm"
                  leftSection={<IconDownload size={14} />}
                  onClick={handleDownload}
                >
                  Descargar
                </Button>
              </Group>
            </Group>
            <Divider my="sm" />
            <Stack gap={4}>
              <Text size="sm">
                <strong>Nombre:</strong> {result.full_name}
              </Text>
              <Text size="sm">
                <strong>Correo:</strong> {result.email}
              </Text>
              <Text size="sm">
                <strong>Rol:</strong> {result.role}
              </Text>
              <Text size="sm">
                <strong>Contraseña provisoria:</strong> {result.temporary_password}
              </Text>
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}

function SimpleGridWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '1rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}
    >
      {children}
    </div>
  )
}
