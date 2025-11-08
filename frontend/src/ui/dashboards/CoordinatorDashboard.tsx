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
	Text,
	Title,
} from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import {
	IconAlertCircle,
	IconCalendarStats,
	IconChalkboard,
	IconClipboardList,
	IconRefresh,
	IconSchool,
	IconUsersGroup,
} from '@tabler/icons-react'

import DashboardLayout from './DashboardLayout'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'

type Program = { id: number; name: string; code: string }
type ProgramSemester = { id: number; program_id: number }
type Course = { id: number; program_semester_id: number; term?: string | null; group?: string | null }
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

const dayLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export default function CoordinatorDashboard() {
	const { logout } = useAuth()
	const navigate = useNavigate()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [programs, setPrograms] = useState<Program[]>([])
	const [programSemesters, setProgramSemesters] = useState<ProgramSemester[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [teachers, setTeachers] = useState<Teacher[]>([])
	const [students, setStudents] = useState<Student[]>([])
	const [schedule, setSchedule] = useState<ScheduleSlot[]>([])

	const loadOverview = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const [programRes, semesterRes, courseRes, teacherRes, studentRes, scheduleRes] = await Promise.all([
				api.get<Program[]>('/programs/'),
				api.get<ProgramSemester[]>('/program-semesters/'),
				api.get<Course[]>('/courses/'),
				api.get<Teacher[]>('/teachers/'),
				api.get<Student[]>('/students/'),
				api.get<ScheduleSlot[]>('/schedule/overview'),
			])
			setPrograms(programRes.data)
			setProgramSemesters(semesterRes.data)
			setCourses(courseRes.data)
			setTeachers(teacherRes.data)
			setStudents(studentRes.data)
			setSchedule(scheduleRes.data)
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

	const unassignedCourses = useMemo(() => {
		if (courses.length === 0) return 0
		const scheduledIds = new Set<number>(schedule.map((slot) => slot.course_id))
		return courses.filter((course) => !scheduledIds.has(course.id)).length
	}, [courses, schedule])

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

	const schedulePreview = useMemo(() => {
		const items = [...schedule]
		items.sort((a, b) => {
			const dayA = typeof a.day_of_week === 'number' ? a.day_of_week : 7
			const dayB = typeof b.day_of_week === 'number' ? b.day_of_week : 7
			if (dayA !== dayB) return dayA - dayB
			const timeA = a.start_time ? Number(a.start_time.replace(':', '')) : 0
			const timeB = b.start_time ? Number(b.start_time.replace(':', '')) : 0
			return timeA - timeB
		})
		return items.slice(0, 6)
	}, [schedule])

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

				<SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" id="horarios">
					<Card withBorder radius="md" padding="lg">
						<Group justify="space-between" align="center" mb="md">
							<div>
								<Title order={4}>Bloques más próximos</Title>
								<Text size="sm" c="dimmed">Vista rápida de las sesiones programadas</Text>
							</div>
							<Badge color="dark" variant="light">{schedule.length} bloques</Badge>
						</Group>
						{loading && schedule.length === 0 ? (
							<Group justify="center" py="lg">
								<Loader color="dark" />
							</Group>
						) : (
							<Table highlightOnHover withTableBorder>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>Día</Table.Th>
										<Table.Th>Horario</Table.Th>
										<Table.Th>Curso</Table.Th>
										<Table.Th>Docente</Table.Th>
										<Table.Th>Aula</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{schedulePreview.map((slot) => {
										const dayIndex = typeof slot.day_of_week === 'number' ? slot.day_of_week : null
										const dayLabel = dayIndex !== null ? (dayLabels[dayIndex] || `Día ${dayIndex + 1}`) : 'Sin día'
										return (
											<Table.Tr key={`${slot.course_id}-${slot.start_time}-${slot.room_code}`}>
												<Table.Td>
													<Badge color="indigo" variant="light">{dayLabel}</Badge>
												</Table.Td>
												<Table.Td>{slot.start_time} - {slot.end_time}</Table.Td>
												<Table.Td>
													<Stack gap={2}>
														<Text fw={500}>{slot.course_name || `Curso ${slot.course_id}`}</Text>
														{slot.program_semester_label && <Text size="xs" c="dimmed">{slot.program_semester_label}</Text>}
													</Stack>
												</Table.Td>
												<Table.Td>{slot.teacher_name || 'Sin docente'}</Table.Td>
												<Table.Td>{slot.room_code || 'Por asignar'}</Table.Td>
											</Table.Tr>
										)
									})}
									{schedulePreview.length === 0 && (
										<Table.Tr>
											<Table.Td colSpan={5}>
												<Text size="sm" c="dimmed" ta="center">Aún no hay bloques programados para mostrar.</Text>
											</Table.Td>
										</Table.Tr>
									)}
								</Table.Tbody>
							</Table>
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
			</Stack>
		</DashboardLayout>
	)
}

