import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  CloseButton,
  Checkbox,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  Switch,
} from '@mantine/core'
import {
  IconAward,
  IconBuilding,
  IconCalendarEvent,
  IconChalkboard,
  IconClockHour4,
  IconCalendarCog,
  IconFilter,
  IconClipboardList,
  IconArrowsSort,
  IconSearch,
  IconDatabase,
  IconPencil,
  IconRefresh,
  IconSchool,
  IconTrash,
  IconUsersGroup,
  IconCalendarPlus,
  IconAlertTriangle,
} from '@tabler/icons-react'
import { api } from '../lib/api'
import SchedulePlanner from './components/SchedulePlanner'

type Field = {
  name: string
  label?: string
  type: 'text' | 'number' | 'date' | 'time' | 'checkbox'
  placeholder?: string
  required?: boolean
}

type Section = {
  key: string
  title: string
  endpoint: string
  fields: Field[]
  description: string
  icon: React.ComponentType<{ size?: number | string }>
}

const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

type TimeslotRecord = {
  id?: number
  day_of_week: number
  start_time: string
  end_time: string
  campus?: string | null
  comment?: string | null
}

type TimeslotOverviewProps = {
  slots: TimeslotRecord[]
  onDelete: (id: number) => Promise<void> | void
}

function TimeslotOverview({ slots, onDelete }: TimeslotOverviewProps) {
  const grouped = useMemo(() => {
    const map = new Map<number, TimeslotRecord[]>()
    for (const slot of slots) {
      const day = Number(slot.day_of_week)
      const list = map.get(day)
      if (list) {
        list.push(slot)
      } else {
        map.set(day, [slot])
      }
    }
    const days = Array.from({ length: 7 }, (_, index) => {
      const records = map.get(index) ?? []
      records.sort((a, b) => {
        const aMinutes = parseTimeString(normalizeTimeString(String(a.start_time ?? ''))) ?? 0
        const bMinutes = parseTimeString(normalizeTimeString(String(b.start_time ?? ''))) ?? 0
        return aMinutes - bMinutes
      })
      return {
        day: index,
        label: WEEKDAY_LABELS[index] ?? `Día ${index}`,
        records,
      }
    })
    return days
  }, [slots])

  const total = slots.length
  const hasAny = total > 0

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <div>
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              Vista rápida de bloques
            </Text>
            <Title order={4}>Distribución semanal</Title>
            <Text size="sm" c="dimmed">
              Explora los bloques existentes agrupados por día y gestiona rápidamente los que ya no necesitas.
            </Text>
          </div>
          <Badge color="indigo" variant="light">
            {total} bloque{total === 1 ? '' : 's'}
          </Badge>
        </Group>

        {!hasAny ? (
          <Stack align="center" gap="xs" py="lg">
            <IconDatabase size={32} color="var(--mantine-color-gray-5)" />
            <Text size="sm" c="dimmed" ta="center">
              Aún no hay bloques registrados. Usa el generador o el formulario para añadir la primera jornada.
            </Text>
          </Stack>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
            {grouped.map((day) => (
              <Card key={day.day} withBorder radius="md" padding="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text fw={600}>{day.label}</Text>
                    <Badge color={day.records.length > 0 ? 'blue' : 'gray'} variant="light">
                      {day.records.length} bloque{day.records.length === 1 ? '' : 's'}
                    </Badge>
                  </Group>
                  {day.records.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      Sin bloques asignados para este día.
                    </Text>
                  ) : (
                    <Stack gap={8}>
                      {day.records.map((slot) => {
                        const start = normalizeTimeString(String(slot.start_time ?? ''))
                        const end = normalizeTimeString(String(slot.end_time ?? ''))
                        return (
                          <Paper key={slot.id ?? `${day.day}-${start}-${end}`} withBorder radius="md" p="sm">
                            <Group justify="space-between" align="center" gap="sm">
                              <div>
                                <Text size="sm" fw={500}>
                                  {start} – {end}
                                </Text>
                                {slot.comment ? (
                                  <Text size="xs" c="dimmed">
                                    {slot.comment}
                                  </Text>
                                ) : null}
                              </div>
                              <Group gap={6} align="center">
                                {slot.campus ? (
                                  <Badge size="sm" variant="light" color="gray">
                                    {slot.campus}
                                  </Badge>
                                ) : null}
                                {typeof slot.id === 'number' ? (
                                  <Tooltip label="Eliminar bloque" withArrow>
                                    <ActionIcon
                                      variant="subtle"
                                      color="red"
                                      size="sm"
                                      aria-label="Eliminar bloque"
                                      onClick={() => onDelete(slot.id as number)}
                                    >
                                      <IconTrash size={14} />
                                    </ActionIcon>
                                  </Tooltip>
                                ) : null}
                              </Group>
                            </Group>
                          </Paper>
                        )
                      })}
                    </Stack>
                  )}
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Card>
  )
}

function normalizeTimeString(value?: string | null) {
  if (!value) return ''
  const parts = value.split(':')
  if (parts.length < 2) return value
  const [hours, minutes] = parts
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

function parseTimeString(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^([0-2]?\d):([0-5]\d)$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (hours < 0 || hours > 23) return null
  return hours * 60 + minutes
}

function minutesToTimeLabel(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

type TimeslotBulkBuilderProps = {
  existing: TimeslotRecord[]
  onCreated: () => Promise<void> | void
}

function TimeslotBulkBuilder({ existing, onCreated }: TimeslotBulkBuilderProps) {
  const [startTime, setStartTime] = useState('08:00')
  const [blocksPerDay, setBlocksPerDay] = useState<number>(8)
  const [durationMinutes, setDurationMinutes] = useState<number>(60)
  const [includeGap, setIncludeGap] = useState(false)
  const [gapMinutes, setGapMinutes] = useState<number>(10)
  const [includeWeekends, setIncludeWeekends] = useState(false)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const normalizedExisting = useMemo(() =>
    existing.map((slot) => ({
      day_of_week: Number(slot.day_of_week),
      start_time: normalizeTimeString(typeof slot.start_time === 'string' ? slot.start_time : String(slot.start_time ?? '')),
      end_time: normalizeTimeString(typeof slot.end_time === 'string' ? slot.end_time : String(slot.end_time ?? '')),
    })),
  [existing])

  const existingKeys = useMemo(() => {
    const set = new Set<string>()
    for (const slot of normalizedExisting) {
      if (!slot.start_time || !slot.end_time) continue
      set.add(`${slot.day_of_week}-${slot.start_time}-${slot.end_time}`)
    }
    return set
  }, [normalizedExisting])

  const startMinutes = useMemo(() => parseTimeString(startTime), [startTime])
  const normalizedDuration = Math.max(0, Math.round(durationMinutes))
  const normalizedBlocks = Math.max(0, Math.floor(blocksPerDay))
  const normalizedGap = Math.max(0, includeGap ? Math.round(gapMinutes) : 0)

  const validationError = useMemo(() => {
    if (startMinutes == null) return 'Ingresa una hora de inicio válida (HH:MM).'
    if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) return 'La duración debe ser mayor a 0 minutos.'
    if (!Number.isFinite(normalizedBlocks) || normalizedBlocks <= 0) return 'Define cuántos bloques habrá por día.'
    if (includeGap && (!Number.isFinite(gapMinutes) || gapMinutes < 0)) return 'El espacio entre bloques no puede ser negativo.'
    return null
  }, [gapMinutes, includeGap, normalizedBlocks, normalizedDuration, startMinutes])

  const dayIndexes = useMemo(() => (includeWeekends ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]), [includeWeekends])

  const preview = useMemo(() => {
    if (validationError) {
      return { overflow: false, days: [] as { day: number; label: string; slots: { start: string; end: string; exists: boolean }[] }[] }
    }
    if (startMinutes == null || normalizedDuration <= 0 || normalizedBlocks <= 0) {
      return { overflow: false, days: [] as { day: number; label: string; slots: { start: string; end: string; exists: boolean }[] }[] }
    }
    let overflow = false
    const days = dayIndexes.map((day) => {
      const slots: { start: string; end: string; exists: boolean }[] = []
      for (let index = 0; index < normalizedBlocks; index += 1) {
        const offset = index * (normalizedDuration + normalizedGap)
        const slotStart = startMinutes + offset
        const slotEnd = slotStart + normalizedDuration
        if (slotEnd > 24 * 60) {
          overflow = true
          break
        }
        const startLabel = minutesToTimeLabel(slotStart)
        const endLabel = minutesToTimeLabel(slotEnd)
        const exists = existingKeys.has(`${day}-${startLabel}-${endLabel}`)
        slots.push({ start: startLabel, end: endLabel, exists })
      }
      return {
        day,
        label: WEEKDAY_LABELS[day] ?? `Día ${day}`,
        slots,
      }
    })
    return { overflow, days }
  }, [dayIndexes, existingKeys, normalizedBlocks, normalizedDuration, normalizedGap, startMinutes, validationError])

  const totalBlocks = useMemo(() => preview.days.reduce((acc, day) => acc + day.slots.length, 0), [preview.days])
  const duplicateBlocks = useMemo(() => preview.days.reduce((acc, day) => acc + day.slots.filter((slot) => slot.exists).length, 0), [preview.days])
  const newBlocks = totalBlocks - duplicateBlocks

  const actionableBlocks = replaceExisting ? totalBlocks : newBlocks

  const canSubmit = !validationError && !preview.overflow && actionableBlocks > 0 && !creating
  const ignoredBlocks = replaceExisting ? 0 : Math.max(duplicateBlocks, 0)

  const handleGenerate = async () => {
    if (!canSubmit) return
    setFeedback(null)
    setCreating(true)
    try {
      const payloads = preview.days.flatMap((day) =>
        day.slots
          .filter((slot) => replaceExisting || !slot.exists)
          .map((slot) => ({
            day_of_week: day.day,
            start_time: `${slot.start}:00`,
            end_time: `${slot.end}:00`,
          }))
      )
      if (payloads.length === 0) {
        setFeedback({ type: 'error', message: 'No hay bloques para generar con la configuración actual.' })
        return
      }

      const response = await api.post('/timeslots/bulk', {
        replace_existing: replaceExisting,
        slots: payloads,
      })
      const result = response?.data ?? {}
      const parseCount = (value: unknown, fallback: number) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value
        const numeric = Number(value)
        return Number.isFinite(numeric) ? numeric : fallback
      }
      const created = parseCount(result?.created, payloads.length)
      const skipped = parseCount(result?.skipped, replaceExisting ? 0 : duplicateBlocks)
      const removedTimeslots = parseCount(result?.removed_timeslots, replaceExisting ? existing.length : 0)
      const removedSchedules = parseCount(result?.removed_course_schedules, 0)
      await Promise.resolve(onCreated())

      const fragments: string[] = []
      const createdVerb = created === 1 ? 'Se generó' : 'Se generaron'
      fragments.push(`${createdVerb} ${created} bloque${created === 1 ? '' : 's'}.`)
      if (skipped > 0) {
        const skippedVerb = skipped === 1 ? 'Se omitió' : 'Se omitieron'
        fragments.push(`${skippedVerb} ${skipped} duplicado${skipped === 1 ? '' : 's'}.`)
      }
      if (removedTimeslots > 0) {
        const removedVerb = removedTimeslots === 1 ? 'Se eliminó' : 'Se eliminaron'
        fragments.push(`${removedVerb} ${removedTimeslots} bloque${removedTimeslots === 1 ? '' : 's'} anterior${removedTimeslots === 1 ? '' : 'es'}.`)
      }
      if (removedSchedules > 0) {
        const cleanedVerb = removedSchedules === 1 ? 'Se limpió' : 'Se limpiaron'
        fragments.push(`${cleanedVerb} ${removedSchedules} horario${removedSchedules === 1 ? '' : 's'} asignado${removedSchedules === 1 ? '' : 's'}.`)
      }
      setFeedback({ type: 'success', message: fragments.join(' ') })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudieron crear los bloques'
      setFeedback({ type: 'error', message: detail })
    } finally {
      setCreating(false)
    }
  }

  const infoSummary = useMemo(() => {
    if (validationError || preview.days.length === 0) return ''
    const base = includeWeekends
      ? 'Se configurarán bloques de lunes a domingo.'
      : 'Se configurarán bloques de lunes a viernes.'
    if (replaceExisting && existing.length > 0) {
      return `${base} Esta recreación eliminará ${existing.length} bloque${existing.length === 1 ? '' : 's'} actual${existing.length === 1 ? '' : 'es'} y los horarios que dependan de ellos.`
    }
    return base
  }, [existing.length, includeWeekends, preview.days.length, replaceExisting, validationError])

  const allExisting = !replaceExisting && !validationError && !preview.overflow && totalBlocks > 0 && newBlocks === 0

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              Generador semanal
            </Text>
            <Title order={4}>Crear bloques en lote</Title>
            <Text size="sm" c="dimmed">
              Define la jornada base y dejamos listos los bloques lectivos para cada día.
            </Text>
          </div>
          <Badge color={replaceExisting ? 'red' : 'indigo'} variant="light" leftSection={<IconCalendarPlus size={14} />}>
            {replaceExisting ? `${totalBlocks} planificados` : `${newBlocks} nuevos`}
          </Badge>
        </Group>

        {feedback && (
          <Alert color={feedback.type === 'success' ? 'teal' : 'red'} variant="light" title={feedback.type === 'success' ? 'Bloques generados' : 'No se pudo completar'}>
            {feedback.message}
          </Alert>
        )}

        {replaceExisting && existing.length > 0 && (
          <Alert color="red" variant="light" title="Recreación completa" icon={<IconAlertTriangle size={16} />}>
            Se eliminarán {existing.length} bloque{existing.length === 1 ? '' : 's'} actual{existing.length === 1 ? '' : 'es'} y cualquier horario de curso asociado antes de crear la nueva jornada.
          </Alert>
        )}

        {validationError && (
          <Alert color="yellow" variant="light" title="Revisa la configuración" icon={<IconAlertTriangle size={16} />}>
            {validationError}
          </Alert>
        )}

        {preview.overflow && !validationError && (
          <Alert color="yellow" variant="light" title="Jornada supera el día" icon={<IconAlertTriangle size={16} />}>
            Ajusta la duración o la cantidad de bloques para que terminen antes de medianoche.
          </Alert>
        )}

        {allExisting && (
          <Alert color="blue" variant="light" title="Sin cambios necesarios">
            Todos los bloques calculados ya estaban dados de alta.
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <Stack gap={4}>
            <TextInput
              label="Hora de inicio"
              value={startTime}
              onChange={(event) => setStartTime(event.currentTarget.value)}
              placeholder="08:00"
            />
            <Text size="xs" c="dimmed">
              Formato HH:MM (24h)
            </Text>
          </Stack>
          <NumberInput
            label="Duración de cada bloque (minutos)"
            min={15}
            step={5}
            value={durationMinutes}
            onChange={(value) => setDurationMinutes(typeof value === 'number' ? value : Number(value) || 0)}
          />
          <NumberInput
            label="Bloques por día"
            min={1}
            max={12}
            value={blocksPerDay}
            onChange={(value) => setBlocksPerDay(typeof value === 'number' ? value : Number(value) || 0)}
          />
        </SimpleGrid>

        <Group gap="md" align="flex-end" wrap="wrap">
          <Switch
            label="Espacio entre bloques"
            description="Inserta recreos entre clases"
            checked={includeGap}
            onChange={(event) => setIncludeGap(event.currentTarget.checked)}
            aria-label="Espacio entre bloques"
          />
          <NumberInput
            label="Minutos de descanso"
            min={0}
            step={5}
            disabled={!includeGap}
            value={gapMinutes}
            onChange={(value) => setGapMinutes(typeof value === 'number' ? value : Number(value) || 0)}
          />
          <Switch
            label="Incluir fines de semana"
            description="Agrega sábado y domingo"
            checked={includeWeekends}
            onChange={(event) => setIncludeWeekends(event.currentTarget.checked)}
            aria-label="Incluir fines de semana"
          />
          <Switch
            label="Reemplazar bloques existentes"
            description="Borra la jornada actual y recrea todos los bloques"
            checked={replaceExisting}
            color="red"
            onChange={(event) => setReplaceExisting(event.currentTarget.checked)}
            aria-label="Reemplazar bloques existentes"
          />
        </Group>

        {infoSummary && (
          <Text size="sm" c="dimmed">
            {infoSummary}
          </Text>
        )}

        <SimpleGrid cols={{ base: 1, md: 2, lg: includeWeekends ? 3 : 2 }} spacing="md">
          {preview.days.map((day) => (
            <Card key={day.day} withBorder radius="md" padding="md">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text fw={600}>{day.label}</Text>
                  <Badge color="blue" variant="light">
                    {day.slots.length} bloque{day.slots.length === 1 ? '' : 's'}
                  </Badge>
                </Group>
                <Stack gap={4}>
                  {day.slots.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      Sin bloques configurados para este día.
                    </Text>
                  ) : (
                    day.slots.map((slot, index) => (
                      <Group key={`${day.day}-${slot.start}-${index}`} justify="space-between" align="center">
                        <Text size="sm">
                          {slot.start} – {slot.end}
                        </Text>
                        {slot.exists && !replaceExisting ? (
                          <Badge color="gray" variant="light" size="sm">
                            Existe
                          </Badge>
                        ) : null}
                      </Group>
                    ))
                  )}
                </Stack>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            Total calculado: {totalBlocks} bloque{totalBlocks === 1 ? '' : 's'} · {replaceExisting ? `Planificados: ${totalBlocks}` : `Nuevos: ${Math.max(newBlocks, 0)}`} · Ignorados: {ignoredBlocks} · Acción: {replaceExisting ? 'Recrear jornada completa' : 'Agregar solo bloques nuevos'}
          </Text>
          <Group gap="sm">
            <Button
              variant="default"
              onClick={() => {
                setStartTime('08:00')
                setBlocksPerDay(6)
                setDurationMinutes(90)
                setGapMinutes(10)
                setIncludeGap(false)
                setIncludeWeekends(false)
                setReplaceExisting(false)
                setFeedback(null)
              }}
            >
              Restablecer
            </Button>
            <Button
              color={replaceExisting ? 'red' : 'indigo'}
              onClick={handleGenerate}
              loading={creating}
              disabled={!canSubmit}
            >
              {replaceExisting ? 'Recrear bloques' : 'Generar bloques'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  )
}

function normalizePayload(fields: Field[], form: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const f of fields) {
    let value = form[f.name]
    if (value === '' || value === undefined) continue
    if (f.type === 'number') {
      const num = typeof value === 'number' ? value : value.toString().includes('.') ? parseFloat(value) : parseInt(value, 10)
      if (!Number.isNaN(num)) value = num
    }
    if (f.type === 'checkbox') value = Boolean(value)
    if (f.type === 'time' && typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
      value = `${value}:00`
    }
    out[f.name] = value
  }
  return out
}

function buildSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    switch (field.type) {
      case 'number': {
        const base = z.preprocess((val: unknown) => {
          if (val === '' || val === undefined || val === null) return undefined
          if (typeof val === 'number') return val
          const s = String(val)
          const n = s.includes('.') ? parseFloat(s) : parseInt(s, 10)
          return Number.isNaN(n) ? undefined : n
        }, z.number({ required_error: 'Requerido', invalid_type_error: 'Debe ser un número' }))
        let numberSchema: z.ZodTypeAny = base
        if (field.name === 'weight') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 1, { message: 'Debe estar entre 0 y 1' })
        if (field.name === 'score') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 100, { message: '0 a 100' })
        if (field.name === 'day_of_week') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 6, { message: '0=Lunes … 6=Domingo' })
        if (['credits', 'weekly_hours', 'capacity'].includes(field.name)) numberSchema = numberSchema.refine((n: number) => n >= 0, { message: 'Debe ser >= 0' })
        shape[field.name] = field.required ? numberSchema : numberSchema.optional()
        break
      }
      case 'date': {
        const schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD' })
        shape[field.name] = field.required ? schema : schema.optional()
        break
      }
      case 'time': {
        const schema = z.string().regex(/^\d{2}:\d{2}$/, { message: 'Formato HH:MM' })
        shape[field.name] = field.required ? schema : schema.optional()
        break
      }
      case 'checkbox': {
        const schema = z.boolean()
        shape[field.name] = field.required ? schema : schema.optional()
        break
      }
      case 'text':
      default: {
        const base = z.string().transform((val: string) => (val === '' ? undefined : val))
        shape[field.name] = field.required ? z.string().min(1, 'Requerido') : base.optional()
      }
    }
  }
  return z.object(shape)
}

