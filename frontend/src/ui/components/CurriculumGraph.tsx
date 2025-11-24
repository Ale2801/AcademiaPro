import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Text,
} from '@mantine/core'
import { IconAlertCircle, IconHierarchy3, IconTopologyStar3 } from '@tabler/icons-react'
import { api } from '../../lib/api'

const COLUMN_WIDTH = 220
const COLUMN_GAP = 32
const NODE_HEIGHT = 96
const NODE_GAP = 18
const GRAPH_PADDING_X = 32
const GRAPH_PADDING_Y = 32

type Program = {
  id: number
  name?: string | null
  code?: string | null
}

type ProgramSemester = {
  id: number
  program_id: number
  semester_number?: number | null
  label?: string | null
}

type Course = {
  id: number
  program_semester_id?: number | null
  subject_id?: number | null
}

type Subject = {
  id?: number
  name?: string | null
  code?: string | null
  level?: string | null
  prerequisite_subject_ids?: number[] | null
}

type PositionedNode = {
  subject: Subject
  subjectId: number
  columnIndex: number
  rowIndex: number
}

type Edge = {
  key: string
  fromId: number
  toId: number
}

type NodeCenter = {
  cx: number
  cy: number
}

export function CurriculumGraph() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [semesters, setSemesters] = useState<ProgramSemester[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)
  const [hoveredSubjectId, setHoveredSubjectId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Map<number, HTMLDivElement | null>>(new Map())
  const [nodeCenters, setNodeCenters] = useState<Map<number, NodeCenter>>(new Map())
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })

  useEffect(() => {
    let isMounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [programsRes, semestersRes, coursesRes, subjectsRes] = await Promise.all([
          api.get('/programs/'),
          api.get('/program-semesters/'),
          api.get('/courses/'),
          api.get('/subjects/'),
        ])
        if (!isMounted) return
        const programList = Array.isArray(programsRes.data) ? (programsRes.data as Program[]) : []
        setPrograms(programList)
        setSemesters(Array.isArray(semestersRes.data) ? (semestersRes.data as ProgramSemester[]) : [])
        setCourses(Array.isArray(coursesRes.data) ? (coursesRes.data as Course[]) : [])
        setSubjects(Array.isArray(subjectsRes.data) ? (subjectsRes.data as Subject[]) : [])
      } catch (err: any) {
        if (isMounted) {
          const detail = err?.response?.data?.detail || err?.message || 'No se pudo cargar la malla académica'
          setError(detail)
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    void load()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (selectedProgramId || programs.length === 0) return
    setSelectedProgramId(programs[0].id)
  }, [programs, selectedProgramId])

  const subjectMap = useMemo(() => {
    const map = new Map<number, Subject>()
    subjects.forEach((subject) => {
      if (typeof subject.id === 'number') {
        map.set(subject.id, subject)
      }
    })
    return map
  }, [subjects])

  const dependentsMap = useMemo(() => {
    const map = new Map<number, Set<number>>()
    subjects.forEach((subject) => {
      if (typeof subject.id !== 'number') return
      const prereqs = subject.prerequisite_subject_ids ?? []
      prereqs.forEach((prereqId) => {
        if (!map.has(prereqId)) map.set(prereqId, new Set<number>())
        map.get(prereqId)!.add(subject.id as number)
      })
    })
    return map
  }, [subjects])

  const programOptions = useMemo(
    () =>
      programs.map((program) => ({
        value: String(program.id),
        label: program.name ? `${program.name}${program.code ? ` · ${program.code}` : ''}` : `Programa #${program.id}`,
      })),
    [programs],
  )

  const selectedProgram = useMemo(() => {
    if (!selectedProgramId) return null
    return programs.find((program) => program.id === selectedProgramId) ?? null
  }, [programs, selectedProgramId])

  const programSemesters = useMemo(() => {
    if (!selectedProgramId) return []
    return semesters
      .filter((semester) => semester.program_id === selectedProgramId)
      .sort((a, b) => (Number(a.semester_number) || 0) - (Number(b.semester_number) || 0))
  }, [selectedProgramId, semesters])

  const coursesBySemester = useMemo(() => {
    const map = new Map<number, Set<number>>()
    courses.forEach((course) => {
      const semesterId = course.program_semester_id
      const subjectId = course.subject_id
      if (!semesterId || !subjectId) return
      if (!map.has(semesterId)) map.set(semesterId, new Set<number>())
      map.get(semesterId)!.add(subjectId)
    })
    return map
  }, [courses])

  const semesterSubjects = useMemo(() => {
    const map = new Map<number, Subject[]>()
    programSemesters.forEach((semester) => {
      const subjectIds = Array.from(coursesBySemester.get(semester.id) ?? new Set<number>())
      const items = subjectIds
        .map((subjectId) => subjectMap.get(subjectId))
        .filter((subject): subject is Subject => Boolean(subject))
        .sort((a, b) => (a?.name || a?.code || '').localeCompare(b?.name || b?.code || ''))
      map.set(semester.id, items)
    })
    return map
  }, [coursesBySemester, programSemesters, subjectMap])

  const layout = useMemo(() => {
    const nodes: PositionedNode[] = []
    programSemesters.forEach((semester, columnIndex) => {
      const list = semesterSubjects.get(semester.id) ?? []
      list.forEach((subject, rowIndex) => {
        if (typeof subject.id !== 'number') return
        const node: PositionedNode = {
          subject,
          subjectId: subject.id,
          columnIndex,
          rowIndex,
        }
        nodes.push(node)
      })
    })
    return { nodes }
  }, [programSemesters, semesterSubjects])

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = []
    layout.nodes.forEach((node) => {
      const prereqs = node.subject.prerequisite_subject_ids ?? []
      prereqs.forEach((prereqId) => {
        result.push({
          key: `${prereqId}->${node.subjectId}`,
          fromId: prereqId,
          toId: node.subjectId,
        })
      })
    })
    return result
  }, [layout])

  const highlightedPrereqSet = useMemo(() => {
    if (!hoveredSubjectId) return new Set<number>()
    const subject = subjectMap.get(hoveredSubjectId)
    return new Set(subject?.prerequisite_subject_ids ?? [])
  }, [hoveredSubjectId, subjectMap])

  const highlightedDependentSet = useMemo(() => {
    if (!hoveredSubjectId) return new Set<number>()
    return new Set(dependentsMap.get(hoveredSubjectId) ?? [])
  }, [dependentsMap, hoveredSubjectId])

  const visibleEdges = useMemo(() => {
    if (!hoveredSubjectId) return []
    return edges.filter((edge) => edge.toId === hoveredSubjectId || edge.fromId === hoveredSubjectId)
  }, [edges, hoveredSubjectId])

  const maxRows = useMemo(() => {
    if (programSemesters.length === 0) return 0
    return Math.max(...programSemesters.map((semester) => semesterSubjects.get(semester.id)?.length ?? 0))
  }, [programSemesters, semesterSubjects])

  const graphWidth =
    programSemesters.length === 0
      ? 0
      : programSemesters.length * COLUMN_WIDTH + (programSemesters.length - 1) * COLUMN_GAP + GRAPH_PADDING_X * 2

  const graphHeight =
    maxRows === 0
      ? 0
      : maxRows * (NODE_HEIGHT + NODE_GAP) - NODE_GAP + GRAPH_PADDING_Y * 2

  const totalSubjectsInGraph = layout.nodes.length

  const registerNodeRef = useCallback((subjectId: number) => {
    return (el: HTMLDivElement | null) => {
      if (!subjectId) return
      if (el) {
        nodeRefs.current.set(subjectId, el)
      } else {
        nodeRefs.current.delete(subjectId)
      }
    }
  }, [])

  const measureNodes = useCallback(() => {
    const containerEl = containerRef.current
    if (!containerEl) return
    const containerRect = containerEl.getBoundingClientRect()
    const nextCenters = new Map<number, NodeCenter>()
    nodeRefs.current.forEach((nodeEl, subjectId) => {
      if (!nodeEl) return
      const rect = nodeEl.getBoundingClientRect()
      nextCenters.set(subjectId, {
        cx: rect.left - containerRect.left + rect.width / 2,
        cy: rect.top - containerRect.top + rect.height / 2,
      })
    })
    setNodeCenters(nextCenters)
    setContainerSize({
      width: Math.max(containerEl.scrollWidth, graphWidth),
      height: Math.max(containerEl.scrollHeight, graphHeight),
    })
  }, [graphHeight, graphWidth])

  useLayoutEffect(() => {
    measureNodes()
  }, [measureNodes, layout.nodes.length, programSemesters.length, selectedProgramId])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => measureNodes()
    let resizeObserver: ResizeObserver | null = null
    if ('ResizeObserver' in window && containerRef.current) {
      resizeObserver = new ResizeObserver(() => measureNodes())
      resizeObserver.observe(containerRef.current)
    } else {
      window.addEventListener('resize', handleResize)
    }
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      } else {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [measureNodes])

  const getNodeState = (subjectId?: number) => {
    if (!subjectId) return 'default'
    if (hoveredSubjectId === subjectId) return 'active'
    if (highlightedPrereqSet.has(subjectId)) return 'prerequisite'
    if (highlightedDependentSet.has(subjectId)) return 'dependent'
    if (hoveredSubjectId !== null) return 'muted'
    return 'default'
  }

  const legendItems = [
    { label: 'Curso seleccionado', color: 'var(--mantine-color-indigo-5)' },
    { label: 'Prerrequisito', color: 'var(--mantine-color-teal-5)' },
    { label: 'Dependiente', color: 'var(--mantine-color-orange-5)' },
    { label: 'Sin relación', color: 'var(--mantine-color-gray-5)' },
  ]

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
        <Stack gap={4} style={{ maxWidth: 520 }}>
          <Text size="xs" tt="uppercase" fw={600} c="dimmed">
            Visualizador de malla
          </Text>
          <Text fw={600} size="lg">
            Dependencias académicas por semestre
          </Text>
          <Text size="sm" c="dimmed">
            Explora los cursos del programa y resalta automáticamente los prerrequisitos al pasar el cursor sobre cada nodo.
          </Text>
          {selectedProgram ? (
            <Group gap="xs">
              <Badge variant="light" color="gray">
                Total de cursos: {totalSubjectsInGraph}
              </Badge>
              {maxRows > 0 ? (
                <Badge variant="light" color="indigo">
                  Semestres activos: {programSemesters.length}
                </Badge>
              ) : null}
            </Group>
          ) : null}
        </Stack>
        <Select
          label="Programa"
          placeholder="Selecciona un programa"
          data={programOptions}
          value={selectedProgramId ? String(selectedProgramId) : null}
          onChange={(value) => setSelectedProgramId(value ? Number(value) : null)}
          searchable
          nothingFoundMessage="Sin resultados"
          style={{ minWidth: 260 }}
        />
      </Group>

      <Group gap="md">
        {legendItems.map((item) => (
          <Group key={item.label} gap={8} align="center">
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: item.color,
                display: 'inline-block',
              }}
            />
            <Text size="sm" c="dimmed">
              {item.label}
            </Text>
          </Group>
        ))}
      </Group>

      {loading ? (
        <Center py="xl">
          <Loader color="indigo" />
        </Center>
      ) : error ? (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      ) : !selectedProgramId ? (
        <Alert icon={<IconHierarchy3 size={16} />} color="gray" variant="light">
          Selecciona un programa para visualizar su malla.
        </Alert>
      ) : programSemesters.length === 0 ? (
        <Alert icon={<IconAlertCircle size={16} />} color="gray" variant="light">
          Este programa aún no tiene semestres configurados.
        </Alert>
      ) : (
        <Card withBorder radius="lg" padding="md" style={{ background: 'rgba(15, 23, 42, 0.85)' }}>
          <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
            <div
              ref={containerRef}
              style={{
                position: 'relative',
                minHeight: graphHeight || 240,
                minWidth: graphWidth || 320,
              }}
            >
              {visibleEdges.length > 0 && (containerSize.width || graphWidth) > 0 && (containerSize.height || graphHeight) > 0 && (
                <svg
                  width={containerSize.width || graphWidth}
                  height={containerSize.height || graphHeight}
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                >
                  {visibleEdges.map((edge) => {
                    const fromCenter = nodeCenters.get(edge.fromId)
                    const toCenter = nodeCenters.get(edge.toId)
                    if (!fromCenter || !toCenter) return null
                    const isIncoming = edge.toId === hoveredSubjectId
                    const strokeColor = isIncoming ? 'var(--mantine-color-teal-5)' : 'var(--mantine-color-orange-5)'
                    return (
                      <line
                        key={edge.key}
                        x1={fromCenter.cx}
                        y1={fromCenter.cy}
                        x2={toCenter.cx}
                        y2={toCenter.cy}
                        stroke={strokeColor}
                        strokeWidth={3}
                      />
                    )
                  })}
                </svg>
              )}

              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  gap: COLUMN_GAP,
                  width: graphWidth || undefined,
                  padding: `${GRAPH_PADDING_Y}px ${GRAPH_PADDING_X}px`,
                }}
              >
                {programSemesters.map((semester, columnIndex) => {
                  const list = semesterSubjects.get(semester.id) ?? []
                  const semesterLabel =
                    semester.label || (typeof semester.semester_number === 'number' ? `Semestre ${semester.semester_number}` : `Semestre ${columnIndex + 1}`)
                  return (
                    <Stack key={semester.id} gap="sm" style={{ width: COLUMN_WIDTH }}>
                      <Group gap="xs" align="center">
                        <IconTopologyStar3 size={16} color="#94a3b8" />
                        <Stack gap={0}>
                          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                            {semesterLabel}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {list.length} curso{list.length === 1 ? '' : 's'}
                          </Text>
                        </Stack>
                      </Group>
                      <Stack gap="sm">
                        {list.length === 0 ? (
                          <Card withBorder padding="sm" radius="md" style={{ color: 'white', background: 'rgba(255,255,255,0.05)' }}>
                            <Text size="sm" c="dimmed">
                              Sin cursos planificados
                            </Text>
                          </Card>
                        ) : (
                          list.map((subject) => {
                            const nodeState = getNodeState(subject.id)
                            const prereqCount = subject.prerequisite_subject_ids?.length ?? 0
                            const borderColor =
                              nodeState === 'active'
                                ? 'var(--mantine-color-indigo-5)'
                                : nodeState === 'prerequisite'
                                  ? 'var(--mantine-color-teal-5)'
                                  : nodeState === 'dependent'
                                    ? 'var(--mantine-color-orange-5)'
                                    : 'rgba(148, 163, 184, 0.3)'
                            const background =
                              nodeState === 'active'
                                ? 'rgba(99, 102, 241, 0.12)'
                                : nodeState === 'prerequisite'
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : nodeState === 'dependent'
                                    ? 'rgba(249, 115, 22, 0.12)'
                                    : 'rgba(15, 23, 42, 0.6)'
                            const opacity = nodeState === 'muted' ? 0.35 : 1
                            return (
                              <div key={subject.id} style={{ height: NODE_HEIGHT, display: 'flex' }} ref={typeof subject.id === 'number' ? registerNodeRef(subject.id) : undefined}>
                                <Card
                                  withBorder
                                  padding="sm"
                                  radius="md"
                                  data-node-state={nodeState}
                                  onMouseEnter={() => setHoveredSubjectId(subject.id ?? null)}
                                  onMouseLeave={() => setHoveredSubjectId((prev) => (prev === subject.id ? null : prev))}
                                  style={{
                                    borderColor,
                                    background,
                                    color: 'white',
                                    transition: 'all 120ms ease',
                                    opacity,
                                    cursor: 'pointer',
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Stack gap={4}>
                                    <Text fw={600} size="sm" style={{ lineHeight: 1.3 }}>
                                      {subject.name || subject.code || `Curso #${subject.id}`}
                                    </Text>
                                    {subject.code && subject.name ? (
                                      <Text size="xs" c="dimmed">
                                        {subject.code}
                                      </Text>
                                    ) : null}
                                    <Group gap="xs" wrap="wrap">
                                      {prereqCount > 0 ? (
                                        <Badge size="xs" color="grape" variant="light">
                                          {prereqCount} prerrequisito{prereqCount === 1 ? '' : 's'}
                                        </Badge>
                                      ) : (
                                        <Badge size="xs" variant="outline" color="gray">
                                          Sin prerrequisitos
                                        </Badge>
                                      )}
                                    </Group>
                                  </Stack>
                                </Card>
                              </div>
                            )
                          })
                        )}
                      </Stack>
                    </Stack>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>
      )}
    </Stack>
  )
}

export default CurriculumGraph
