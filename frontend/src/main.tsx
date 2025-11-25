import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { MantineProvider, createTheme, MantineThemeOverride } from '@mantine/core'
import '@mantine/core/styles.css'
import '@fontsource-variable/inter'
import './styles/landing.css'
import Landing from './ui/Landing'
import { App } from './ui/App'
import AdminDashboard from './ui/dashboards/AdminDashboard'
import AdminSettingsDashboard from './ui/dashboards/AdminSettingsDashboard'
import CoordinatorDashboard from './ui/dashboards/CoordinatorDashboard'
import TeacherDashboard from './ui/dashboards/TeacherDashboard'
import StudentDashboard from './ui/dashboards/StudentDashboard'
import StudentMatriculationDashboard from './ui/dashboards/StudentMatriculationDashboard'
import StudentSchedulePlannerDashboard from './ui/dashboards/StudentSchedulePlannerDashboard'
import StudentScheduleDashboard from './ui/dashboards/StudentScheduleDashboard'
import ProgramDetailPage from './ui/programs/ProgramDetailPage'
import TeacherDetailPage from './ui/teachers/TeacherDetailPage'
import StudentDetailPage from './ui/students/StudentDetailPage'

const theme = createTheme({
	primaryColor: 'indigo',
		colors: {
			indigo: ['#eef2ff','#e0e7ff','#c7d2fe','#a5b4fc','#818cf8','#6366f1','#4f46e5','#4338ca','#3730a3','#312e81'],
			gray: ['#f8fafc','#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a'],
			blue:  ['#eff6ff','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e40af','#1e3a8a'],
			teal:  ['#f0fdfa','#ccfbf1','#99f6e4','#5eead4','#2dd4bf','#14b8a6','#0d9488','#0f766e','#115e59','#134e4a'],
		},
	primaryShade: { light: 6, dark: 4 },
	fontFamily: 'Inter Variable, Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
	defaultRadius: 'md',
	components: {
			Button: {
				defaultProps: { radius: 'md' },
			},
			Paper: {
				styles: (theme: any) => ({ root: { backgroundColor: theme.colorScheme === 'dark' ? theme.colors.gray[8] : undefined } }),
		},
	},
} as MantineThemeOverride)

const router = createBrowserRouter([
	{ path: '/', element: <Landing /> },
	{ path: '/app', element: <App /> },
	{ path: '/dashboard/admin', element: <AdminDashboard /> },
	{ path: '/dashboard/admin/settings', element: <AdminSettingsDashboard /> },
	{ path: '/dashboard/admin/programs/:programId', element: <ProgramDetailPage /> },
	{ path: '/dashboard/admin/teachers/:teacherId', element: <TeacherDetailPage /> },
	{ path: '/dashboard/admin/students/:studentId', element: <StudentDetailPage /> },
	{ path: '/dashboard/coordinator', element: <CoordinatorDashboard /> },
	{ path: '/dashboard/teacher', element: <TeacherDashboard /> },
	{ path: '/dashboard/student', element: <StudentDashboard /> },
	{ path: '/dashboard/student/matricula', element: <StudentMatriculationDashboard /> },
	{ path: '/dashboard/student/planificador', element: <StudentSchedulePlannerDashboard /> },
	{ path: '/dashboard/student/horario', element: <StudentScheduleDashboard /> },
])

const root = createRoot(document.getElementById('root')!)
root.render(
		<React.StrictMode>
			<MantineProvider theme={theme} defaultColorScheme="light">
				<RouterProvider router={router} />
			</MantineProvider>
		</React.StrictMode>
)
