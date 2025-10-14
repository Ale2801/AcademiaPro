import React, { useMemo } from 'react'
import { Badge, Card, Divider, Group, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { IconClockHour3, IconMapPin } from '@tabler/icons-react'

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
  teacher_name?: string | null
  timeslot_id?: number | null
  program_semester_id?: number | null
}

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'Horario por definir'
  return [start, end].filter(Boolean).join(' - ')
}

export function ScheduleTimeline({ entries, title }: { entries: ScheduleEntry[]; title?: string }) {
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

  const dayOrder = useMemo(() => Array.from(grouped.keys()).sort((a, b) => a - b), [grouped])

  if (entries.length === 0) {
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
            const dayEntries = grouped.get(dayIndex) ?? []
            const label = dayIndex >= 0 ? DAY_LABELS[dayIndex] : 'Sin día asignado'
            return (
              <Card key={label} withBorder radius="lg" padding="lg" style={{ minWidth: 240 }}>
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Title order={4}>{label}</Title>
                    <Badge color="blue" variant="light">{dayEntries.length}</Badge>
                  </Group>
                  <Divider my="xs" />
                  <Stack gap="sm">
                    {dayEntries.map((slot) => (
                      <Card key={`${slot.course_id}-${slot.timeslot_id}-${slot.room_code ?? 'room'}`} radius="md" withBorder padding="sm">
                        <Stack gap={4}>
                          <Text fw={600}>{slot.course_name ?? `Curso #${slot.course_id}`}</Text>
                          {slot.teacher_name && <Text size="xs" c="dimmed">{slot.teacher_name}</Text>}
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
                    ))}
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
