import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { MantineProvider, createTheme, MantineThemeOverride, type CSSVariablesResolver, Center, Loader, Stack, Text, MantineColorsTuple } from '@mantine/core'
import '@mantine/core/styles.css'
import '@fontsource-variable/inter'
import './styles/landing.css'
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
import StudentLearningPage from './ui/learning/StudentLearningPage'
import TeacherLearningPage from './ui/learning/TeacherLearningPage'
import LearningOversightPage from './ui/learning/LearningOversightPage'
import { useThemePalette } from './lib/settings'
import { buildBrandScale } from './lib/theme'
import LandingRoute from './ui/routes/LandingRoute'

const baseColors: Record<string, MantineColorsTuple> = {
	indigo: ['#eef2ff','#e0e7ff','#c7d2fe','#a5b4fc','#818cf8','#6366f1','#4f46e5','#4338ca','#3730a3','#312e81'] as MantineColorsTuple,
	gray: ['#f8fafc','#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a'] as MantineColorsTuple,
	blue:  ['#eff6ff','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e40af','#1e3a8a'] as MantineColorsTuple,
	teal:  ['#f0fdfa','#ccfbf1','#99f6e4','#5eead4','#2dd4bf','#14b8a6','#0d9488','#0f766e','#115e59','#134e4a'] as MantineColorsTuple,
}

function ThemedProvider({ children }: { children: React.ReactNode }) {
	const palette = useThemePalette()
	const brandScale = useMemo(
		() => buildBrandScale(palette.light.primary, palette.dark.primary),
		[palette.dark.primary, palette.light.primary],
	)
	const theme = useMemo(() => createTheme({
		primaryColor: 'brand',
		colors: {
			brand: brandScale as MantineColorsTuple,
			...baseColors,
		},
		primaryShade: { light: 5, dark: 7 },
		fontFamily: 'Inter Variable, Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
		defaultRadius: 'md',
		components: {
			Button: {
				defaultProps: { radius: 'md' },
			},
			Paper: {
				styles: (currentTheme: any) => ({ root: { backgroundColor: currentTheme.colorScheme === 'dark' ? currentTheme.colors.gray[8] : undefined } }),
			},
		},
	}) as MantineThemeOverride, [brandScale])

	const cssVariablesResolver = useMemo<CSSVariablesResolver>(() => () => ({
		variables: {
			'--app-accent-color': palette.light.accent,
		},
		light: {
			'--mantine-color-body': palette.light.surface,
			'--app-surface-color': palette.light.surface,
			'--app-primary-color': palette.light.primary,
			'--app-accent-color': palette.light.accent,
		},
		dark: {
			'--mantine-color-body': palette.dark.surface,
			'--app-surface-color': palette.dark.surface,
			'--app-primary-color': palette.dark.primary,
			'--app-accent-color': palette.dark.accent,
		},
	}), [palette.dark.accent, palette.dark.primary, palette.dark.surface, palette.light.accent, palette.light.primary, palette.light.surface])

	return (
		<MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="light">
			{children}
		</MantineProvider>
	)
}

const router = createBrowserRouter([
	{ path: '/', element: <LandingRoute /> },
	{ path: '/app', element: <App /> },
	{ path: '/dashboard/admin', element: <AdminDashboard /> },
	{ path: '/dashboard/admin/settings', element: <AdminSettingsDashboard /> },
	{ path: '/dashboard/admin/programs/:programId', element: <ProgramDetailPage /> },
	{ path: '/dashboard/admin/teachers/:teacherId', element: <TeacherDetailPage /> },
	{ path: '/dashboard/admin/students/:studentId', element: <StudentDetailPage /> },
	{ path: '/dashboard/admin/learning', element: <LearningOversightPage role="admin" /> },
	{ path: '/dashboard/coordinator', element: <CoordinatorDashboard /> },
	{ path: '/dashboard/coordinator/learning', element: <LearningOversightPage role="coordinator" /> },
	{ path: '/dashboard/teacher', element: <TeacherDashboard /> },
	{ path: '/dashboard/teacher/learning', element: <TeacherLearningPage /> },
	{ path: '/dashboard/student', element: <StudentDashboard /> },
	{ path: '/dashboard/student/learning', element: <StudentLearningPage /> },
	{ path: '/dashboard/student/matricula', element: <StudentMatriculationDashboard /> },
	{ path: '/dashboard/student/planificador', element: <StudentSchedulePlannerDashboard /> },
	{ path: '/dashboard/student/horario', element: <StudentScheduleDashboard /> },
])

const root = createRoot(document.getElementById('root')!)
root.render(
	<React.StrictMode>
		<ThemedProvider>
			<RouterProvider router={router} />
		</ThemedProvider>
	</React.StrictMode>
)
