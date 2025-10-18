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

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/dashboard/admin" element={<div>Panel de Administrador</div>} />
          <Route path="/dashboard/teacher" element={<div>Teacher Dashboard</div>} />
          <Route path="/dashboard/student" element={<div>Student Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
}

describe('App', () => {
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
  await screen.findByText(/Panel de Administrador/i)
    expect(api.post).toHaveBeenCalledWith('/auth/token', expect.any(URLSearchParams), expect.any(Object))
  })
})
