import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
	ActionIcon,
	Alert,
	Badge,
	Button,
	Card,
	Group,
	Loader,
	Progress,
	SimpleGrid,
	Stack,
	Table,
	Tabs,
	Text,
	Title,
} from '@mantine/core'
import { useLocation, useNavigate } from 'react-router-dom'
import {
	IconAlertCircle,
	IconCalendarStats,
	IconChalkboard,
	IconClipboardList,
	IconListCheck,
	IconRefresh,
	IconSchool,
	IconUsersGroup,
} from '@tabler/icons-react'

import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import SchedulePlanner from '../components/SchedulePlanner'
import GlobalScheduleOptimizer from '../components/GlobalScheduleOptimizer'
import { CrudSection } from '../admin/CrudSection'
import { crudSections as adminCrudSections } from '../Admin'

type ManagementTabConfig =
	| { key: string; label: string; icon: React.ComponentType<{ size?: number | string }>; type: 'crud'; section: (typeof adminCrudSections)[number] }
	| { key: 'planner' | 'global-optimizer'; label: string; icon: React.ComponentType<{ size?: number | string }>; type: 'planner' | 'optimizer' }

const coordinatorSectionKeys = new Set([
	'programs',
	'subjects',
	'courses',
	'students',
	'teachers',
	'rooms',
	'enrollments',
])

const coordinatorManagementSections = adminCrudSections.filter((section) => coordinatorSectionKeys.has(section.key))

const managementTabs: ManagementTabConfig[] = [
	...coordinatorManagementSections.map((section) => ({ key: section.key, label: section.title, icon: section.icon, type: 'crud' as const, section })),
	{ key: 'planner', label: 'Planificador por programa', icon: IconClipboardList, type: 'planner' },
	{ key: 'global-optimizer', label: 'Optimizador global', icon: IconCalendarStats, type: 'optimizer' },
]

type Program = { id: number; name: string; code: string }
type ProgramSemester = { id: number; program_id: number }
type Subject = { id: number; name: string; code: string }
type Course = {
	id: number
	program_semester_id: number
	subject_id?: number | null
	subject?: { name?: string | null } | null
	term?: string | null
	group?: string | null
	teacher_id?: number | null
}
type Teacher = { id: number }
type Student = { id: number; program_id: number }
type ScheduleSlot = {
	id?: number | null
	course_id: number
	course_name?: string | null
	room_code?: string | null
	day_of_week?: number | null
	start_time?: string | null
	end_time?: string | null
	teacher_name?: string | null
	program_semester_label?: string | null
}

