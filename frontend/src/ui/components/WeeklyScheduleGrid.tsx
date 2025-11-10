import React, { useMemo } from 'react'
import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconClockHour4, IconMapPin } from '@tabler/icons-react'
import { WEEKDAY_LABELS } from '../admin/constants'

type WeeklyScheduleEntry = {
  id: number | string
  dayIndex: number
  startMinutes: number
  endMinutes: number
  startLabel: string
  endLabel: string
  title: string
  subtitle?: string | null
  room?: string | null
  location?: string | null
  note?: string | null
}

type WeeklyScheduleGridProps = {
  entries: WeeklyScheduleEntry[]
  /** Texto a mostrar cuando no hay bloques en un día. */
  emptyDayLabel?: string
  /** Texto a mostrar cuando no existen bloques en toda la semana. */
  emptyStateLabel?: string
  /** Mostrar todos los días de la semana aunque no tengan clases. */
  showEmptyDays?: boolean
}

const DEFAULT_DAY_ORDER: number[] = [0, 1, 2, 3, 4, 5, 6]

export function WeeklyScheduleGrid({
  entries,
  emptyDayLabel = 'Sin clases asignadas',
  emptyStateLabel = 'No hay bloques programados en la semana',
  showEmptyDays = true,
}: WeeklyScheduleGridProps) {
  const orderMap = useMemo(() => {
    const map = new Map<number, number>()
    DEFAULT_DAY_ORDER.forEach((day, index) => {
      map.set(day, index)
    })
    return map
  }, [])

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const orderA = orderMap.get(a.dayIndex) ?? a.dayIndex
      const orderB = orderMap.get(b.dayIndex) ?? b.dayIndex
      if (orderA !== orderB) return orderA - orderB
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes
      return a.endMinutes - b.endMinutes
    })
  }, [entries, orderMap])

  const dayIndices = useMemo(() => {
    const used = new Set<number>()
    for (const entry of sortedEntries) {
      used.add(entry.dayIndex)
    }
    const base = showEmptyDays ? DEFAULT_DAY_ORDER : []
    const combined = new Set<number>(base)
    for (const value of used) combined.add(value)
    const result = Array.from(combined)
    result.sort((a, b) => {
      const orderA = orderMap.get(a) ?? a
      const orderB = orderMap.get(b) ?? b
      return orderA - orderB
    })
    if (!showEmptyDays) {
      return result.filter((day) => used.has(day))
    }
    return result
  }, [orderMap, showEmptyDays, sortedEntries])

  const entriesByDay = useMemo(() => {
    const map = new Map<number, WeeklyScheduleEntry[]>()
    for (const day of dayIndices) {
      map.set(day, [])
    }
    for (const entry of sortedEntries) {
      if (!map.has(entry.dayIndex)) {
        map.set(entry.dayIndex, [])
      }
      map.get(entry.dayIndex)!.push(entry)
    }
    return map
  }, [dayIndices, sortedEntries])

  const columnsCount = useMemo(() => Math.max(1, Math.min(dayIndices.length || 1, 6)), [dayIndices.length])

  if (sortedEntries.length === 0) {
    return (
      <Alert color="gray" variant="light" icon={<IconAlertTriangle size={16} />}>
        {emptyStateLabel}
      </Alert>
    )
  }

  const responsiveCols = {
    base: 1,
    sm: Math.max(1, Math.min(columnsCount, 2)),
    md: Math.max(1, Math.min(columnsCount, 3)),
    lg: Math.max(1, Math.min(columnsCount, 4)),
    xl: Math.max(1, Math.min(columnsCount, 6)),
  }

  return (
    <SimpleGrid cols={responsiveCols} spacing="md">
      {dayIndices.map((dayIndex) => {
        const dayEntries = entriesByDay.get(dayIndex) ?? []
        const label = WEEKDAY_LABELS[dayIndex] ?? `Día ${dayIndex}`
        return (
          <Stack key={dayIndex} gap="sm">
            <Group gap="xs" wrap="nowrap">
              <Badge color="indigo" variant="light" size="sm">
                {label}
              </Badge>
              <Text size="sm" c="dimmed">
                {dayEntries.length} bloque{dayEntries.length === 1 ? '' : 's'}
              </Text>
            </Group>
            {dayEntries.length === 0 ? (
              <Alert color="gray" variant="subtle" icon={<IconAlertTriangle size={16} />}>
                {emptyDayLabel}
              </Alert>
            ) : (
              dayEntries.map((entry) => {
                const hasRoom = Boolean(entry.room)
                const hasLocation = Boolean(entry.location)
                const subtitle = entry.subtitle?.trim()
                const note = entry.note?.trim()
                return (
                  <Paper key={entry.id} withBorder radius="md" p="sm">
                    <Stack gap={6}>
                      <Group gap="xs">
                        <IconClockHour4 size={14} color="var(--mantine-color-indigo-6)" />
                        <Text size="sm" fw={600}>
                          {entry.startLabel} – {entry.endLabel}
                        </Text>
                      </Group>
                      <Stack gap={2}>
                        <Text fw={600}>{entry.title}</Text>
                        {subtitle ? (
                          <Text size="xs" c="dimmed">
                            {subtitle}
                          </Text>
                        ) : null}
                      </Stack>
                      {(hasRoom || hasLocation) ? (
                        <Group gap="xs" align="flex-start">
                          {hasRoom ? (
                            <Badge size="sm" color="indigo" variant="outline">{entry.room}</Badge>
                          ) : null}
                          {hasLocation ? (
                            <Group gap={4} wrap="nowrap">
                              <IconMapPin size={12} color="var(--mantine-color-gray-6)" />
                              <Text size="xs" c="dimmed">
                                {entry.location}
                              </Text>
                            </Group>
                          ) : null}
                        </Group>
                      ) : null}
                      {note ? (
                        <Text size="xs" c="dimmed">
                          {note}
                        </Text>
                      ) : null}
                    </Stack>
                  </Paper>
                )
              })
            )}
          </Stack>
        )
      })}
    </SimpleGrid>
  )
}
