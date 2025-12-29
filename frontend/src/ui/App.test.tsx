/// <reference types="vitest/globals" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
    get: vi.fn(() => Promise.resolve({ data: [] })),
    defaults: { headers: { common: {} } },
  },
  setAuth: () => {},
}))

import { App } from './App'
import { useAppSettingsStore, BRANDING_KEYS, BRANDING_DEFAULTS } from '../lib/settings'
import { useAuth } from '../lib/auth'

type RenderOptions = {
  initialEntries?: string[]
  extraRoutes?: React.ReactElement[]
}

function renderWithRouter(ui: React.ReactElement, options?: RenderOptions) {
  const { initialEntries = ['/'], extraRoutes = [] } = options ?? {}
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/dashboard/admin" element={<div>Panel de Administrador</div>} />
          <Route path="/dashboard/coordinator" element={<div>Panel de Coordinador</div>} />
          <Route path="/dashboard/teacher" element={<div>Teacher Dashboard</div>} />
          <Route path="/dashboard/student" element={<div>Student Dashboard</div>} />
          {extraRoutes}
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
}

function resetSettingsStore() {
  useAppSettingsStore.setState({
    values: {
      [BRANDING_KEYS.appName]: BRANDING_DEFAULTS.appName,
      [BRANDING_KEYS.tagline]: BRANDING_DEFAULTS.tagline,
      [BRANDING_KEYS.logoUrl]: BRANDING_DEFAULTS.logoUrl,
      [BRANDING_KEYS.primaryColor]: BRANDING_DEFAULTS.primaryColor,
      [BRANDING_KEYS.portalUrl]: BRANDING_DEFAULTS.portalUrl,
      [BRANDING_KEYS.enableLanding]: BRANDING_DEFAULTS.enableLanding,
    },
    loadingCategories: { branding: false },
    loadedCategories: { branding: true },
    error: undefined,
  })
}

function setBrandingValues(entries: Record<string, string>) {
  useAppSettingsStore.setState((state) => ({
    ...state,
    values: { ...state.values, ...entries },
    loadedCategories: { ...state.loadedCategories, branding: true },
    loadingCategories: { ...state.loadingCategories, branding: false },
  }))
}

function stubWindowLocation() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
  let assignedHref = window.location.href
  const locationMock = {
    ...(window.location as any),
  } as Location
  Object.defineProperty(locationMock, 'href', {
    configurable: true,
    get() {
      return assignedHref
    },
    set(value: string) {
      assignedHref = value
    },
  })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: locationMock,
  })
  return {
    getHref: () => assignedHref,
    restore: () => {
      if (originalDescriptor) {
        Object.defineProperty(window, 'location', originalDescriptor)
      }
    },
  }
}

describe('App', () => {
  beforeEach(() => {
    resetSettingsStore()
    window.localStorage.clear()
    useAuth.setState((state) => ({
      ...state,
      token: undefined,
      mustChangePassword: false,
    }))
  })

  it('renderiza login por defecto', () => {
    renderWithRouter(<App />)
    expect(screen.getByText(/Inicia sesión/i)).toBeInTheDocument()
  })

  it('muestra error si login falla', async () => {
  const { api } = await import('../lib/api')
    ;(api.post as any).mockRejectedValueOnce(new Error('bad creds'))
  renderWithRouter(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(screen.getByText(/bad creds/i)).toBeInTheDocument())
  })

  it('inicia sesión y redirige a dashboard admin', async () => {
  const { api } = await import('../lib/api')
    ;(api.post as any).mockResolvedValueOnce({ data: { access_token: 'token123' } })
  renderWithRouter(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    // Redirige a /dashboard/admin
  await waitFor(() => expect(screen.getByText(/Panel de Administrador/i)).toBeInTheDocument())
    expect(api.post).toHaveBeenCalledWith('/auth/token', expect.any(URLSearchParams), expect.any(Object))
  })

  it('navega a un portal interno personalizado cuando la landing está deshabilitada', async () => {
    setBrandingValues({
      [BRANDING_KEYS.enableLanding]: 'false',
      [BRANDING_KEYS.portalUrl]: '/portal-institucional',
    })

    renderWithRouter(<App />, {
      extraRoutes: [
        <Route key="portal" path="/portal-institucional" element={<div>Portal institucional</div>} />,
      ],
    })

    const homeButton = await screen.findByLabelText('Volver a la landing')
    fireEvent.click(homeButton)

    await waitFor(() => expect(screen.getByText('Portal institucional')).toBeInTheDocument())
  })

  it('actualiza window.location cuando existe un portal externo configurado', async () => {
    const stub = stubWindowLocation()
    setBrandingValues({
      [BRANDING_KEYS.enableLanding]: 'false',
      [BRANDING_KEYS.portalUrl]: 'https://portal.academia.edu',
    })

    try {
      renderWithRouter(<App />)
      const homeButton = await screen.findByLabelText('Volver a la landing')
      fireEvent.click(homeButton)
      await waitFor(() => expect(stub.getHref()).toBe('https://portal.academia.edu'))
    } finally {
      stub.restore()
    }
  })
})
