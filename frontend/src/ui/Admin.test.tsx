/// <reference types="vitest/globals" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { Admin } from './Admin'
import { MantineProvider } from '@mantine/core'
function renderWithMantine(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>)
}

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    defaults: { headers: { common: {} } },
  }
}))

describe('Admin CRUD básico', () => {
  it('lista y crea timeslots', async () => {
    const { api } = await import('../lib/api')
    ;(api.get as any).mockResolvedValueOnce({ data: [] }) // carga inicial
  renderWithMantine(<Admin />)
    // Seleccionar pestaña Bloques Horarios
    fireEvent.click(screen.getByText('Bloques Horarios'))

    // Debe cargar listado
    await waitFor(() => expect(api.get).toHaveBeenCalled())

    // Simular creación
    ;(api.post as any).mockResolvedValueOnce({ data: { id: 1 } })
    ;(api.get as any).mockResolvedValueOnce({ data: [{ id: 1, day_of_week: 1, start_time: '08:00:00', end_time: '09:00:00' }] })

  const day = screen.getByLabelText('day_of_week') as HTMLInputElement
  const start = screen.getByLabelText('start_time') as HTMLInputElement
  const end = screen.getByLabelText('end_time') as HTMLInputElement
  fireEvent.change(day, { target: { value: '1' } })
  fireEvent.change(start, { target: { value: '08:00' } })
  fireEvent.change(end, { target: { value: '09:00' } })
    fireEvent.click(screen.getByText('Crear'))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/timeslots/', { day_of_week: 1, start_time: '08:00:00', end_time: '09:00:00' })
    await waitFor(() => expect(screen.getByText(/08:00:00/)).toBeInTheDocument())
  })

  it('muestra errores de validación cuando faltan campos requeridos', async () => {
    const { api } = await import('../lib/api')
    ;(api.get as any).mockResolvedValueOnce({ data: [] })
  renderWithMantine(<Admin />)
    // Ir a la sección Bloques Horarios
    await waitFor(() => screen.getByText('Bloques Horarios'))
    fireEvent.click(screen.getByText('Bloques Horarios'))

    // Enviar sin llenar
    fireEvent.click(screen.getByText('Crear'))

    // Debe mostrar mensajes de error (al menos uno)
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })
})
