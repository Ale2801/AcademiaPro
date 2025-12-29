import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  ColorInput,
  Card,
  Divider,
  Group,
  Image,
  Loader,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconMail,
  IconPalette,
  IconSunMoon,
  IconWorld,
} from '@tabler/icons-react'

import { api } from '../../lib/api'
import { THEME_DEFAULTS, useAppSettingsStore } from '../../lib/settings'

type SettingResponse = {
  key: string
  value: string | null
  label?: string | null
  description?: string | null
  category?: string | null
  is_public: boolean
}

type SettingField = {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'textarea' | 'color' | 'switch'
  helper?: string
}

type SettingSection = {
  key: string
  title: string
  description: string
  icon: React.ComponentType<{ size?: number | string }>
  fields: SettingField[]
}

const settingSections: SettingSection[] = [
  {
    key: 'branding',
    title: 'Identidad visual',
    description: 'Controla el nombre interno, el logo y los colores institucionales usados en la interfaz.',
    icon: IconPalette,
    fields: [
      { key: 'branding.app_name', label: 'Nombre de la plataforma', placeholder: 'AcademiaPro' },
      { key: 'branding.tagline', label: 'Lema institucional', placeholder: 'Planifica, gestiona y escala tu campus', type: 'textarea' },
      { key: 'branding.logo_url', label: 'Logo (URL)', placeholder: 'https://...' },
      { key: 'branding.primary_color', label: 'Color primario', placeholder: '#1e40af', type: 'color', helper: 'Usa un color HEX para personalizar botones y acentos.' },
      { key: 'branding.enable_landing', label: 'Mostrar landing predeterminada', type: 'switch', helper: 'Si está desactivado, se usará el portal personalizado o se enviará directo a la app.' },
      { key: 'branding.portal_url', label: 'Portal público personalizado', placeholder: 'https://portal.mi-campus.edu', helper: 'Se utilizará cuando se desactive la landing interna.' },
    ],
  },
  {
    key: 'theme',
    title: 'Paleta de colores',
    description: 'Define la paleta base usada para modo claro y oscuro en dashboards y landing.',
    icon: IconSunMoon,
    fields: [
      { key: 'theme.light_primary', label: 'Primario (modo claro)', placeholder: '#4338ca', type: 'color' },
      { key: 'theme.light_surface', label: 'Superficie (modo claro)', placeholder: '#f8fafc', type: 'color' },
      { key: 'theme.light_accent', label: 'Acento (modo claro)', placeholder: '#0ea5e9', type: 'color' },
      { key: 'theme.dark_primary', label: 'Primario (modo oscuro)', placeholder: '#a5b4fc', type: 'color' },
      { key: 'theme.dark_surface', label: 'Superficie (modo oscuro)', placeholder: '#0f172a', type: 'color' },
      { key: 'theme.dark_accent', label: 'Acento (modo oscuro)', placeholder: '#34d399', type: 'color' },
    ],
  },
  {
    key: 'platform',
    title: 'Plataforma',
    description: 'Ajusta idioma y zona horaria por defecto para reportes y notificaciones.',
    icon: IconWorld,
    fields: [
      { key: 'platform.default_language', label: 'Idioma por defecto', placeholder: 'es' },
      { key: 'platform.timezone', label: 'Zona horaria principal', placeholder: 'America/Bogota' },
    ],
  },
  {
    key: 'contact',
    title: 'Soporte y contacto',
    description: 'Define los canales de contacto visibles para la comunidad académica.',
    icon: IconMail,
    fields: [
      { key: 'contact.support_email', label: 'Correo de soporte', placeholder: 'soporte@academiapro.dev' },
      { key: 'contact.support_phone', label: 'Teléfono de soporte', placeholder: '+57 300 000 0000' },
    ],
  },
]

function buildDefaultState() {
  const base: Record<string, string> = {}
  settingSections.forEach((section) => {
    section.fields.forEach((field) => {
      base[field.key] = ''
    })
  })
  return base
}

