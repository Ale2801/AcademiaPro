/// <reference types="vitest/globals" />
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

import ApplicationSettings from './ApplicationSettings'

type MockSetting = {
  key: string
  value: string | null
  description?: string | null
  label?: string | null
  category?: string | null
  is_public: boolean
}

const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: getMock,
    put: putMock,
    defaults: { headers: { common: {} } },
  },
}))

const defaultSettings: MockSetting[] = [
  { key: 'branding.app_name', value: 'Academia Central', description: 'Nombre institucional visible', is_public: true },
  { key: 'branding.tagline', value: 'Innovación y talento', description: null, is_public: true },
  { key: 'branding.logo_url', value: 'https://cdn.example.com/logo.png', description: 'Logo principal', is_public: true },
  { key: 'branding.primary_color', value: '#004488', description: 'Color corporativo', is_public: true },
  { key: 'platform.default_language', value: 'es', description: 'Idioma por defecto', is_public: true },
  { key: 'platform.timezone', value: 'America/Bogota', description: 'Zona horaria oficial', is_public: true },
  { key: 'contact.support_email', value: 'soporte@academia.edu', description: 'Email de soporte', is_public: true },
  { key: 'contact.support_phone', value: '+57 300 000 0000', description: 'Línea directa', is_public: true },
]

function renderSettings() {
  return render(
    <MantineProvider>
      <ApplicationSettings />
    </MantineProvider>,
  )
}

describe('ApplicationSettings', () => {
  beforeEach(() => {
    getMock.mockReset()
    putMock.mockReset()
    getMock.mockResolvedValue({ data: defaultSettings })
    putMock.mockResolvedValue({ data: {} })
  })

  it('muestra ajustes cargados y la previsualización de branding', async () => {
    renderSettings()

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/settings/'))

    const nameInput = await screen.findByLabelText('Nombre de la plataforma')
    expect((nameInput as HTMLInputElement).value).toBe('Academia Central')

    expect(screen.getByRole('heading', { name: 'Academia Central' })).toBeInTheDocument()
    const logo = screen.getByRole('img', { name: 'Logo institucional' }) as HTMLImageElement
    expect(logo.src).toContain('https://cdn.example.com/logo.png')
    expect(screen.getByText('#004488')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar ajustes' })).toBeDisabled()
  })

  it('permite modificar campos y guardar los cambios', async () => {
    renderSettings()

    await waitFor(() => expect(getMock).toHaveBeenCalled())

    const colorInput = await screen.findByLabelText('Color primario')
    fireEvent.change(colorInput, { target: { value: '#112233' } })

    await screen.findByText('1 cambio')

    const saveButton = screen.getByRole('button', { name: 'Guardar ajustes' })
    expect(saveButton).toBeEnabled()

    fireEvent.click(saveButton)

    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1))
    expect(putMock).toHaveBeenCalledWith('/settings/branding.primary_color', { value: '#112233' })

    await screen.findByText('Ajustes guardados correctamente.')
    await screen.findAllByText('0 cambios')
    expect(saveButton).toBeDisabled()
  })

  it('muestra un mensaje de error si guardar falla', async () => {
    renderSettings()

    await waitFor(() => expect(getMock).toHaveBeenCalled())

    const emailInput = await screen.findByLabelText('Correo de soporte')
    fireEvent.change(emailInput, { target: { value: 'help@academia.edu' } })

    putMock.mockRejectedValueOnce({ response: { data: { detail: 'Error al guardar ajustes' } } })

    const saveButton = screen.getByRole('button', { name: 'Guardar ajustes' })
    fireEvent.click(saveButton)

    await waitFor(() => expect(putMock).toHaveBeenCalled())
    await screen.findByText('Error al guardar ajustes')
    expect(saveButton).toBeEnabled()
  })

  it('muestra un mensaje de error si la carga inicial falla', async () => {
    getMock.mockRejectedValueOnce({ response: { data: { detail: 'No hay conexión disponible' } } })

    renderSettings()

    await waitFor(() => expect(getMock).toHaveBeenCalled())
    await screen.findByText('No hay conexión disponible')
  })
})
