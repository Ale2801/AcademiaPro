import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Image,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconMail,
  IconPalette,
  IconWorld,
} from '@tabler/icons-react'

import { api } from '../../lib/api'

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
  type?: 'text' | 'textarea' | 'color'
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

  const brandingLogo = draft['branding.logo_url']?.trim() ?? ''
  const brandingColor = draft['branding.primary_color']?.trim() ?? ''
  const brandingName = draft['branding.app_name']?.trim() ?? 'AcademiaPro'

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
  }, [])

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
      keysToUpdate.forEach((key) => {
        updatedInitial[key] = draft[key]
      })
      setInitialValues(updatedInitial)
      setDirtyKeys(new Set())
      setSuccess('Ajustes guardados correctamente.')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudieron guardar los ajustes.'
      setError(detail)
    } finally {
      setSaving(false)
    }
  }, [dirtyKeys, draft, initialValues])

  const isDirty = dirtyKeys.size > 0

  const colorPreview = useMemo(() => {
    if (!brandingColor || !/^#([0-9a-fA-F]{3}){1,2}$/.test(brandingColor)) {
      return undefined
    }
    return brandingColor
  }, [brandingColor])

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
          <Group justify="space-between" align="center">
            <div>
              <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                Identidad institucional activa
              </Text>
              <Title order={3}>{brandingName}</Title>
              <Text size="sm" c="dimmed">
                Lo que configures aquí se replica en dashboards, landing pages y notificaciones por correo.
              </Text>
            </div>
            <Stack gap="xs" align="center">
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
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                {section.fields.map((field) => {
                  const value = draft[field.key] ?? ''
                  const description = metadata[field.key]?.description ?? field.helper
                  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                    handleChange(field.key, event.currentTarget.value)
                  }
                  if (field.type === 'textarea') {
                    return (
                      <Stack key={field.key} gap={4}>
                        <Textarea
                          label={field.label}
                          autosize
                          minRows={2}
                          placeholder={field.placeholder}
                          value={value}
                          onChange={onChange}
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
                        onChange={onChange}
                        rightSection={field.type === 'color' && value ? (
                          <Card radius="sm" padding={0} style={{ backgroundColor: value, width: 24, height: 16 }} />
                        ) : undefined}
                      />
                      {description ? (
                        <Text size="xs" c="dimmed">{description}</Text>
                      ) : null}
                    </Stack>
                  )
                })}
              </SimpleGrid>
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
