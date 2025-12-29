/// <reference types="vitest/globals" />
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

import LandingRoute from './LandingRoute'

const mockUseBrandingSettings = vi.fn()

vi.mock('../../lib/settings', () => ({
  useBrandingSettings: () => mockUseBrandingSettings(),
}))

vi.mock('../Landing', () => ({
  default: () => <div>Landing mock</div>,
}))

function renderRoute() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/app" element={<div>App fallback</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  )
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

describe('LandingRoute', () => {
  beforeEach(() => {
    mockUseBrandingSettings.mockReturnValue({
      enableLanding: true,
      portalUrl: '',
      loaded: true,
    })
  })

  afterEach(() => {
    mockUseBrandingSettings.mockReset()
  })

  it('muestra la landing cuando está habilitada', () => {
    renderRoute()
    expect(screen.getByText('Landing mock')).toBeInTheDocument()
  })

  it('redirige a /app cuando la landing está deshabilitada sin portal', async () => {
    mockUseBrandingSettings.mockReturnValue({
      enableLanding: false,
      portalUrl: '',
      loaded: true,
    })
    renderRoute()
    await waitFor(() => expect(screen.getByText('App fallback')).toBeInTheDocument())
  })

  it('muestra estado de redirección y actualiza window.location cuando hay portal externo', async () => {
    const stub = stubWindowLocation()
    mockUseBrandingSettings.mockReturnValue({
      enableLanding: false,
      portalUrl: 'https://portal.academia.edu',
      loaded: true,
    })
    try {
      renderRoute()
      await screen.findByText('Redirigiendo a portal institucional…')
      await waitFor(() => expect(stub.getHref()).toBe('https://portal.academia.edu'))
    } finally {
      stub.restore()
    }
  })
})