function endpointFor(fieldName: string): string | undefined {
  switch (fieldName) {
    case 'user_id':
      return '/users/'
    case 'program_id':
      return '/programs/'
    case 'subject_id':
      return '/subjects/'
    case 'teacher_id':
      return '/teachers/'
    case 'student_id':
      return '/students/'
    case 'course_id':
      return '/courses/'
    case 'room_id':
      return '/rooms/'
    case 'timeslot_id':
      return '/timeslots/'
    case 'program_semester_id':
      return '/program-semesters/'
    default:
      return undefined
  }
}

function labelForOption(item: any): string {
  const primary = item?.name || item?.full_name || item?.label || item?.code || item?.email
  const secondary = item?.semester_number ? `Sem ${item.semester_number}` : item?.level
  if (!primary) return String(item?.id ?? '')
  if (secondary) return `${item.id} — ${primary} (${secondary})`
  return `${item.id} — ${primary}`
}

function CrudSection({ section }: { section: Section }) {
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string | undefined>()
  const [success, setSuccess] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectOptions, setSelectOptions] = useState<Record<string, { value: string; label: string }[]>>({})
  const [filterQuery, setFilterQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const columns = useMemo(() => {
    if (items.length === 0) return []
    return Object.keys(items[0])
  }, [items])

  const emptyFormValues = useMemo(() => {
    const defaults: Record<string, any> = {}
    for (const field of section.fields) {
      if (field.type === 'checkbox') {
        defaults[field.name] = false
      } else {
        defaults[field.name] = ''
      }
    }
    return defaults
  }, [section.fields])

  const schema = useMemo(() => {
    let base: z.ZodTypeAny = buildSchema(section.fields)
    if (section.key === 'timeslots') {
      base = base.refine((data: any) => {
        const start = data.start_time as string | undefined
        const end = data.end_time as string | undefined
        if (!start || !end) return true
        return start < end
      }, { message: 'La hora de término debe ser mayor a la de inicio', path: ['end_time'] })
    }
    return base
  }, [section.fields, section.key])

  const { control, register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Record<string, any>>({
    resolver: zodResolver(schema),
    defaultValues: {},
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const endpoint = section.endpoint.endsWith('/') ? section.endpoint : `${section.endpoint}/`
      const { data } = await api.get(endpoint)
      setItems(Array.isArray(data) ? data : [])
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al cargar'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [section.endpoint])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (sortColumn && !columns.includes(sortColumn)) {
      setSortColumn(null)
    }
  }, [columns, sortColumn])

  useEffect(() => {
    let cancelled = false
    const relatedFields = section.fields
      .map((field) => ({ field, endpoint: endpointFor(field.name) }))
      .filter((entry): entry is { field: Field; endpoint: string } => Boolean(entry.endpoint))

    if (relatedFields.length === 0) {
      setSelectOptions({})
      return
    }

    ;(async () => {
      const accum: Record<string, { value: string; label: string }[]> = {}
      for (const { field, endpoint } of relatedFields) {
        try {
          const { data } = await api.get(endpoint)
          if (cancelled) return
          accum[field.name] = (Array.isArray(data) ? data : []).map((item: any) => ({ value: String(item.id), label: labelForOption(item) }))
        } catch (err) {
          console.error('No se pudo cargar catálogo relacionado', err)
        }
      }
      if (!cancelled) setSelectOptions(accum)
    })()

    return () => {
      cancelled = true
    }
  }, [section.fields, section.key])

  const onSubmit = async (values: Record<string, any>) => {
    setError(undefined)
    setSuccess(undefined)
    try {
      const payload = normalizePayload(section.fields, values)
      if (editingId !== null) {
        const base = section.endpoint.endsWith('/') ? section.endpoint.slice(0, -1) : section.endpoint
        await api.put(`${base}/${editingId}`, payload)
        setSuccess('Actualizado correctamente')
      } else {
        const endpoint = section.endpoint.endsWith('/') ? section.endpoint : `${section.endpoint}/`
        await api.post(endpoint, payload)
        setSuccess('Creado correctamente')
      }
      setEditingId(null)
      reset({ ...emptyFormValues })
      await load()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al guardar'
      setError(detail)
    }
  }

  const onDelete = useCallback(async (id: number) => {
    setError(undefined)
    setSuccess(undefined)
    try {
      if (typeof window !== 'undefined') {
        const ok = window.confirm('¿Eliminar este registro?')
        if (!ok) return
      }
      const base = section.endpoint.endsWith('/') ? section.endpoint.slice(0, -1) : section.endpoint
      await api.delete(`${base}/${id}`)
      setSuccess('Eliminado correctamente')
      await load()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al eliminar'
      setError(detail)
    }
  }, [load, section.endpoint])

  const filteredAndSortedItems = useMemo(() => {
    const normalizedQuery = filterQuery.trim().toLowerCase()
    let data = items
    if (normalizedQuery) {
      data = data.filter((row) =>
        columns.some((column) => {
          const value = row[column]
          if (value === null || value === undefined) return false
          if (typeof value === 'object') {
            return JSON.stringify(value).toLowerCase().includes(normalizedQuery)
          }
          return String(value).toLowerCase().includes(normalizedQuery)
        })
      )
    }

    if (sortColumn) {
      const directionMultiplier = sortDirection === 'asc' ? 1 : -1
      data = [...data].sort((a, b) => {
        const aValue = a[sortColumn]
        const bValue = b[sortColumn]
        if (aValue === bValue) return 0

        const parseValue = (value: any) => {
          if (value === null || value === undefined) return ''
          if (typeof value === 'number') return value
          if (typeof value === 'string') return value.toLowerCase()
          if (typeof value === 'boolean') return value ? 1 : 0
          if (value instanceof Date) return value.getTime()
          return JSON.stringify(value).toLowerCase()
        }

        const aParsed = parseValue(aValue)
        const bParsed = parseValue(bValue)

        if (typeof aParsed === 'number' && typeof bParsed === 'number') {
          return (aParsed - bParsed) * directionMultiplier
        }

        return String(aParsed).localeCompare(String(bParsed)) * directionMultiplier
      })
    }

    return data
  }, [columns, filterQuery, items, sortColumn, sortDirection])

  return (
    <Stack gap="xl">
      <Card radius="lg" padding="xl" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                Gestión de {section.title.toLowerCase()}
              </Text>
              <Title order={3}>{section.title}</Title>
              <Text size="sm" c="dimmed">{section.description}</Text>
            </div>
            <Stack gap={4} align="flex-end">
              <Badge variant="light" color="gray">Endpoint {section.endpoint}</Badge>
              {editingId !== null && <Badge color="teal" variant="light">Editando #{editingId}</Badge>}
            </Stack>
          </Group>

          {error && (
            <Alert color="red" variant="light" title="Ocurrió un problema">
              {error}
            </Alert>
          )}
          {success && (
            <Alert color="teal" variant="light" title="Acción exitosa">
              {success}
            </Alert>
          )}

          {section.key === 'timeslots' && (
            <Stack gap="md">
              <TimeslotBulkBuilder existing={items as TimeslotRecord[]} onCreated={load} />
              <TimeslotOverview slots={items as TimeslotRecord[]} onDelete={(id) => onDelete(id)} />
            </Stack>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack gap="lg">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                {section.fields.map((field) => {
                  const relationOptions = selectOptions[field.name]
                  if (relationOptions && relationOptions.length > 0) {
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <Select
                            label={field.label || field.name}
                            placeholder={field.placeholder || (field.required ? 'Requerido' : 'Opcional')}
                            data={relationOptions}
                            value={controllerField.value ?? ''}
                            onChange={(value) => controllerField.onChange(value ?? '')}
                            error={(errors as any)[field.name]?.message as string | undefined}
                            searchable
                            clearable={!field.required}
                            nothingFoundMessage="Sin resultados"
                          />
                        )}
                      />
                    )
                  }

                  if (field.type === 'checkbox') {
                    return (
                      <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: controllerField }) => (
                          <Checkbox
                            label={field.label || field.name}
                            checked={Boolean(controllerField.value)}
                            onChange={(event) => controllerField.onChange(event.currentTarget.checked)}
                          />
                        )}
                      />
                    )
                  }

                  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'
                  return (
                    <TextInput
                      key={field.name}
                      label={field.label || field.name}
                      type={inputType}
                      placeholder={field.placeholder || field.name}
                      error={(errors as any)[field.name]?.message as string | undefined}
                      aria-invalid={errors[field.name] ? 'true' : 'false'}
                      {...register(field.name)}
                    />
                  )
                })}
              </SimpleGrid>

              <Group justify="flex-end" gap="sm">
                <Button type="submit" color="dark" loading={isSubmitting} leftSection={<IconClipboardList size={16} />}>
                  {editingId !== null ? 'Guardar cambios' : 'Crear registro'}
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    reset({ ...emptyFormValues })
                    setEditingId(null)
                    setError(undefined)
                    setSuccess(undefined)
                  }}
                >
                  Limpiar formulario
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Card>

      <Card radius="lg" padding="xl" withBorder>
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={600}>Registros actuales</Text>
              <Text size="sm" c="dimmed">
                Sincroniza y administra los datos del dominio seleccionado.
              </Text>
            </div>
            <Group gap="xs" align="center">
              <Badge color="indigo" variant="light">
                {filteredAndSortedItems.length}
                {items.length !== filteredAndSortedItems.length ? ` / ${items.length}` : ''} registros
              </Badge>
              <Tooltip label="Actualizar" withArrow>
                <ActionIcon variant="light" color="indigo" onClick={() => load()} aria-label="Actualizar registros">
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <Divider />

          <Stack gap="sm">
            <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
              <TextInput
                label="Buscar"
                placeholder="Filtra por cualquier columna"
                leftSection={<IconSearch size={16} />}
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.currentTarget.value)}
                style={{ flex: '1 1 220px', maxWidth: 320 }}
                rightSection={filterQuery ? <CloseButton aria-label="Limpiar filtro" onClick={() => setFilterQuery('')} /> : undefined}
              />
              {columns.length > 0 && (
                <Group gap="xs" wrap="wrap" align="flex-end">
                  <Select
                    label="Ordenar por"
                    placeholder="Selecciona columna"
                    data={columns.map((column) => ({ value: column, label: column.replace(/_/g, ' ') }))}
                    value={sortColumn}
                    onChange={(value) => setSortColumn(value || null)}
                    leftSection={<IconArrowsSort size={16} />}
                    clearable
                    style={{ flex: '1 1 180px', maxWidth: 220 }}
                  />
                  <SegmentedControl
                    value={sortDirection}
                    onChange={(val) => setSortDirection(val as 'asc' | 'desc')}
                    data={[
                      { label: 'Asc', value: 'asc' },
                      { label: 'Desc', value: 'desc' },
                    ]}
                    disabled={!sortColumn}
                  />
                </Group>
              )}
            </Group>
          </Stack>

          {loading ? (
            <Center py="xl">
              <Loader color="indigo" />
            </Center>
          ) : items.length === 0 ? (
            <Stack align="center" gap="xs" py="xl">
              <IconDatabase size={32} color="var(--mantine-color-gray-5)" />
              <Text c="dimmed" ta="center">No hay registros disponibles. Crea el primero usando el formulario superior.</Text>
            </Stack>
          ) : filteredAndSortedItems.length === 0 ? (
            <Stack align="center" gap="xs" py="xl">
              <IconFilter size={32} color="var(--mantine-color-gray-5)" />
              <Text c="dimmed" ta="center">No encontramos coincidencias con los filtros aplicados.</Text>
              <Button variant="subtle" size="xs" onClick={() => { setFilterQuery(''); setSortColumn(null); }}>
                Limpiar filtros
              </Button>
            </Stack>
          ) : (
            <ScrollArea.Autosize offsetScrollbars mah="60vh" type="always" scrollbarSize={10}>
              <div style={{ minWidth: 720, width: '100%', overflowX: 'auto' }}>
                <Table
                  verticalSpacing="sm"
                  horizontalSpacing="md"
                  striped
                  highlightOnHover
                  withTableBorder
                  style={{ tableLayout: 'fixed', minWidth: '100%' }}
                >
                  <Table.Thead>
                    <Table.Tr>
                      {columns.map((column) => (
                        <Table.Th key={column} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {column}
                        </Table.Th>
                      ))}
                      <Table.Th style={{ width: 120, whiteSpace: 'nowrap' }}>Acciones</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredAndSortedItems.map((row) => (
                      <Table.Tr key={row.id ?? `${section.key}-${JSON.stringify(row)}`}>
                        {columns.map((column) => {
                          const value = row[column]
                          if (value === null || value === undefined) return <Table.Td key={column}>—</Table.Td>
                          if (typeof value === 'object') return <Table.Td key={column}>{labelForOption(value)}</Table.Td>
                          return (
                            <Table.Td
                              key={column}
                              style={{
                                wordBreak: 'break-word',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 200,
                              }}
                              title={String(value)}
                            >
                              {String(value)}
                            </Table.Td>
                          )
                        })}
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Editar" withArrow>
                              <ActionIcon
                                variant="subtle"
                                color="dark"
                                aria-label="Editar"
                                onClick={() => {
                                  const values: Record<string, any> = {}
                                  for (const field of section.fields) {
                                    let value = row[field.name]
                                    if (value === null || value === undefined) continue
                                    if (field.type === 'time' && typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value)) {
                                      value = value.slice(0, 5)
                                    }
                                    values[field.name] = selectOptions[field.name] ? String(value) : value
                                  }
                                  reset(values)
                                  setEditingId(row.id ?? null)
                                  setError(undefined)
                                  setSuccess(undefined)
                                }}
                              >
                                <IconPencil size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Eliminar" withArrow>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                aria-label="Eliminar"
                                onClick={() => row.id !== undefined && onDelete(row.id)}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}

export function Admin() {
  const crudSections: Section[] = useMemo(() => ([
    {
      key: 'programs',
      title: 'Programas',
      description: 'Define la estructura académica por nivel, código y duración.',
      endpoint: '/programs/',
      icon: IconSchool,
      fields: [
        { name: 'code', type: 'text', required: true, label: 'Código' },
        { name: 'name', type: 'text', required: true, label: 'Nombre' },
        { name: 'level', type: 'text', label: 'Nivel' },
        { name: 'duration_semesters', type: 'number', label: 'Duración (semestres)' },
        { name: 'description', type: 'text', label: 'Descripción' },
      ],
    },
    {
      key: 'program_semesters',
      title: 'Semestres de Programa',
      description: 'Organiza los semestres asociados a cada programa académico.',
      endpoint: '/program-semesters/',
      icon: IconCalendarEvent,
      fields: [
        { name: 'program_id', type: 'number', required: true, label: 'Programa' },
        { name: 'semester_number', type: 'number', required: true, label: 'Número de semestre' },
        { name: 'label', type: 'text', label: 'Etiqueta' },
        { name: 'description', type: 'text', label: 'Descripción' },
        { name: 'is_active', type: 'checkbox', label: 'Activo' },
      ],
    },
    {
      key: 'students',
      title: 'Estudiantes',
      description: 'Alta y vinculación de estudiantes con su cohorte y programa.',
      endpoint: '/students/',
      icon: IconUsersGroup,
      fields: [
        { name: 'user_id', type: 'number', required: true, label: 'Usuario' },
        { name: 'enrollment_year', type: 'number', required: true, label: 'Año de ingreso' },
        { name: 'registration_number', type: 'text', label: 'Matrícula' },
        { name: 'program_id', type: 'number', required: true, label: 'Programa' },
        { name: 'grade_level', type: 'text', label: 'Grado/Nivel' },
        { name: 'section', type: 'text', label: 'Sección' },
        { name: 'modality', type: 'text', label: 'Modalidad', placeholder: 'in_person / online / hybrid' },
        { name: 'status', type: 'text', label: 'Estado', placeholder: 'active / suspended / graduated / withdrawn' },
        { name: 'admission_date', type: 'date', label: 'Fecha de admisión' },
        { name: 'expected_graduation_date', type: 'date', label: 'Fecha graduación estimada' },
        { name: 'gpa', type: 'number', label: 'GPA' },
        { name: 'current_term', type: 'text', label: 'Periodo actual' },
        { name: 'guardian_name', type: 'text', label: 'Apoderado' },
        { name: 'guardian_phone', type: 'text', label: 'Teléfono apoderado' },
      ],
    },
    {
      key: 'teachers',
      title: 'Profesores',
      description: 'Gestiona docentes y sus departamentos asociados.',
      endpoint: '/teachers/',
      icon: IconChalkboard,
      fields: [
        { name: 'user_id', type: 'number', required: true, label: 'Usuario' },
        { name: 'department', type: 'text', label: 'Departamento' },
        { name: 'phone', type: 'text', label: 'Teléfono' },
        { name: 'hire_date', type: 'date', label: 'Fecha de contratación' },
        { name: 'employment_type', type: 'text', label: 'Tipo de contrato', placeholder: 'full_time / part_time / contract' },
        { name: 'office', type: 'text', label: 'Oficina' },
        { name: 'specialty', type: 'text', label: 'Especialidad' },
        { name: 'bio', type: 'text', label: 'Bio' },
      ],
    },
    {
      key: 'subjects',
      title: 'Asignaturas',
      description: 'Malla curricular por materia, créditos y programa base.',
      endpoint: '/subjects/',
      icon: IconClipboardList,
      fields: [
        { name: 'code', type: 'text', required: true, label: 'Código' },
        { name: 'name', type: 'text', required: true, label: 'Nombre' },
        { name: 'credits', type: 'number', required: true, label: 'Créditos' },
        { name: 'program_id', type: 'number', label: 'Programa' },
        { name: 'description', type: 'text', label: 'Descripción' },
        { name: 'department', type: 'text', label: 'Departamento' },
        { name: 'level', type: 'text', label: 'Nivel' },
        { name: 'hours_per_week', type: 'number', label: 'Horas por semana' },
      ],
    },
    {
      key: 'rooms',
      title: 'Salas',
      description: 'Inventario de aulas, su capacidad y ubicación física.',
      endpoint: '/rooms/',
      icon: IconBuilding,
      fields: [
        { name: 'code', type: 'text', required: true, label: 'Código' },
        { name: 'capacity', type: 'number', required: true, label: 'Capacidad' },
        { name: 'building', type: 'text', label: 'Edificio' },
        { name: 'campus', type: 'text', label: 'Campus' },
        { name: 'floor', type: 'text', label: 'Piso' },
        { name: 'room_type', type: 'text', label: 'Tipo de sala', placeholder: 'classroom / lab / auditorium / office' },
        { name: 'has_projector', type: 'checkbox', label: 'Tiene proyector' },
        { name: 'has_computers', type: 'checkbox', label: 'Tiene computadores' },
        { name: 'notes', type: 'text', label: 'Notas' },
      ],
    },
    {
      key: 'courses',
      title: 'Cursos',
      description: 'Planificación de cursos por periodo, sección y docente titular.',
      endpoint: '/courses/',
      icon: IconCalendarEvent,
      fields: [
        { name: 'subject_id', type: 'number', required: true, label: 'Asignatura' },
        { name: 'teacher_id', type: 'number', required: true, label: 'Profesor' },
        { name: 'program_semester_id', type: 'number', required: true, label: 'Semestre de programa' },
        { name: 'term', type: 'text', required: true, label: 'Periodo', placeholder: '2025-2' },
        { name: 'group', type: 'text', label: 'Grupo', placeholder: 'A' },
        { name: 'weekly_hours', type: 'number', label: 'Horas semanales' },
        { name: 'capacity', type: 'number', label: 'Capacidad' },
        { name: 'language', type: 'text', label: 'Idioma' },
        { name: 'modality', type: 'text', label: 'Modalidad', placeholder: 'in_person / online / hybrid' },
        { name: 'start_date', type: 'date', label: 'Fecha de inicio' },
        { name: 'end_date', type: 'date', label: 'Fecha de término' },
        { name: 'syllabus_url', type: 'text', label: 'URL syllabus' },
        { name: 'location_notes', type: 'text', label: 'Notas ubicación' },
      ],
    },
    {
      key: 'timeslots',
      title: 'Bloques Horarios',
      description: 'Definición de bloques lectivos con día y horario válido.',
      endpoint: '/timeslots/',
      icon: IconClockHour4,
      fields: [
        { name: 'day_of_week', type: 'number', required: true, label: 'Día (0-6)', placeholder: '0=Lunes' },
        { name: 'start_time', type: 'time', required: true, label: 'Hora inicio' },
        { name: 'end_time', type: 'time', required: true, label: 'Hora fin' },
        { name: 'campus', type: 'text', label: 'Campus' },
        { name: 'comment', type: 'text', label: 'Comentario' },
      ],
    },
    {
      key: 'course_schedules',
      title: 'Horarios de Curso',
      description: 'Asignación de aula y bloque para cada curso ofertado.',
      endpoint: '/course-schedules/',
      icon: IconCalendarEvent,
      fields: [
        { name: 'course_id', type: 'number', required: true, label: 'Curso' },
        { name: 'room_id', type: 'number', required: true, label: 'Sala' },
        { name: 'timeslot_id', type: 'number', required: true, label: 'Bloque' },
      ],
    },
    {
      key: 'enrollments',
      title: 'Matrículas',
      description: 'Relación estudiante-curso con seguimiento de inscripción.',
      endpoint: '/enrollments/',
      icon: IconSchool,
      fields: [
        { name: 'student_id', type: 'number', required: true, label: 'Estudiante' },
        { name: 'course_id', type: 'number', required: true, label: 'Curso' },
        { name: 'status', type: 'text', label: 'Estado', placeholder: 'enrolled / dropped / completed / failed / withdrawn' },
        { name: 'final_grade', type: 'number', label: 'Nota final' },
        { name: 'dropped_at', type: 'text', label: 'Fecha de retiro', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
        { name: 'notes', type: 'text', label: 'Notas' },
      ],
    },
    {
      key: 'evaluations',
      title: 'Evaluaciones',
      description: 'Configura actividades evaluativas y su ponderación.',
      endpoint: '/evaluations/',
      icon: IconAward,
      fields: [
        { name: 'course_id', type: 'number', required: true, label: 'Curso' },
        { name: 'name', type: 'text', required: true, label: 'Nombre' },
        { name: 'weight', type: 'number', required: true, label: 'Ponderación' },
        { name: 'scheduled_at', type: 'text', label: 'Programado para', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
        { name: 'max_score', type: 'number', label: 'Puntaje máximo' },
        { name: 'due_date', type: 'text', label: 'Fecha límite', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
        { name: 'description', type: 'text', label: 'Descripción' },
      ],
    },
    {
      key: 'grades',
      title: 'Notas',
      description: 'Registro de calificaciones por evaluación y matrícula.',
      endpoint: '/grades/',
      icon: IconClipboardList,
      fields: [
        { name: 'enrollment_id', type: 'number', required: true, label: 'Matrícula' },
        { name: 'evaluation_id', type: 'number', required: true, label: 'Evaluación' },
        { name: 'score', type: 'number', required: true, label: 'Nota' },
        { name: 'graded_at', type: 'text', label: 'Calificado en', placeholder: 'YYYY-MM-DDTHH:MM:SS' },
        { name: 'feedback', type: 'text', label: 'Retroalimentación' },
      ],
    },
    {
      key: 'attendance',
      title: 'Asistencia',
      description: 'Control de asistencia por sesión programada.',
      endpoint: '/attendance/',
      icon: IconClipboardList,
      fields: [
        { name: 'enrollment_id', type: 'number', required: true, label: 'Matrícula' },
        { name: 'session_date', type: 'date', required: true, label: 'Fecha' },
        { name: 'present', type: 'checkbox', label: 'Presente' },
        { name: 'arrival_time', type: 'time', label: 'Hora de llegada' },
        { name: 'notes', type: 'text', label: 'Notas' },
      ],
    },
  ]), [])

  const plannerTabKey = 'planner'
  const [active, setActive] = useState(crudSections[0].key)
  const current = crudSections.find((section) => section.key === active)
  const isPlanner = active === plannerTabKey

  const quickStats = useMemo(() => ([
    { label: 'Catálogos activos', value: crudSections.length, hint: 'Dominios conectados', icon: IconDatabase },
    { label: 'Último refresh', value: 'Hace 5 min', hint: 'Sincronización API estable', icon: IconRefresh },
    { label: 'Tareas pendientes', value: '3', hint: 'Solicitudes de actualización', icon: IconClipboardList },
  ]), [crudSections.length])

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
          Centro de datos maestros
        </Text>
        <Title order={2}>Panel administrativo avanzado</Title>
        <Text size="sm" c="dimmed">
          Orquesta los catálogos centrales de la institución y mantén la coherencia visual con la nueva intranet.
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
        {quickStats.map((stat) => (
          <Card key={stat.label} radius="lg" padding="lg" withBorder>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{stat.label}</Text>
                <Title order={3} mt={4}>{stat.value}</Title>
                <Text size="xs" c="dimmed" mt={4}>{stat.hint}</Text>
              </div>
              <ActionIcon variant="light" size="lg" radius="md" color="dark" aria-label={stat.label}>
                <stat.icon size={18} />
              </ActionIcon>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder radius="lg" padding="md" style={{ background: 'rgba(15, 23, 42, 0.85)', color: 'white' }}>
        <Tabs value={active} onChange={(value) => value && setActive(value)} variant="pills" radius="md" keepMounted={false}>
          <Tabs.List style={{ flexWrap: 'wrap', gap: 8 }}>
            {crudSections.map((section) => (
              <Tabs.Tab key={section.key} value={section.key} leftSection={<section.icon size={16} />}> 
                {section.title}
              </Tabs.Tab>
            ))}
            <Tabs.Tab value={plannerTabKey} leftSection={<IconCalendarCog size={16} />}>
              Planificador de horarios
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Card>

  {isPlanner ? <SchedulePlanner /> : current && <CrudSection section={current} />}
    </Stack>
  )
}