export default function ApplicationSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(buildDefaultState)
  const [initialValues, setInitialValues] = useState<Record<string, string>>(buildDefaultState)
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<Record<string, SettingResponse>>({})
  const mergeSettings = useAppSettingsStore((state) => state.mergeValues)

  const brandingLogo = draft['branding.logo_url']?.trim() ?? ''
  const brandingColor = draft['branding.primary_color']?.trim() ?? ''
  const brandingName = draft['branding.app_name']?.trim() ?? 'AcademiaPro'
  const paletteLight = {
    primary: draft['theme.light_primary']?.trim() || THEME_DEFAULTS.light.primary,
    surface: draft['theme.light_surface']?.trim() || THEME_DEFAULTS.light.surface,
    accent: draft['theme.light_accent']?.trim() || THEME_DEFAULTS.light.accent,
  }
  const paletteDark = {
    primary: draft['theme.dark_primary']?.trim() || THEME_DEFAULTS.dark.primary,
    surface: draft['theme.dark_surface']?.trim() || THEME_DEFAULTS.dark.surface,
    accent: draft['theme.dark_accent']?.trim() || THEME_DEFAULTS.dark.accent,
  }
  const paletteSwatchOrder: Array<{ key: keyof typeof paletteLight; label: string }> = [
    { key: 'primary', label: 'Primario' },
    { key: 'surface', label: 'Superficie' },
    { key: 'accent', label: 'Acento' },
  ]

  useEffect(() => {
    let cancelled = false

    const loadSettings = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get<SettingResponse[]>('/settings/')
        if (cancelled) return
        const nextDraft = buildDefaultState()
        const meta: Record<string, SettingResponse> = {}
        data.forEach((item) => {
          meta[item.key] = item
          nextDraft[item.key] = item.value ?? ''
        })
        setMetadata(meta)
        setDraft(nextDraft)
        setInitialValues({ ...nextDraft })
        setDirtyKeys(new Set())
        const loadedCategories = Array.from(new Set(
          data
            .map((item) => item.category)
            .filter((category): category is string => Boolean(category))
        ))
        mergeSettings(nextDraft, { markAsLoaded: true, categories: loadedCategories })
      } catch (e: any) {
        if (cancelled) return
        const detail = e?.response?.data?.detail || e?.message || 'No se pudieron cargar los ajustes institucionales.'
        setError(detail)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [mergeSettings])

  const handleChange = useCallback((key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
    setDirtyKeys((prev) => {
      const next = new Set(prev)
      if ((initialValues[key] ?? '') !== value) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [initialValues])

  const handleSave = useCallback(async () => {
    if (dirtyKeys.size === 0) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    const keysToUpdate = Array.from(dirtyKeys)
    try {
      for (const key of keysToUpdate) {
        await api.put(`/settings/${encodeURIComponent(key)}`, { value: draft[key] })
      }
      const updatedInitial = { ...initialValues }
      const mergedEntries: Record<string, string> = {}
      keysToUpdate.forEach((key) => {
        updatedInitial[key] = draft[key]
        mergedEntries[key] = draft[key] ?? ''
      })
      setInitialValues(updatedInitial)
      setDirtyKeys(new Set())
      setSuccess('Ajustes guardados correctamente.')
      const updatedCategories = Array.from(new Set(
        keysToUpdate
          .map((key) => metadata[key]?.category)
          .filter((category): category is string => Boolean(category))
      ))
      mergeSettings(mergedEntries, { markAsLoaded: true, categories: updatedCategories })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudieron guardar los ajustes.'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [dirtyKeys, draft, initialValues, mergeSettings])

  const isDirty = dirtyKeys.size > 0

  const colorPreview = useMemo(() => {
    if (!brandingColor || !/^#([0-9a-fA-F]{3}){1,2}$/.test(brandingColor)) {
      return undefined
    }
    return brandingColor
  }, [brandingColor])

  const renderFieldControl = useCallback((field: SettingField) => {
    const value = draft[field.key] ?? ''
    const description = metadata[field.key]?.description ?? field.helper
    if (field.type === 'textarea') {
      return (
        <Stack key={field.key} gap={4}>
          <Textarea
            label={field.label}
            autosize
            minRows={2}
            placeholder={field.placeholder}
            value={value}
            onChange={(event) => handleChange(field.key, event.currentTarget.value)}
          />
          {description ? (
            <Text size="xs" c="dimmed">{description}</Text>
          ) : null}
        </Stack>
      )
    }
    if (field.type === 'color') {
      return (
        <Stack key={field.key} gap={4}>
          <ColorInput
            label={field.label}
            placeholder={field.placeholder}
            value={value}
            onChange={(color) => handleChange(field.key, color || '')}
            format="hex"
            disallowInput={false}
            withEyeDropper
            swatches={[
              '#1e3a8a', '#4338ca', '#4c1d95', '#0891b2', '#0ea5e9', '#14b8a6',
              '#0f172a', '#1e293b', '#475569', '#94a3b8', '#f8fafc', '#ffffff',
            ]}
          />
          {description ? (
            <Text size="xs" c="dimmed">{description}</Text>
          ) : null}
        </Stack>
      )
    }
    if (field.type === 'switch') {
      const checked = value !== 'false'
      return (
        <Stack key={field.key} gap={4}>
          <Switch
            label={field.label}
            checked={checked}
            onChange={(event) => handleChange(field.key, event.currentTarget.checked ? 'true' : 'false')}
          />
          {description ? (
            <Text size="xs" c="dimmed">{description}</Text>
          ) : null}
        </Stack>
      )
    }
    return (
      <Stack key={field.key} gap={4}>
        <TextInput
          label={field.label}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => handleChange(field.key, event.currentTarget.value)}
        />
        {description ? (
          <Text size="xs" c="dimmed">{description}</Text>
        ) : null}
      </Stack>
    )
  }, [draft, handleChange, metadata])

  const resetThemePalette = useCallback(() => {
    const defaults: Record<string, string> = {
      'theme.light_primary': THEME_DEFAULTS.light.primary,
      'theme.light_surface': THEME_DEFAULTS.light.surface,
      'theme.light_accent': THEME_DEFAULTS.light.accent,
      'theme.dark_primary': THEME_DEFAULTS.dark.primary,
      'theme.dark_surface': THEME_DEFAULTS.dark.surface,
      'theme.dark_accent': THEME_DEFAULTS.dark.accent,
    }
    Object.entries(defaults).forEach(([key, value]) => {
      handleChange(key, value)
    })
  }, [handleChange])

  if (loading) {
    return (
      <Card withBorder radius="lg" padding="xl">
        <Stack align="center" gap="sm">
          <Loader />
          <Text c="dimmed">Cargando ajustes de la plataforma…</Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="lg">
      {error ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} variant="light">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert color="teal" icon={<IconCheck size={16} />} variant="light">
          {success}
        </Alert>
      ) : null}

      <Card withBorder radius="lg" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center" gap="lg" wrap="wrap">
            <div>
              <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                Identidad institucional activa
              </Text>
              <Title order={3}>{brandingName}</Title>
              <Text size="sm" c="dimmed">
                Lo que configures aquí se replica en dashboards, landing pages y notificaciones por correo.
              </Text>
            </div>
            <Stack gap="xs" align="stretch" w={{ base: '100%', sm: 'auto' }}>
              {brandingLogo ? (
                <Image src={brandingLogo} alt="Logo institucional" width={180} radius="md" />
              ) : (
                <Card withBorder padding="md" radius="md">
                  <Text size="sm" c="dimmed">Ingresa una URL para previsualizar el logo.</Text>
                </Card>
              )}
              {colorPreview ? (
                <Group gap={6} align="center">
                  <Badge color="blue" variant="light">Color primario</Badge>
                  <Card radius="sm" padding={0} style={{ backgroundColor: colorPreview, width: 40, height: 16 }} />
                  <Text size="xs" c="dimmed">{colorPreview}</Text>
                </Group>
              ) : null}
              <Card withBorder padding="sm" radius="md">
                <Stack gap={6}>
                  <Text size="xs" c="dimmed" fw={600}>Paleta activa</Text>
                  {[
                    { label: 'Modo claro', palette: paletteLight },
                    { label: 'Modo oscuro', palette: paletteDark },
                  ].map((entry) => (
                    <Stack key={entry.label} gap={4}>
                      <Text size="xs" fw={600}>{entry.label}</Text>
                      <Group gap={6} wrap="nowrap">
                        {paletteSwatchOrder.map(({ key, label }) => {
                          const value = entry.palette[key]
                          return (
                            <Tooltip key={`${entry.label}-${key}`} label={`${label}: ${value}`} withinPortal>
                              <Card
                                radius="sm"
                                padding={0}
                                style={{ backgroundColor: value, width: 32, height: 18, border: '1px solid rgba(0,0,0,0.08)' }}
                              />
                            </Tooltip>
                          )
                        })}
                      </Group>
                    </Stack>
                  ))}
                </Stack>
              </Card>
            </Stack>
          </Group>
          <Divider />
          <Group justify="flex-end">
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={() => void handleSave()}
              disabled={!isDirty || saving}
              loading={saving}
            >
              Guardar ajustes
            </Button>
          </Group>
        </Stack>
      </Card>

      {settingSections.map((section) => {
        const dirtyCount = section.fields.filter((field) => dirtyKeys.has(field.key)).length
        return (
          <Card key={section.key} withBorder radius="lg" padding="lg">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Group gap={8}>
                    <section.icon size={18} />
                    <Title order={4}>{section.title}</Title>
                  </Group>
                  <Text size="sm" c="dimmed" mt={4}>
                    {section.description}
                  </Text>
                </div>
                <Badge color={dirtyCount > 0 ? 'yellow' : 'gray'} variant="light">
                  {dirtyCount} cambio{dirtyCount === 1 ? '' : 's'}
                </Badge>
              </Group>
              {section.key === 'theme' ? (
                <Stack gap="md">
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    {[
                      { label: 'Modo claro', prefix: 'theme.light_' },
                      { label: 'Modo oscuro', prefix: 'theme.dark_' },
                    ].map(({ label, prefix }) => (
                      <Stack key={prefix} gap="sm">
                        <Text fw={600}>{label}</Text>
                        <Stack gap="sm">
                          {section.fields
                            .filter((field) => field.key.startsWith(prefix))
                            .map((field) => renderFieldControl(field))}
                        </Stack>
                      </Stack>
                    ))}
                  </SimpleGrid>
                  <Group justify="flex-end">
                    <Button variant="outline" size="xs" onClick={resetThemePalette}>
                      Restablecer paleta predeterminada
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {section.fields.map((field) => renderFieldControl(field))}
                </SimpleGrid>
              )}
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
