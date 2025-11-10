import React, { useMemo, useState } from 'react'
import {
  Card,
  Stack,
  Group,
  Text,
  Title,
  Badge,
  Alert,
  Switch,
  NumberInput,
  TextInput,
  SimpleGrid,
  Button,
} from '@mantine/core'
import { IconCalendarPlus, IconAlertTriangle } from '@tabler/icons-react'
import { api } from '../../lib/api'
import type { TimeslotRecord } from './types'
import { WEEKDAY_LABELS } from './constants'
import { minutesToTimeLabel, normalizeTimeString, parseTimeString } from './utils'

type TimeslotBulkBuilderProps = {
  existing: TimeslotRecord[]
  onCreated: () => Promise<void> | void
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null

type PreviewSlot = { start: string; end: string; exists: boolean }

type PreviewDay = { day: number; label: string; slots: PreviewSlot[] }

type PreviewPayload = { overflow: boolean; days: PreviewDay[] }

const DEFAULT_START_TIME = '08:00'
const DEFAULT_BLOCKS_PER_DAY = 6
const DEFAULT_DURATION_MINUTES = 90
const DEFAULT_GAP_MINUTES = 10
const DEFAULT_LONG_BREAK_EVERY = 3
const DEFAULT_LONG_BREAK_MINUTES = 15
const DEFAULT_LUNCH_START = '13:00'
const DEFAULT_LUNCH_DURATION = 60

export function TimeslotBulkBuilder({ existing, onCreated }: TimeslotBulkBuilderProps) {
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME)
  const [blocksPerDay, setBlocksPerDay] = useState<number>(DEFAULT_BLOCKS_PER_DAY)
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_DURATION_MINUTES)
  const [includeGap, setIncludeGap] = useState(false)
  const [gapMinutes, setGapMinutes] = useState<number>(DEFAULT_GAP_MINUTES)
  const [longBreakEnabled, setLongBreakEnabled] = useState(false)
  const [longBreakEvery, setLongBreakEvery] = useState<number>(DEFAULT_LONG_BREAK_EVERY)
  const [longBreakMinutes, setLongBreakMinutes] = useState<number>(DEFAULT_LONG_BREAK_MINUTES)
  const [lunchEnabled, setLunchEnabled] = useState(false)
  const [lunchStart, setLunchStart] = useState(DEFAULT_LUNCH_START)
  const [lunchDurationMinutes, setLunchDurationMinutes] = useState<number>(DEFAULT_LUNCH_DURATION)
  const [includeWeekends, setIncludeWeekends] = useState(false)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)

  const normalizedExisting = useMemo(
    () =>
      existing.map((slot) => ({
        day_of_week: Number(slot.day_of_week),
        start_time: normalizeTimeString(
          typeof slot.start_time === 'string' ? slot.start_time : String(slot.start_time ?? ''),
        ),
        end_time: normalizeTimeString(
          typeof slot.end_time === 'string' ? slot.end_time : String(slot.end_time ?? ''),
        ),
      })),
    [existing],
  )

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
    if (includeGap && (!Number.isFinite(gapMinutes) || gapMinutes < 0)) return 'El descanso corto no puede ser negativo.'
    if (longBreakEnabled) {
      if (!Number.isFinite(longBreakEvery) || longBreakEvery <= 0) return 'Configura cada cuántos bloques aplicar el descanso extendido.'
      if (!Number.isFinite(longBreakMinutes) || longBreakMinutes <= 0) return 'La duración del descanso extendido debe ser mayor a 0 minutos.'
    }
    if (lunchEnabled) {
      const parsedLunchStart = parseTimeString(lunchStart)
      if (parsedLunchStart == null) return 'Ingresa una hora válida para el almuerzo (HH:MM).'
      if (!Number.isFinite(lunchDurationMinutes) || lunchDurationMinutes <= 0) return 'La duración del almuerzo debe ser mayor a 0 minutos.'
      if (parsedLunchStart < startMinutes) return 'La hora de almuerzo debe ser posterior al inicio de la jornada.'
      if (parsedLunchStart + lunchDurationMinutes > 24 * 60) return 'El almuerzo debe finalizar antes de medianoche.'
    }
    return null
  }, [
    gapMinutes,
    includeGap,
    longBreakEnabled,
    longBreakEvery,
    longBreakMinutes,
    lunchDurationMinutes,
    lunchEnabled,
    lunchStart,
    normalizedBlocks,
    normalizedDuration,
    startMinutes,
  ])

  const dayIndexes = useMemo(() => (includeWeekends ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]), [includeWeekends])

  const preview: PreviewPayload = useMemo(() => {
    if (validationError) {
      return { overflow: false, days: [] }
    }
    if (startMinutes == null || normalizedDuration <= 0 || normalizedBlocks <= 0) {
      return { overflow: false, days: [] }
    }

    const longBreakEveryNormalized = longBreakEnabled ? Math.max(1, Math.floor(longBreakEvery)) : 0
    const longBreakMinutesNormalized = longBreakEnabled ? Math.max(0, Math.round(longBreakMinutes)) : 0
    const lunchStartMinutes = lunchEnabled ? parseTimeString(lunchStart) : null
    const lunchDuration = lunchEnabled ? Math.max(0, Math.round(lunchDurationMinutes)) : 0
    const lunchEndMinutes = lunchStartMinutes != null ? lunchStartMinutes + lunchDuration : null

    let overflow = false
    const days: PreviewDay[] = dayIndexes.map((day) => {
      const slots: PreviewSlot[] = []
      let currentStart = startMinutes
      let consecutiveCounter = 0

      for (let index = 0; index < normalizedBlocks; index += 1) {
        if (currentStart >= 24 * 60) {
          overflow = true
          break
        }

        let slotStart = currentStart
        if (lunchStartMinutes != null && lunchEndMinutes != null) {
          if (slotStart < lunchEndMinutes && slotStart + normalizedDuration > lunchStartMinutes) {
            slotStart = Math.max(slotStart, lunchEndMinutes)
          }
          if (slotStart >= lunchStartMinutes && slotStart < lunchEndMinutes) {
            slotStart = lunchEndMinutes
          }
        }

        const slotEnd = slotStart + normalizedDuration
        if (slotEnd > 24 * 60) {
          overflow = true
          break
        }

        const startLabel = minutesToTimeLabel(slotStart)
        const endLabel = minutesToTimeLabel(slotEnd)
        const exists = existingKeys.has(`${day}-${startLabel}-${endLabel}`)
        slots.push({ start: startLabel, end: endLabel, exists })

        let nextStart = slotEnd
        if (includeGap && normalizedGap > 0) {
          nextStart += normalizedGap
        }

        consecutiveCounter += 1
        if (
          longBreakEveryNormalized > 0 &&
          longBreakMinutesNormalized > 0 &&
          consecutiveCounter >= longBreakEveryNormalized &&
          index < normalizedBlocks - 1
        ) {
          nextStart += longBreakMinutesNormalized
          consecutiveCounter = 0
        }

        if (
          lunchStartMinutes != null &&
          lunchEndMinutes != null &&
          nextStart >= lunchStartMinutes &&
          nextStart < lunchEndMinutes
        ) {
          nextStart = lunchEndMinutes
        }

        currentStart = nextStart
      }

      return {
        day,
        label: WEEKDAY_LABELS[day] ?? `Día ${day}`,
        slots,
      }
    })
    return { overflow, days }
  }, [
    dayIndexes,
    existingKeys,
    includeGap,
    longBreakEnabled,
    longBreakEvery,
    longBreakMinutes,
    lunchDurationMinutes,
    lunchEnabled,
    lunchStart,
    normalizedBlocks,
    normalizedDuration,
    normalizedGap,
    startMinutes,
    validationError,
  ])

  const totalBlocks = useMemo(
    () => preview.days.reduce((acc, day) => acc + day.slots.length, 0),
    [preview.days],
  )
  const duplicateBlocks = useMemo(
    () => preview.days.reduce((acc, day) => acc + day.slots.filter((slot) => slot.exists).length, 0),
    [preview.days],
  )
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
          })),
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
      const removedTimeslots = parseCount(
        result?.removed_timeslots,
        replaceExisting ? existing.length : 0,
      )
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
        fragments.push(
          `${removedVerb} ${removedTimeslots} bloque${removedTimeslots === 1 ? '' : 's'} anterior${removedTimeslots === 1 ? '' : 'es'}.`,
        )
      }
      if (removedSchedules > 0) {
        const cleanedVerb = removedSchedules === 1 ? 'Se limpió' : 'Se limpiaron'
        fragments.push(
          `${cleanedVerb} ${removedSchedules} horario${removedSchedules === 1 ? '' : 's'} asignado${removedSchedules === 1 ? '' : 's'}.`,
        )
      }
      setFeedback({ type: 'success', message: fragments.join(' ') })
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || 'No se pudieron crear los bloques'
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

    const restHighlights: string[] = []
    if (includeGap && normalizedGap > 0) {
      restHighlights.push(`descansos cortos de ${normalizedGap} minuto${normalizedGap === 1 ? '' : 's'}`)
    }
    if (longBreakEnabled && longBreakMinutes > 0) {
      restHighlights.push(
        `pausas extendidas cada ${longBreakEvery} bloque${longBreakEvery === 1 ? '' : 's'} (${longBreakMinutes} min)`,
      )
    }
    if (lunchEnabled) {
      restHighlights.push(
        `ventana de almuerzo desde ${lunchStart} por ${lunchDurationMinutes} minuto${lunchDurationMinutes === 1 ? '' : 's'}`,
      )
    }

    const restSummary = restHighlights.length > 0 ? ` Configuración de descansos: ${restHighlights.join(' · ')}.` : ''

    if (replaceExisting && existing.length > 0) {
      return `${base}${restSummary} Esta recreación eliminará ${existing.length} bloque${
        existing.length === 1 ? '' : 's'
      } actual${existing.length === 1 ? '' : 'es'} y los horarios que dependan de ellos.`
    }
    return `${base}${restSummary}`
  }, [
    existing.length,
    includeGap,
    includeWeekends,
    longBreakEnabled,
    longBreakEvery,
    longBreakMinutes,
    lunchDurationMinutes,
    lunchEnabled,
    lunchStart,
    normalizedGap,
    preview.days.length,
    replaceExisting,
    validationError,
  ])

  const allExisting =
    !replaceExisting && !validationError && !preview.overflow && totalBlocks > 0 && newBlocks === 0

  const handleReset = () => {
    setStartTime(DEFAULT_START_TIME)
    setBlocksPerDay(DEFAULT_BLOCKS_PER_DAY)
    setDurationMinutes(DEFAULT_DURATION_MINUTES)
    setIncludeGap(false)
    setGapMinutes(DEFAULT_GAP_MINUTES)
    setLongBreakEnabled(false)
    setLongBreakEvery(DEFAULT_LONG_BREAK_EVERY)
    setLongBreakMinutes(DEFAULT_LONG_BREAK_MINUTES)
    setLunchEnabled(false)
    setLunchStart(DEFAULT_LUNCH_START)
    setLunchDurationMinutes(DEFAULT_LUNCH_DURATION)
    setIncludeWeekends(false)
    setReplaceExisting(false)
    setFeedback(null)
  }

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
          <Alert
            color={feedback.type === 'success' ? 'teal' : 'red'}
            variant="light"
            title={feedback.type === 'success' ? 'Bloques generados' : 'No se pudo completar'}
          >
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

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Stack gap="xs">
            <Switch
              label="Descanso corto entre bloques"
              description="Inserta recreos automáticos"
              checked={includeGap}
              onChange={(event) => setIncludeGap(event.currentTarget.checked)}
              aria-label="Descanso corto entre bloques"
            />
            <NumberInput
              label="Duración descanso corto (min)"
              min={0}
              step={5}
              disabled={!includeGap}
              value={gapMinutes}
              onChange={(value) => setGapMinutes(typeof value === 'number' ? value : Number(value) || 0)}
            />
          </Stack>

          <Stack gap="xs">
            <Switch
              label="Descanso extendido programado"
              description="Agrega una pausa larga recurrente"
              checked={longBreakEnabled}
              onChange={(event) => setLongBreakEnabled(event.currentTarget.checked)}
              aria-label="Descanso extendido programado"
            />
            <Group gap="sm" align="flex-end" grow>
              <NumberInput
                label="Cada N bloques"
                min={1}
                max={12}
                disabled={!longBreakEnabled}
                value={longBreakEvery}
                onChange={(value) => {
                  const parsed = typeof value === 'number' ? value : Number(value)
                  setLongBreakEvery(!Number.isFinite(parsed) || parsed <= 0 ? 1 : Math.floor(parsed))
                }}
              />
              <NumberInput
                label="Duración descanso largo (min)"
                min={5}
                step={5}
                disabled={!longBreakEnabled}
                value={longBreakMinutes}
                onChange={(value) => {
                  const parsed = typeof value === 'number' ? value : Number(value)
                  setLongBreakMinutes(!Number.isFinite(parsed) || parsed <= 0 ? DEFAULT_LONG_BREAK_MINUTES : parsed)
                }}
              />
            </Group>
          </Stack>

          <Stack gap="xs">
            <Switch
              label="Definir pausa de almuerzo"
              description="Bloquea una ventana diaria"
              checked={lunchEnabled}
              onChange={(event) => setLunchEnabled(event.currentTarget.checked)}
              aria-label="Definir pausa de almuerzo"
            />
            <Group gap="sm" align="flex-end" grow>
              <TextInput
                label="Inicio almuerzo (HH:MM)"
                placeholder="13:00"
                disabled={!lunchEnabled}
                value={lunchStart}
                onChange={(event) => setLunchStart(event.currentTarget.value)}
              />
              <NumberInput
                label="Duración almuerzo (min)"
                min={5}
                step={5}
                disabled={!lunchEnabled}
                value={lunchDurationMinutes}
                onChange={(value) => {
                  const parsed = typeof value === 'number' ? value : Number(value)
                  setLunchDurationMinutes(!Number.isFinite(parsed) || parsed <= 0 ? DEFAULT_LUNCH_DURATION : parsed)
                }}
              />
            </Group>
          </Stack>

          <Stack gap="xs">
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
          </Stack>
        </SimpleGrid>

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
                  <Badge color={day.slots.length > 0 ? 'blue' : 'gray'} variant="light">
                    {day.slots.length} bloque{day.slots.length === 1 ? '' : 's'}
                  </Badge>
                </Group>
                <Stack gap={4}>
                  {day.slots.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      Sin bloques generados con la configuración actual.
                    </Text>
                  ) : (
                    day.slots.map((slot) => (
                      <Group key={`${day.day}-${slot.start}-${slot.end}`} justify="space-between" align="center">
                        <Text size="sm">
                          {slot.start} – {slot.end}
                        </Text>
                        {slot.exists ? (
                          <Badge color="gray" variant="light" title="Ya existe">
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
            <Button variant="default" onClick={handleReset}>
              Restablecer
            </Button>
            <Button color={replaceExisting ? 'red' : 'indigo'} onClick={handleGenerate} loading={creating} disabled={!canSubmit}>
              {replaceExisting ? 'Recrear bloques' : 'Generar bloques'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  )
}
