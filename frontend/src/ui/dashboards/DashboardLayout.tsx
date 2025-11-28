import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Title, Text, Group, Avatar, Badge, ActionIcon, Tooltip, Modal, Button, Stack, useMantineColorScheme, PasswordInput, Alert, Drawer, Divider, FileInput } from '@mantine/core'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import {
  IconChevronLeft,
  IconChevronRight,
  IconLayoutDashboard,
  IconChalkboard,
  IconCalendarCog,
  IconNotebook,
  IconCalendarStats,
  IconUserCheck,
  IconClipboardList,
  IconUsersGroup,
  IconSettings,
  IconMoon,
  IconSun,
  IconAlertCircle,
  IconDatabase,
  IconCamera,
} from '@tabler/icons-react'

type UserProfile = {
  id: number
  email: string
  full_name: string
  role: string
  profile_image?: string | null
}

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result)
    } else {
      reject(new Error('No se pudo leer el archivo'))
    }
  }
  reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
  reader.readAsDataURL(file)
})

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
  const { token: authToken, mustChangePassword, changePassword, logout } = useAuth()
  const location = useLocation()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changeError, setChangeError] = useState<string | null>(null)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [storedToken, setStoredToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem('authToken') } catch { return null }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { setStoredToken(localStorage.getItem('authToken')) } catch { setStoredToken(null) }
  }, [authToken])

  const tokenFromStorage = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : undefined
  let user: { name: string; role: string; email?: string } = { name: 'Usuario', role: 'admin' }
  const activeToken = authToken || storedToken || tokenFromStorage || undefined
  if (activeToken) {
    try {
      const [, payload] = activeToken.split('.')
      const json = JSON.parse(decodeURIComponent(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')))
      user = {
        name: json.full_name || json.name || 'Usuario',
        role: json.role || 'admin',
        email: json.email || json.sub,
      }
    } catch {}
  }
  const isAuthenticated = Boolean(authToken || storedToken || tokenFromStorage)
  const enforcePasswordChange = Boolean(mustChangePassword && isAuthenticated)
  const requiresCurrentPassword = !enforcePasswordChange
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false)
  const [profileData, setProfileData] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null)
  const avatarFallback = useMemo(
    () => `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(user.name)}`,
    [user.name],
  )
  const profilePhoto = profileData?.profile_image ?? null
  const displayName = profileData?.full_name ?? user.name
  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setProfileData(null)
      return
    }
    setProfileLoading(true)
    setProfileError(null)
    try {
      const { data } = await api.get<UserProfile>('/users/me')
      setProfileData(data)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo cargar tu perfil'
      setProfileError(detail)
    } finally {
      setProfileLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])
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
        { label: 'Cobertura', to: '/dashboard/coordinator#planeacion', icon: IconCalendarStats },
        { label: 'Tareas', to: '/dashboard/coordinator#tareas', icon: IconClipboardList },
        { label: 'Programas', to: '/dashboard/coordinator?catalog=programs#catalogos', icon: IconChalkboard },
        { label: 'Docentes', to: '/dashboard/coordinator?catalog=teachers#catalogos', icon: IconUsersGroup },
        { label: 'Catálogos', to: '/dashboard/coordinator#catalogos', icon: IconDatabase },
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
        {
          label: 'Planificador',
          to: '/dashboard/student/planificador',
          icon: IconCalendarCog,
          matcher: (path: string) => path.startsWith('/dashboard/student/planificador'),
        },
        {
          label: 'Mi horario',
          to: '/dashboard/student/horario',
          icon: IconCalendarStats,
          matcher: (path: string) => path.startsWith('/dashboard/student/horario'),
        },
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

  const handleSidebarNavigation = useCallback((event: React.MouseEvent, target: string) => {
    event.preventDefault()
    navigate(target)
    if (typeof window === 'undefined') return
    const hashIndex = target.indexOf('#')
    if (hashIndex === -1) return
    const elementId = target.slice(hashIndex + 1)
    if (!elementId) return
    const scrollDelay = target.includes('catalogos') ? 260 : 120
    window.setTimeout(() => {
      const el = document.getElementById(elementId)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, scrollDelay)
  }, [navigate])

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

  const resetPasswordForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setChangeError(null)
  }

  const handleChangePassword = async () => {
    setChangeError(null)
    setChangeSuccess(null)
    const sanitizedCurrent = currentPassword.trim()
    const sanitizedNew = newPassword.trim()
    if (requiresCurrentPassword && !sanitizedCurrent) {
      setChangeError('Debes ingresar tu contraseña actual.')
      return
    }
    if (sanitizedNew.length < 8) {
      setChangeError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (sanitizedNew !== confirmPassword) {
      setChangeError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setIsChangingPassword(true)
    try {
      await changePassword(requiresCurrentPassword ? sanitizedCurrent : undefined, sanitizedNew)
      resetPasswordForm()
      setChangeSuccess('Tu contraseña se actualizó correctamente.')
    } catch (e: any) {
      setChangeError(e?.message || 'No se pudo cambiar la contraseña.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleForcedLogout = () => {
    logout()
    resetPasswordForm()
    navigate('/app')
  }

  const closeProfileDrawer = useCallback(() => {
    setProfileDrawerOpen(false)
    setAvatarFile(null)
    setProfileError(null)
  }, [])

  const handleProfilePhotoUpload = useCallback(async (file: File | null) => {
    setAvatarFile(file)
    if (!file) return
    setProfileError(null)
    setAvatarUploading(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      await api.put('/users/me/avatar', { image_data: dataUrl })
      await loadProfile()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo actualizar la foto'
      setProfileError(detail)
    } finally {
      setAvatarFile(null)
      setAvatarUploading(false)
    }
  }, [loadProfile])

  const handleRemoveProfilePhoto = useCallback(async () => {
    setProfileError(null)
    setAvatarUploading(true)
    try {
      await api.put('/users/me/avatar', { image_data: null })
      await loadProfile()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo quitar la foto'
      setProfileError(detail)
    } finally {
      setAvatarUploading(false)
    }
  }, [loadProfile])

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
                    onClick={(event) => handleSidebarNavigation(event, item.to)}
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
                  onClick={(event) => handleSidebarNavigation(event, item.to)}
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
        <Modal
          opened={enforcePasswordChange}
          onClose={() => { /* bloqueo de cierre mientras se exige el cambio */ }}
          withCloseButton={false}
          closeOnClickOutside={false}
          closeOnEscape={false}
          centered
          overlayProps={{ opacity: 0.85, blur: 6 }}
        >
          <Stack gap="sm">
            <Title order={4}>Actualiza tu contraseña</Title>
            <Text size="sm" c="dimmed">
              Estás usando credenciales temporales. Por seguridad debes definir una contraseña nueva antes de continuar.
            </Text>
            {!requiresCurrentPassword && (
              <Text size="sm" c="dimmed">
                Solo ingresa tu nueva contraseña y confírmala; no necesitas la contraseña temporal.
              </Text>
            )}
            {changeError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {changeError}
              </Alert>
            )}
            {changeSuccess && (
              <Alert color="teal" icon={<IconAlertCircle size={16} />}>
                {changeSuccess}
              </Alert>
            )}
            {requiresCurrentPassword && (
              <PasswordInput
                label="Contraseña actual"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.currentTarget.value)}
                required
                disabled={isChangingPassword}
              />
            )}
            <PasswordInput
              label="Nueva contraseña"
              description="Debe tener al menos 8 caracteres"
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
              required
              disabled={isChangingPassword}
            />
            <PasswordInput
              label="Confirmar nueva contraseña"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              required
              disabled={isChangingPassword}
            />
            <Group justify="space-between" mt="sm">
              <Button variant="subtle" color="gray" onClick={handleForcedLogout} disabled={isChangingPassword}>
                Cerrar sesión
              </Button>
              <Button onClick={handleChangePassword} loading={isChangingPassword}>
                Guardar contraseña
              </Button>
            </Group>
          </Stack>
        </Modal>
        <Group justify="space-between" align="center" mb="md">
          <div>
            <Title order={2}>{title}</Title>
            {subtitle && <Text c="dimmed" size="sm">{subtitle}</Text>}
          </div>
          <Group gap="sm">
            <div style={{ textAlign: 'right' }}>
              <Text fw={600}>{displayName}</Text>
              <Badge color="gray" variant="light" size="sm">{user.role}</Badge>
            </div>
            <Tooltip label="Configurar perfil" withinPortal>
              <Avatar
                radius="xl"
                src={profilePhoto ?? avatarFallback}
                alt={displayName}
                style={{ cursor: 'pointer' }}
                onClick={() => setProfileDrawerOpen(true)}
              />
            </Tooltip>
            <Tooltip label="Abrir ajustes personales" withinPortal>
              <ActionIcon
                variant="light"
                color="gray"
                aria-label="Abrir configuración de perfil"
                onClick={() => setProfileDrawerOpen(true)}
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
            {actions}
          </Group>
        </Group>
        {children}
      </main>
      <Drawer
        opened={profileDrawerOpen}
        onClose={closeProfileDrawer}
        title="Configura tu perfil"
        position="right"
        size="lg"
        overlayProps={{ opacity: 0.4, blur: 2 }}
      >
        <Stack gap="lg">
          {profileError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>{profileError}</Alert>
          )}
          <Stack align="center" gap="xs">
            <Avatar size={120} radius="xl" src={profilePhoto ?? avatarFallback} alt={displayName} />
            <Text fw={600} ta="center">{displayName}</Text>
            <Badge color="gray" variant="light">{user.role}</Badge>
          </Stack>
          <Group justify="center">
            <Button size="xs" variant="light" onClick={() => { void loadProfile() }} loading={profileLoading}>
              Recargar perfil
            </Button>
          </Group>
          <FileInput
            label="Foto de perfil"
            description="JPG, PNG o WebP"
            placeholder="Selecciona una imagen"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            leftSection={<IconCamera size={16} />}
            value={avatarFile}
            onChange={handleProfilePhotoUpload}
            clearable
            disabled={avatarUploading}
          />
          {profilePhoto && (
            <Button variant="subtle" color="red" onClick={handleRemoveProfilePhoto} loading={avatarUploading}>
              Quitar foto
            </Button>
          )}
          <Divider label="Seguridad" labelPosition="center" my="md" />
          <Stack gap="sm">
            <Text size="sm" c="dimmed">Actualiza tu contraseña cuando lo necesites.</Text>
            {changeError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>{changeError}</Alert>
            )}
            {changeSuccess && (
              <Alert color="teal" icon={<IconAlertCircle size={16} />}>{changeSuccess}</Alert>
            )}
            <PasswordInput
              label="Contraseña actual"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.currentTarget.value)}
              disabled={isChangingPassword}
            />
            <PasswordInput
              label="Nueva contraseña"
              description="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
              disabled={isChangingPassword}
            />
            <PasswordInput
              label="Confirmar nueva contraseña"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              disabled={isChangingPassword}
            />
            <Group justify="flex-end">
              <Button onClick={handleChangePassword} loading={isChangingPassword} leftSection={<IconSettings size={14} />}>
                Guardar cambios
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Drawer>
    </div>
  )
}
