/// <reference types="vitest/globals" />
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { Admin } from './Admin'
import { MantineProvider } from '@mantine/core'
function renderWithMantine(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <MantineProvider>{ui}</MantineProvider>
    </MemoryRouter>,
  )
}

const apiModule = vi.hoisted(() => {
  return {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  }
})

vi.mock('../lib/api', () => ({
  api: {
    get: apiModule.get,
    post: apiModule.post,
    delete: apiModule.delete,
    patch: apiModule.patch,
    defaults: { headers: { common: {} } },
  },
}))

function resetApiMocks() {
  apiModule.get.mockReset()
  apiModule.post.mockReset()
  apiModule.delete.mockReset()
  apiModule.patch.mockReset()
  apiModule.get.mockImplementation(() => Promise.resolve({ data: [] }))
  apiModule.post.mockImplementation(() => Promise.resolve({ data: {} }))
  apiModule.delete.mockImplementation(() => Promise.resolve({ data: {} }))
  apiModule.patch.mockImplementation(() => Promise.resolve({ data: {} }))
}

beforeEach(() => {
  resetApiMocks()
})

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

  const [dayInput] = screen.getAllByLabelText('Día (0-6)') as HTMLInputElement[]
    const start = screen.getByLabelText('Hora inicio') as HTMLInputElement
    const end = screen.getByLabelText('Hora fin') as HTMLInputElement

    fireEvent.mouseDown(dayInput)
    const tuesdayCandidates = await screen.findAllByText('Martes')
    const tuesdayOption = tuesdayCandidates.find((element) => element.closest('[data-combobox-option="true"]'))
    if (!tuesdayOption) {
      throw new Error('No se encontró la opción Martes en el selector de día')
    }
    fireEvent.click(tuesdayOption)
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

  it('genera bloques masivos evitando duplicados existentes', async () => {
    const { api } = await import('../lib/api')

    const existingSlot = { id: 1, day_of_week: 0, start_time: '08:00:00', end_time: '09:30:00' }
    const newSlots = [
      { id: 2, day_of_week: 1, start_time: '08:00:00', end_time: '09:30:00' },
      { id: 3, day_of_week: 2, start_time: '08:00:00', end_time: '09:30:00' },
      { id: 4, day_of_week: 3, start_time: '08:00:00', end_time: '09:30:00' },
      { id: 5, day_of_week: 4, start_time: '08:00:00', end_time: '09:30:00' },
    ]

    const getQueue = [
      { data: [existingSlot] },
      { data: [existingSlot, ...newSlots] },
    ]

      ;(api.get as any).mockImplementation((path: string) => {
        if (path === '/timeslots/') {
          const next = getQueue.shift()
          return Promise.resolve(next ?? { data: [existingSlot, ...newSlots] })
        }
        return Promise.resolve({ data: [] })
      })

    const postSpy = api.post as ReturnType<typeof vi.fn>
    postSpy.mockImplementation(() => Promise.resolve({ data: { created: 4, skipped: 1, removed_timeslots: 0, removed_course_schedules: 0 } }))

    renderWithMantine(<Admin />)

    const timeslotsTab = await screen.findByRole('tab', { name: 'Bloques Horarios' })
    fireEvent.click(timeslotsTab)

    await screen.findByText('Crear bloques en lote')

    const summary = await screen.findByText(/Total calculado:/i)

    const blocksInput = screen.getByLabelText('Bloques por día') as HTMLInputElement
    fireEvent.change(blocksInput, { target: { value: '1' } })

    await waitFor(() => expect(summary).toHaveTextContent('Total calculado: 5 bloque'))
    await waitFor(() => expect(summary).toHaveTextContent('Nuevos: 4'))
    await waitFor(() => expect(summary).toHaveTextContent('Ignorados: 1'))

    await waitFor(() => expect(screen.getAllByText('Existe')).toHaveLength(1))

    const generateButton = screen.getByRole('button', { name: 'Generar bloques' })
    expect(generateButton).toBeEnabled()
    fireEvent.click(generateButton)

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))

    const [path, payload] = postSpy.mock.calls[0]
    expect(path).toBe('/timeslots/bulk')
    expect(payload).toMatchObject({ replace_existing: false })
    expect(Array.isArray((payload as any).slots)).toBe(true)
    expect((payload as any).slots).toHaveLength(4)
    expect((payload as any).slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ day_of_week: 1, start_time: '08:00:00', end_time: '09:30:00' }),
        expect.objectContaining({ day_of_week: 2, start_time: '08:00:00', end_time: '09:30:00' }),
        expect.objectContaining({ day_of_week: 3, start_time: '08:00:00', end_time: '09:30:00' }),
        expect.objectContaining({ day_of_week: 4, start_time: '08:00:00', end_time: '09:30:00' }),
      ]),
    )

    await waitFor(() =>
      expect(
        screen.getByText('Se generaron 4 bloques. Se omitió 1 duplicado.'),
      ).toBeInTheDocument(),
    )
  })

  it('reemplaza bloques existentes mostrando advertencias y resumen de limpieza', async () => {
    const { api } = await import('../lib/api')

    const existingSlot = { id: 1, day_of_week: 0, start_time: '08:00:00', end_time: '09:30:00' }
    const getQueue = [
      { data: [existingSlot] },
      { data: [existingSlot] },
    ]

    ;(api.get as any).mockImplementation((path: string) => {
      if (path === '/timeslots/') {
        const next = getQueue.shift()
        return Promise.resolve(next ?? { data: [existingSlot] })
      }
      return Promise.resolve({ data: [] })
    })

    const postSpy = api.post as ReturnType<typeof vi.fn>
    postSpy.mockResolvedValueOnce({ data: { created: 5, skipped: 0, removed_timeslots: 1, removed_course_schedules: 2 } })

    renderWithMantine(<Admin />)

    const timeslotsTab = await screen.findByRole('tab', { name: 'Bloques Horarios' })
    fireEvent.click(timeslotsTab)

    await screen.findByText('Crear bloques en lote')

    const blocksInput = screen.getByLabelText('Bloques por día') as HTMLInputElement
    fireEvent.change(blocksInput, { target: { value: '1' } })

    const replaceSwitch = screen.getByLabelText('Reemplazar bloques existentes') as HTMLInputElement
    expect(replaceSwitch.checked).toBe(false)
    fireEvent.click(replaceSwitch)
    expect(replaceSwitch.checked).toBe(true)

    await waitFor(() =>
      expect(
        screen.getByText(/Se eliminarán 1 bloque actual y cualquier horario de curso asociado/i),
      ).toBeInTheDocument(),
    )

    const recreateButton = screen.getByRole('button', { name: 'Recrear bloques' })
    fireEvent.click(recreateButton)

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))

    const [path, payload] = postSpy.mock.calls[0]
    expect(path).toBe('/timeslots/bulk')
    expect(payload).toMatchObject({ replace_existing: true })
    expect((payload as any).slots).toHaveLength(5)

    await waitFor(() =>
      expect(
        screen.getByText('Se generaron 5 bloques. Se eliminó 1 bloque anterior. Se limpiaron 2 horarios asignados.'),
      ).toBeInTheDocument(),
    )
  })

  it('permite eliminar bloques desde la vista gráfica', async () => {
    const { api } = await import('../lib/api')

    const slots = [
      { id: 10, day_of_week: 0, start_time: '08:00:00', end_time: '09:30:00', campus: null, comment: null },
      { id: 11, day_of_week: 1, start_time: '09:45:00', end_time: '11:15:00', campus: 'Norte', comment: 'Laboratorio' },
    ]

    ;(api.get as any).mockImplementation((path: string) => {
      if (path === '/timeslots/') {
        return Promise.resolve({ data: slots })
      }
      return Promise.resolve({ data: [] })
    })

    const deleteSpy = api.delete as ReturnType<typeof vi.fn>

    renderWithMantine(<Admin />)

    const timeslotsTab = await screen.findByRole('tab', { name: 'Bloques Horarios' })
    fireEvent.click(timeslotsTab)

    await screen.findByText('Distribución semanal')

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const deleteButtons = await screen.findAllByRole('button', { name: 'Eliminar bloque' })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/timeslots/10'))

    confirmSpy.mockRestore()
  })

  it('muestra la introducción para el optimizador global', async () => {
    renderWithMantine(<Admin />)

    const introButton = await screen.findByRole('button', { name: /Introducción al optimizador/i })
    expect(introButton).toBeInTheDocument()
    await userEvent.click(introButton)

    await screen.findByText('Introducción al optimizador')
    expect(await screen.findByText('Diseña la estructura académica')).toBeInTheDocument()
  })

})
