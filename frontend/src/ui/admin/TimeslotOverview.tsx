import React, { useMemo } from 'react'
import { Card, Stack, Group, Text, Title, Badge, SimpleGrid, Paper, Tooltip, ActionIcon } from '@mantine/core'
import { IconDatabase, IconTrash } from '@tabler/icons-react'
import type { TimeslotRecord } from './types'
import { WEEKDAY_LABELS } from './constants'
import { normalizeTimeString, parseTimeString } from './utils'

type TimeslotOverviewProps = {
  slots: TimeslotRecord[]
  onDelete: (id: number) => Promise<void> | void
}

export function TimeslotOverview({ slots, onDelete }: TimeslotOverviewProps) {
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
