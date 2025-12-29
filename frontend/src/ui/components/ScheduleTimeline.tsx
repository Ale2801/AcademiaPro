import React, { useMemo } from 'react'
import { ActionIcon, Badge, Card, Divider, Group, ScrollArea, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconClockHour3, IconMapPin, IconTrash } from '@tabler/icons-react'

export type ScheduleEntry = {
  id?: number
  course_id: number
  course_name?: string | null
  subject_name?: string | null
  room_id?: number | null
  room_code?: string | null
  day_of_week?: number | null
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
  start_offset_minutes?: number | null
  teacher_id?: number | null
  teacher_name?: string | null
  timeslot_id?: number | null
  program_semester_id?: number | null
  program_id?: number | null
  program_semester_label?: string | null
}

export type TimeslotSummary = {
  id: number
  day_of_week: number
  start_time: string
  end_time: string
  campus?: string | null
  comment?: string | null
}

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'Horario por definir'
  return [start, end].filter(Boolean).join(' - ')
}

type ScheduleTimelineProps = {
  entries: ScheduleEntry[]
  title?: string
  onRemove?: (entry: ScheduleEntry) => void
  busyCourseIds?: number[]
  timeslots?: TimeslotSummary[]
}

export function ScheduleTimeline({ entries, title, onRemove, busyCourseIds, timeslots }: ScheduleTimelineProps) {
  const busyLookup = new Set(busyCourseIds ?? [])

  const grouped = useMemo(() => {
    const map = new Map<number, ScheduleEntry[]>()
    for (const entry of entries) {
      const dayIndex = entry.day_of_week ?? -1
      const bucket = map.get(dayIndex) ?? []
      bucket.push(entry)
      map.set(dayIndex, bucket)
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const aKey = `${a.start_time ?? ''}${a.course_id}`
        const bKey = `${b.start_time ?? ''}${b.course_id}`
        return aKey.localeCompare(bKey)
      })
    }
    return map
  }, [entries])

  const timeslotsByDay = useMemo(() => {
    if (!timeslots || timeslots.length === 0) return null
    const map = new Map<number, TimeslotSummary[]>()
    for (const slot of timeslots) {
      const dayIndex = slot.day_of_week ?? -1
      const bucket = map.get(dayIndex) ?? []
      bucket.push(slot)
      map.set(dayIndex, bucket)
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const aKey = `${a.start_time ?? ''}_${a.id}`
        const bKey = `${b.start_time ?? ''}_${b.id}`
        return aKey.localeCompare(bKey)
      })
    }
    return map
  }, [timeslots])

  const entriesByTimeslot = useMemo(() => {
    const map = new Map<number, ScheduleEntry[]>()
    for (const entry of entries) {
      if (entry.timeslot_id == null) continue
      const bucket = map.get(entry.timeslot_id) ?? []
      bucket.push(entry)
      map.set(entry.timeslot_id, bucket)
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const aKey = `${a.start_time ?? ''}${a.course_id}`
        const bKey = `${b.start_time ?? ''}${b.course_id}`
        return aKey.localeCompare(bKey)
      })
    }
    return map
  }, [entries])

  const entriesWithoutMappedTimeslot = useMemo(() => {
    const map = new Map<number, ScheduleEntry[]>()
    for (const entry of entries) {
      const dayIndex = entry.day_of_week ?? -1
      const hasSlot =
        entry.timeslot_id != null &&
        timeslotsByDay?.get(dayIndex)?.some((slot) => slot.id === entry.timeslot_id)
      if (!hasSlot) {
        const bucket = map.get(dayIndex) ?? []
        bucket.push(entry)
        map.set(dayIndex, bucket)
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const aKey = `${a.start_time ?? ''}${a.course_id}`
        const bKey = `${b.start_time ?? ''}${b.course_id}`
        return aKey.localeCompare(bKey)
      })
    }
    return map
  }, [entries, timeslotsByDay])

  const dayOrder = useMemo(() => {
    const set = new Set<number>()
    for (const key of grouped.keys()) set.add(key)
    if (timeslotsByDay) {
      for (const key of timeslotsByDay.keys()) set.add(key)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [grouped, timeslotsByDay])

  const renderEntryCard = (slot: ScheduleEntry) => {
    const cardKey = `${slot.course_id}-${slot.timeslot_id ?? 'na'}-${slot.room_code ?? 'room'}`
    const isBusy = busyLookup.has(slot.course_id)
    return (
      <Card key={cardKey} radius="md" withBorder padding="sm">
        <Stack gap={4}>
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
            <Stack gap={2} style={{ flex: 1 }}>
              <Text fw={600}>{slot.course_name ?? `Curso #${slot.course_id}`}</Text>
              {slot.teacher_name && <Text size="xs" c="dimmed">{slot.teacher_name}</Text>}
            </Stack>
            {onRemove && (
              <Tooltip label="Quitar del horario" withArrow>
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="red"
                  aria-label="Quitar del horario"
                  onClick={() => onRemove(slot)}
                  disabled={isBusy}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          <Group gap="xs" align="center">
            <IconClockHour3 size={14} />
            <Text size="sm">{formatRange(slot.start_time, slot.end_time)}</Text>
          </Group>
          {slot.room_code && (
            <Group gap="xs" align="center">
              <IconMapPin size={14} />
              <Text size="sm">{slot.room_code}</Text>
            </Group>
          )}
        </Stack>
      </Card>
    )
  }

  if (entries.length === 0 && (!timeslotsByDay || timeslotsByDay.size === 0)) {
    return (
      <Card withBorder radius="lg" padding="xl">
        <Stack gap="sm" align="center">
          <Title order={4}>Sin asignaciones todavía</Title>
          <Text c="dimmed" ta="center">Genera o asigna clases para verlas reflejadas aquí.</Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="lg">
      {title && <Title order={3}>{title}</Title>}
      <ScrollArea type="auto" offsetScrollbars>
        <Group wrap="nowrap" align="stretch" gap="lg">
          {dayOrder.map((dayIndex) => {
            const label = dayIndex >= 0 ? DAY_LABELS[dayIndex] : 'Sin día asignado'
            const slotSummaries = timeslotsByDay?.get(dayIndex) ?? []
            const freeEntries = entriesWithoutMappedTimeslot.get(dayIndex) ?? []
            const assignmentCount = slotSummaries.length > 0
              ? slotSummaries.reduce((count, slot) => count + (entriesByTimeslot.get(slot.id)?.length ?? 0), 0)
              : freeEntries.length

            return (
              <Card key={label} withBorder radius="lg" padding="lg" style={{ minWidth: 280 }}>
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Title order={4}>{label}</Title>
                    <Badge color="blue" variant="light">{assignmentCount}</Badge>
                  </Group>
                  <Divider my="xs" />
                  <Stack gap="sm">
                    {slotSummaries.length > 0 ? (
                      slotSummaries.map((slot) => {
                        const slotEntries = entriesByTimeslot.get(slot.id) ?? []
                        const hasEntries = slotEntries.length > 0
                        return (
                          <Card
                            key={`${slot.id}-${slot.start_time}`}
                            radius="md"
                            padding="sm"
                            withBorder
                            style={{
                              borderStyle: hasEntries ? 'solid' : 'dashed',
                              borderColor: hasEntries ? undefined : 'var(--mantine-color-dark-4)',
                              backgroundColor: hasEntries ? undefined : 'var(--mantine-color-dark-7)',
                            }}
                          >
                            <Stack gap={6}>
                              <Group justify="space-between" align="center">
                                <Text fw={600} size="sm">{formatRange(slot.start_time, slot.end_time)}</Text>
                                {slot.campus && <Badge size="xs" variant="light">{slot.campus}</Badge>}
                              </Group>
                              {slot.comment && (
                                <Text size="xs" c="dimmed">{slot.comment}</Text>
                              )}
                              {hasEntries ? (
                                <Stack gap={6}>{slotEntries.map(renderEntryCard)}</Stack>
                              ) : (
                                <Text size="xs" c="dimmed">Disponible</Text>
                              )}
                            </Stack>
                          </Card>
                        )
                      })
                    ) : freeEntries.length > 0 ? (
                      freeEntries.map(renderEntryCard)
                    ) : (
                      <Card radius="md" padding="sm" withBorder style={{ borderStyle: 'dashed', borderColor: 'var(--mantine-color-dark-4)' }}>
                        <Text size="sm" c="dimmed">No tienes clases asignadas en este día.</Text>
                      </Card>
                    )}
                  </Stack>
                </Stack>
              </Card>
            )
          })}
        </Group>
      </ScrollArea>
    </Stack>
  )
}

export default ScheduleTimeline
