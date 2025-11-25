/// <reference types="vitest/globals" />
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import CoordinatorDashboard from './CoordinatorDashboard'

const apiModule = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: apiModule.get,
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    defaults: { headers: { common: {} } },
  },
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    token: 'test-token',
    mustChangePassword: false,
    changePassword: vi.fn(),
  }),
}))

vi.mock('../components/SchedulePlanner', () => ({
  default: () => <div data-testid="planner" />,
}))

vi.mock('../components/GlobalScheduleOptimizer', () => ({
  default: () => <div data-testid="global-planner" />,
}))

vi.mock('../admin/CrudSection', () => ({
  CrudSection: ({ section }: { section: { title: string } }) => (
    <div data-testid="crud-section">{section.title}</div>
  ),
}))

describe('CoordinatorDashboard', () => {
  const defaultResponses: Record<string, any[]> = {
    '/programs/': [],
    '/program-semesters/': [],
    '/courses/': [],
    '/teachers/': [],
    '/students/': [],
    '/schedule/overview': [],
    '/subjects/': [],
  }

  const renderDashboard = (initialEntries: string[] = ['/dashboard/coordinator']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <MantineProvider>
          <CoordinatorDashboard />
        </MantineProvider>
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    apiModule.get.mockReset()
    apiModule.get.mockImplementation((path: string) => {
      const data = defaultResponses[path] ?? []
      return Promise.resolve({ data })
    })
    const payload = btoa(JSON.stringify({ role: 'coordinator', full_name: 'Coord QA' }))
    window.localStorage.setItem('authToken', `stub.${payload}.sig`)
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renderiza pestañas de gestión operativa con secciones compartidas', async () => {
    renderDashboard()

    await waitFor(() => expect(apiModule.get).toHaveBeenCalledWith('/schedule/overview'))

    expect(screen.getByText('Gestión operativa')).toBeInTheDocument()
    const studentsTab = screen.getByRole('tab', { name: 'Estudiantes' })
    const coursesTab = screen.getByRole('tab', { name: 'Cursos' })
    expect(studentsTab).toBeInTheDocument()
    expect(coursesTab).toBeInTheDocument()

    expect(screen.getByTestId('crud-section')).toHaveTextContent('Programas')

    fireEvent.click(coursesTab)
    await waitFor(() => expect(screen.getByTestId('crud-section')).toHaveTextContent('Cursos'))

    const plannerTab = screen.getByRole('tab', { name: 'Planificador por programa' })
    fireEvent.click(plannerTab)
    await waitFor(() => expect(screen.getByTestId('planner')).toBeInTheDocument())

    const optimizerTab = screen.getByRole('tab', { name: 'Optimizador global' })
    fireEvent.click(optimizerTab)
    await waitFor(() => expect(screen.getByTestId('global-planner')).toBeInTheDocument())
  })

  it('activa pestaña de catálogos a partir del query param catalog', async () => {
    renderDashboard(['/dashboard/coordinator?catalog=courses#catalogos'])

    await waitFor(() => expect(apiModule.get).toHaveBeenCalledWith('/schedule/overview'))

    await waitFor(() => expect(screen.getByTestId('crud-section')).toHaveTextContent('Cursos'))
  })
})
