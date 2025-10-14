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
    ;(api.get as any).mockResolvedValueOnce({ data: [] })

    renderWithMantine(<Admin />)

    const timeslotsTab = await screen.findByRole('tab', { name: 'Bloques Horarios' })
    fireEvent.click(timeslotsTab)

    await waitFor(() => expect(api.get).toHaveBeenCalled())

    ;(api.post as any).mockResolvedValueOnce({ data: { id: 1 } })
    ;(api.get as any).mockResolvedValueOnce({ data: [{ id: 1, day_of_week: 1, start_time: '08:00:00', end_time: '09:00:00' }] })

    const day = screen.getByLabelText('Día (0-6)') as HTMLInputElement
    const start = screen.getByLabelText('Hora inicio') as HTMLInputElement
    const end = screen.getByLabelText('Hora fin') as HTMLInputElement

    fireEvent.change(day, { target: { value: '1' } })
    fireEvent.change(start, { target: { value: '08:00' } })
    fireEvent.change(end, { target: { value: '09:00' } })

    fireEvent.click(screen.getByRole('button', { name: /Crear registro/i }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/timeslots/', { day_of_week: 1, start_time: '08:00:00', end_time: '09:00:00' })
    )
    await waitFor(() => expect(screen.getByText(/08:00:00/)).toBeInTheDocument())
  })

  it('muestra errores de validación cuando faltan campos requeridos', async () => {
    const { api } = await import('../lib/api')
    ;(api.get as any).mockResolvedValueOnce({ data: [] })

    renderWithMantine(<Admin />)

    const timeslotsTab = await screen.findByRole('tab', { name: 'Bloques Horarios' })
    fireEvent.click(timeslotsTab)

    fireEvent.click(screen.getByRole('button', { name: /Crear registro/i }))

    await waitFor(() => {
      const errors = screen.getAllByText(/Requerido|Debe ser/i)
      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