export default function CoordinatorDashboard() {
	const { logout } = useAuth()
	const navigate = useNavigate()
	const location = useLocation()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [programs, setPrograms] = useState<Program[]>([])
	const [programSemesters, setProgramSemesters] = useState<ProgramSemester[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [subjects, setSubjects] = useState<Subject[]>([])
	const [teachers, setTeachers] = useState<Teacher[]>([])
	const [students, setStudents] = useState<Student[]>([])
	const [schedule, setSchedule] = useState<ScheduleSlot[]>([])
	const [managementTab, setManagementTab] = useState<string | null>(managementTabs[0]?.key ?? null)

	const handleManagementTabChange = useCallback((value: string | null) => {
		if (!value) return
		setManagementTab(value)
		const params = new URLSearchParams(location.search)
		params.set('catalog', value)
		navigate({ pathname: location.pathname, search: params.toString(), hash: '#catalogos' }, { replace: true })
	}, [location.pathname, location.search, navigate])

	const handleOperationalTaskNavigation = useCallback((target: string) => {
		if (typeof window === 'undefined') return
		const hashIndex = target.indexOf('#')
		const searchPart = hashIndex === -1 ? target : target.slice(0, hashIndex)
		const hash = hashIndex === -1 ? '' : target.slice(hashIndex)
		const nextSearch = searchPart.startsWith('?') ? searchPart : location.search
		navigate({ pathname: location.pathname, search: nextSearch, hash }, { replace: false })
		if (!hash) return
		const elementId = hash.replace('#', '')
		if (!elementId) return
		const delay = hash.includes('catalogos') ? 260 : 140
		window.setTimeout(() => {
			document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		}, delay)
	}, [location.pathname, location.search, navigate])

	useEffect(() => {
		const params = new URLSearchParams(location.search)
		const requestedTab = params.get('catalog')
		if (requestedTab && requestedTab !== managementTab && managementTabs.some((tab) => tab.key === requestedTab)) {
			setManagementTab(requestedTab)
		}
	}, [location.search, managementTab])

	const loadOverview = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const [programRes, semesterRes, courseRes, teacherRes, studentRes, scheduleRes, subjectRes] = await Promise.all([
				api.get<Program[]>('/programs/'),
				api.get<ProgramSemester[]>('/program-semesters/'),
				api.get<Course[]>('/courses/'),
				api.get<Teacher[]>('/teachers/'),
				api.get<Student[]>('/students/'),
				api.get<ScheduleSlot[]>('/schedule/overview'),
				api.get<Subject[]>('/subjects/'),
			])
			setPrograms(programRes.data)
			setProgramSemesters(semesterRes.data)
			setCourses(courseRes.data)
			setTeachers(teacherRes.data)
			setStudents(studentRes.data)
			setSchedule(scheduleRes.data)
			setSubjects(subjectRes.data)
		} catch (e: any) {
			const detail = e?.response?.data?.detail || e?.message || 'No se pudo cargar el resumen académico'
			setError(detail)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void loadOverview()
	}, [loadOverview])

	const semesterProgramLookup = useMemo(() => {
		const map = new Map<number, number>()
		for (const semester of programSemesters) {
			map.set(semester.id, semester.program_id)
		}
		return map
	}, [programSemesters])

	const scheduledCourseIds = useMemo(() => new Set<number>(schedule.map((slot) => slot.course_id)), [schedule])

	const subjectLookup = useMemo(() => {
		const map = new Map<number, string>()
		for (const subject of subjects) {
			const label = subject.name || subject.code || `Asignatura #${subject.id}`
			map.set(subject.id, label)
		}
		return map
	}, [subjects])

	const unassignedCourses = useMemo(() => {
		if (courses.length === 0) return 0
		return courses.filter((course) => !scheduledCourseIds.has(course.id)).length
	}, [courses, scheduledCourseIds])

	const assignedCourses = courses.length - unassignedCourses
	const coveragePercent = courses.length === 0 ? 0 : Math.round((assignedCourses / courses.length) * 100)

	const programSummary = useMemo(() => {
		const courseCount = new Map<number, number>()
		for (const course of courses) {
			const programId = semesterProgramLookup.get(course.program_semester_id)
			if (!programId) continue
			courseCount.set(programId, (courseCount.get(programId) || 0) + 1)
		}
		const studentCount = new Map<number, number>()
		for (const student of students) {
			studentCount.set(student.program_id, (studentCount.get(student.program_id) || 0) + 1)
		}
		return programs
			.map((program) => ({
				id: program.id,
				name: program.name,
				code: program.code,
				courses: courseCount.get(program.id) || 0,
				students: studentCount.get(program.id) || 0,
			}))
			.sort((a, b) => b.courses - a.courses)
	}, [courses, programs, semesterProgramLookup, students])

	const teachingLoad = useMemo(() => {
		const counts = new Map<string, number>()
		for (const slot of schedule) {
			const teacherName = slot.teacher_name || 'Sin docente asignado'
			counts.set(teacherName, (counts.get(teacherName) || 0) + 1)
		}
		return Array.from(counts.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
	}, [schedule])

	const coursesWithoutTeacher = useMemo(() => courses.filter((course) => !course.teacher_id), [courses])

	const programsMissingSemesters = useMemo(() => {
		if (programs.length === 0) return 0
		const programIdsWithSemesters = new Set(programSemesters.map((semester) => semester.program_id))
		return programs.filter((program) => !programIdsWithSemesters.has(program.id)).length
	}, [programSemesters, programs])

	const coordinatorTasks = useMemo(() => {
		const tasks: { label: string; description: string; count: number; target: string }[] = []
		if (coursesWithoutTeacher.length > 0) {
			tasks.push({
				label: 'Asignar docentes',
				description: 'Cursos sin profesor responsable',
				count: coursesWithoutTeacher.length,
				target: '?catalog=teachers#catalogos',
			})
		}
		if (unassignedCourses > 0) {
			tasks.push({
				label: 'Definir horarios',
				description: 'Cursos planificados sin bloque asignado',
				count: unassignedCourses,
				target: '?catalog=planner#catalogos',
			})
		}
		if (programsMissingSemesters > 0) {
			tasks.push({
				label: 'Completar malla',
				description: 'Programas activos sin semestres definidos',
				count: programsMissingSemesters,
				target: '?catalog=programs#catalogos',
			})
		}
		return tasks
	}, [coursesWithoutTeacher.length, programsMissingSemesters, unassignedCourses])

	const pendingCourses = useMemo(() => {
		const entries: {
			id: number
			label: string
			meta: string | null
			needsTeacher: boolean
			needsSchedule: boolean
			programId: number | null
			semesterId: number | null
		}[] = []
		for (const course of courses) {
			const needsTeacher = !course.teacher_id
			const needsSchedule = !scheduledCourseIds.has(course.id)
			if (!needsTeacher && !needsSchedule) continue
			const subjectName =
				course.subject?.name ||
				(course.subject_id ? subjectLookup.get(course.subject_id) : undefined) ||
				`Curso ${course.id}`
			const metaParts: string[] = []
			if (course.term) metaParts.push(course.term)
			if (course.group) metaParts.push(`Grupo ${course.group}`)
			const programId = semesterProgramLookup.get(course.program_semester_id) ?? null
			const semesterId = course.program_semester_id ?? null
			entries.push({
				id: course.id,
				label: `${subjectName} (ID ${course.id})`,
				meta: metaParts.length ? metaParts.join(' · ') : null,
				needsTeacher,
				needsSchedule,
				programId,
				semesterId,
			})
		}
		return entries.slice(0, 5)
	}, [courses, scheduledCourseIds, semesterProgramLookup, subjectLookup])

	const handlePendingCourseSelect = useCallback((entry: { id: number; programId: number | null; semesterId: number | null }) => {
		const params = new URLSearchParams(location.search)
		params.set('catalog', 'planner')
		if (entry.programId) params.set('plannerProgram', String(entry.programId))
		if (entry.semesterId) params.set('plannerSemester', String(entry.semesterId))
		params.set('highlightCourse', String(entry.id))
		params.set('highlightPulse', String(Date.now()))
		navigate({ pathname: location.pathname, search: params.toString(), hash: '#catalogos' })
		if (typeof window === 'undefined') return
		window.setTimeout(() => {
			document.getElementById('catalogos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		}, 320)
	}, [location.pathname, location.search, navigate])

	const handlePlannerCourseCovered = useCallback(() => {
		void loadOverview()
	}, [loadOverview])

	const summaryCards = useMemo(
		() => [
			{
				label: 'Programas activos',
				value: programs.length,
				description: `${programSummary.filter((item) => item.courses > 0).length} con cursos asignados`,
				icon: IconSchool,
			},
			{
				label: 'Cursos planificados',
				value: courses.length,
				description: `${coveragePercent}% con horario confirmado`,
				icon: IconCalendarStats,
			},
			{
				label: 'Docentes involucrados',
				value: teachers.length,
				description: `${teachingLoad.filter((item) => item.name !== 'Sin docente asignado').length} con carga activa`,
				icon: IconUsersGroup,
			},
			{
				label: 'Estudiantes matriculados',
				value: students.length,
				description: 'Distribuidos por programa académico',
				icon: IconChalkboard,
			},
		],
		[coveragePercent, courses.length, programSummary, programs.length, students.length, teachers.length, teachingLoad]
	)

	return (
		<DashboardLayout
			title="Panel de Coordinación Académica"
			subtitle="Supervisa programas, asignaciones y cobertura horaria"
			actions={
				<Group gap="sm">
					<ActionIcon
						variant="light"
						color="indigo"
						onClick={() => void loadOverview()}
						aria-label="Actualizar resumen"
						disabled={loading}
					>
						{loading ? <Loader size="sm" /> : <IconRefresh size={18} />}
					</ActionIcon>
					<Button variant="filled" color="dark" onClick={() => { logout(); navigate('/app') }}>
						Cerrar sesión
					</Button>
				</Group>
			}
		>
			<Stack gap="xl">
				{error && (
					<Alert icon={<IconAlertCircle size={18} />} color="red" variant="light" title="No se pudo actualizar">
						{error}
					</Alert>
				)}

				<SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
					{summaryCards.map(({ label, value, description, icon: IconComponent }) => (
						<Card key={label} withBorder radius="md" padding="lg">
							<Group justify="space-between" align="flex-start">
								<div>
									<Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
									<Title order={2} mt={8}>{value}</Title>
									<Text size="xs" c="dimmed" mt={6}>{description}</Text>
								</div>
								<IconComponent size={22} color="#1e293b" />
							</Group>
						</Card>
					))}
				</SimpleGrid>

				<Card withBorder radius="md" padding="lg" id="planeacion">
					<Stack gap="md">
						<Group justify="space-between" align="center">
							<div>
								<Title order={4}>Cobertura de horarios</Title>
								<Text size="sm" c="dimmed">
									{assignedCourses} cursos cuentan con bloque horario asignado. {unassignedCourses} pendientes de programación.
								</Text>
							</div>
							<Badge color={coveragePercent === 100 ? 'teal' : 'indigo'} variant="light">
								{coveragePercent}% asignado
							</Badge>
						</Group>
						<Progress value={coveragePercent} color={coveragePercent > 85 ? 'teal' : 'indigo'} radius="xl" size="lg" />
					</Stack>
				</Card>

				<SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
					<Card withBorder radius="md" padding="lg" id="tareas">
						<Group justify="space-between" align="center" mb="md">
							<div>
								<Title order={4}>Alertas operativas</Title>
								<Text size="sm" c="dimmed">Prioriza asignaciones críticas del plan académico</Text>
							</div>
							<Badge color={coordinatorTasks.length ? 'orange' : 'teal'} variant="light">
								{coordinatorTasks.length ? `${coordinatorTasks.length} pendientes` : 'Todo al día'}
							</Badge>
						</Group>
						<Stack gap="sm">
							{coordinatorTasks.length === 0 && (
								<Text size="sm" c="dimmed">No hay alertas activas. Continúa monitoreando la cobertura académica.</Text>
							)}
							{coordinatorTasks.map((task) => (
								<Card key={task.label} withBorder radius="md" padding="sm">
									<Group justify="space-between" align="center">
										<div>
											<Text fw={600}>{task.label}</Text>
											<Text size="xs" c="dimmed">{task.description}</Text>
										</div>
											<Group gap="xs">
												<Badge color="red" variant="light">{task.count}</Badge>
												<Button
													variant="light"
													size="xs"
													onClick={() => handleOperationalTaskNavigation(task.target)}
												>
													Gestionar
												</Button>
											</Group>
									</Group>
								</Card>
							))}
						</Stack>
						{pendingCourses.length > 0 && (
							<Card withBorder radius="md" padding="sm" mt="md">
								<Group gap="xs" mb="sm">
									<IconListCheck size={18} />
									<Text fw={600}>Cursos prioritarios</Text>
								</Group>
								<Table withRowBorders={false} verticalSpacing="xs">
									<Table.Tbody>
										{pendingCourses.map((course) => (
											<Table.Tr
												key={course.id}
												onClick={() => handlePendingCourseSelect(course)}
												style={{ cursor: 'pointer' }}
											>
												<Table.Td>
													<Text fw={500}>{course.label}</Text>
													{course.meta && (
														<Text size="xs" c="dimmed">{course.meta}</Text>
													)}
													<Group gap="xs">
														{course.needsTeacher && <Badge color="yellow" variant="light">Sin docente</Badge>}
														{course.needsSchedule && <Badge color="indigo" variant="light">Sin horario</Badge>}
													</Group>
												</Table.Td>
											</Table.Tr>
										))}
									</Table.Tbody>
								</Table>
							</Card>
						)}
					</Card>

					<Card withBorder radius="md" padding="lg" id="docentes">
						<Group justify="space-between" align="center" mb="md">
							<div>
								<Title order={4}>Distribución de carga docente</Title>
								<Text size="sm" c="dimmed">Top de profesores según número de bloques</Text>
							</div>
							<IconClipboardList size={20} color="#1f2937" />
						</Group>
						<Stack gap="sm">
							{teachingLoad.slice(0, 5).map(({ name, count }) => (
								<Card key={name} withBorder radius="md" padding="sm">
									<Group justify="space-between">
										<Text fw={500}>{name}</Text>
										<Badge color="teal" variant="light">{count} bloques</Badge>
									</Group>
								</Card>
							))}
							{teachingLoad.length === 0 && (
								<Text size="sm" c="dimmed">Todavía no hay clases asignadas a docentes.</Text>
							)}
						</Stack>
					</Card>
				</SimpleGrid>

				<Card withBorder radius="md" padding="lg" id="programas">
					<Group justify="space-between" align="center" mb="md">
						<div>
							<Title order={4}>Programas prioritarios</Title>
							<Text size="sm" c="dimmed">Revisa la relación cursos vs. matrícula por programa</Text>
						</div>
						<Badge color="indigo" variant="light">{programs.length} programas</Badge>
					</Group>
					<SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
						{programSummary.slice(0, 6).map((program) => (
							<Card key={program.id} withBorder radius="md" padding="md">
								<Stack gap={4}>
									<Group justify="space-between">
										<Text fw={600}>{program.name}</Text>
										<Badge color="gray" variant="light">{program.code}</Badge>
									</Group>
									<Group justify="space-between" align="center">
										<Text size="sm" c="dimmed">Cursos asignados</Text>
										<Badge color={program.courses > 0 ? 'teal' : 'orange'} variant="light">{program.courses}</Badge>
									</Group>
									<Group justify="space-between" align="center">
										<Text size="sm" c="dimmed">Estudiantes</Text>
										<Badge color="indigo" variant="light">{program.students}</Badge>
									</Group>
								</Stack>
							</Card>
						))}
						{programSummary.length === 0 && (
							<Card withBorder radius="md" padding="md">
								<Text size="sm" c="dimmed">Sin programas registrados aún.</Text>
							</Card>
						)}
					</SimpleGrid>
				</Card>

				{managementTabs.length > 0 && (
					<Card withBorder radius="md" padding="lg" id="catalogos">
						<Stack gap="md">
							<Group justify="space-between" align="flex-start">
								<div>
									<Title order={4}>Gestión operativa</Title>
									<Text size="sm" c="dimmed">Administra catálogos, planificadores y herramientas del coordinador en un solo lugar</Text>
								</div>
								<Badge color="dark" variant="light">Catálogos conectados</Badge>
							</Group>
							<Tabs
								value={managementTab ?? undefined}
								onChange={handleManagementTabChange}
								variant="outline"
								keepMounted={false}
							>
								<Tabs.List style={{ flexWrap: 'wrap', gap: 8 }}>
									{managementTabs.map((tab) => {
										const IconComponent = tab.icon
										return (
											<Tabs.Tab key={tab.key} value={tab.key} leftSection={<IconComponent size={16} />}>
												{tab.label}
											</Tabs.Tab>
										)
									})}
								</Tabs.List>
								{managementTabs.map((tab) => (
									<Tabs.Panel key={tab.key} value={tab.key} pt="md">
										{managementTab === tab.key && tab.type === 'crud' && <CrudSection section={tab.section} />}
										{managementTab === tab.key && tab.type === 'planner' && (
											<SchedulePlanner onCourseFullyScheduled={handlePlannerCourseCovered} />
										)}
										{managementTab === tab.key && tab.type === 'optimizer' && <GlobalScheduleOptimizer />}
									</Tabs.Panel>
								))}
							</Tabs>
						</Stack>
					</Card>
				)}

			</Stack>
		</DashboardLayout>
	)
}

