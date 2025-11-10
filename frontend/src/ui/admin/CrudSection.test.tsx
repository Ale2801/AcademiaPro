import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrudSection } from './CrudSection'
import { crudSections } from '../Admin'
import { normalizePayload } from './utils'
import { MantineProvider } from '@mantine/core'
import type { Field } from './types'

vi.mock('./TimeslotBulkBuilder', () => ({
  TimeslotBulkBuilder: () => <div data-testid="timeslot-bulk-builder" />,
}))

vi.mock('./TimeslotOverview', () => ({
  TimeslotOverview: () => <div data-testid="timeslot-overview" />,
}))

vi.mock('@mantine/core', async () => {
  const actual = await vi.importActual<typeof import('@mantine/core')>('@mantine/core')
  const Select = ({
    data = [],
    value,
    onChange,
    label,
    placeholder,
    error,
  }: {
    data?: Array<{ value: string; label: string }>
    value?: string | null
    onChange?: (value: string | null) => void
    label?: string
    placeholder?: string
    error?: string
  }) => {
    const labelText = label ?? placeholder ?? 'Selecciona una opción'
    const id = `select-${labelText.replace(/\s+/g, '-').toLowerCase()}`
    return (
      <label htmlFor={id} style={{ display: 'block' }}>
        {labelText}
        <select
          id={id}
          aria-invalid={error ? 'true' : 'false'}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.target.value || null)}
        >
          <option value="" disabled>
            {placeholder ?? 'Selecciona una opción'}
          </option>
          {data.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return {
    ...actual,
    Select,
  }
})

const apiModule = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: apiModule.get,
    post: apiModule.post,
    put: apiModule.put,
    delete: apiModule.delete,
    patch: apiModule.patch,
    defaults: { headers: { common: {} } },
  },
}))

const collectionFixtures: Record<string, any[]> = {
  '/programs/': [{ id: 1, name: 'Ingeniería Civil' }],
  '/program-semesters/': [{ id: 10, program_id: 1, label: '2025 Otoño', semester_number: 1 }],
  '/students/': [{ id: 20, user_id: 100, enrollment_year: 2024, full_name: 'Estudiante Uno' }],
  '/teachers/': [{ id: 30, user_id: 200, department: 'Informática', specialty: 'Algoritmos' }],
  '/subjects/': [{ id: 40, name: 'Algoritmos Avanzados', program_id: 1 }],
  '/courses/': [{ id: 50, subject_id: 40, teacher_id: 30, program_semester_id: 10, term: '2025-1' }],
  '/rooms/': [{ id: 60, code: 'A-101', capacity: 40 }],
  '/timeslots/': [{ id: 70, day_of_week: 1, start_time: '08:00:00', end_time: '09:30:00' }],
  '/course-schedules/': [{ id: 75, course_id: 50, room_id: 60, timeslot_id: 70 }],
  '/enrollments/': [{ id: 80, student_id: 20, course_id: 50 }],
  '/evaluations/': [{ id: 90, course_id: 50, name: 'Evaluación 1', weight: 0.5 }],
  '/grades/': [{ id: 100, enrollment_id: 80, evaluation_id: 90, score: 95 }],
  '/attendance/': [{ id: 110, enrollment_id: 80, session_date: '2025-01-01', present: true }],
  '/users/': [
    { id: 100, full_name: 'Estudiante Uno', email: 'estudiante@academia.pro' },
    { id: 200, full_name: 'Profesor Uno', email: 'profesor@academia.pro' },
  ],
}

const relationValues: Record<string, string> = {
  user_id: '100',
  program_id: '1',
  subject_id: '40',
  teacher_id: '30',
  program_semester_id: '10',
  student_id: '20',
  course_id: '50',
  room_id: '60',
  timeslot_id: '70',
  enrollment_id: '80',
  evaluation_id: '90',
}

const numberSamples: Record<string, string> = {
  semester_number: '1',
  enrollment_year: '2024',
  cohort_year: '2024',
  pedagogical_hours_per_week: '5',
  day_of_week: '1',
  weight: '0.5',
  score: '95',
}

const textSamples: Record<string, string> = {
  code: 'TEST-001',
  name: 'Registro de prueba',
  term: '2025-1',
  description: 'Descripción de prueba',
}

function sampleValueForField(field: Field): any {
  if (relationValues[field.name]) {
    return relationValues[field.name]
  }

  if (field.type === 'select') {
    return field.options?.[0]?.value ?? 'opcion'
  }

  if (field.type === 'number') {
    return numberSamples[field.name] ?? '1'
  }

  if (field.type === 'time') {
    if (field.name === 'end_time') return '10:00'
    return '09:00'
  }

  if (field.type === 'date') {
    return '2025-01-01'
  }

  if (field.type === 'checkbox') {
    return true
  }

  return textSamples[field.name] ?? `Valor ${field.name}`
}

async function fillField(field: Field, value: any) {
  const label = field.label || field.name
  if (field.type === 'checkbox') {
    if (value) {
      const checkbox = (await screen.findByLabelText(label)) as HTMLInputElement
      fireEvent.click(checkbox)
    }
    return
  }

  const fieldElement = (await screen.findByLabelText(label)) as HTMLElement
  if (fieldElement instanceof HTMLSelectElement) {
    await waitFor(() => {
      const option = Array.from(fieldElement.querySelectorAll('option')).find((node) => node.getAttribute('value') === value)
      expect(option).toBeDefined()
    })
    fireEvent.change(fieldElement, { target: { value } })
    await waitFor(() => {
      expect(fieldElement.value).toBe(value ?? '')
    })
    return
  }

  const input = fieldElement as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  await waitFor(() => {
    expect(input.value).toBe(value ?? '')
  })
}

describe('CrudSection formularios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiModule.get.mockImplementation((path: string) => {
      const data = collectionFixtures[path] ?? []
      return Promise.resolve({ data })
    })
    apiModule.post.mockResolvedValue({ data: {} })
    apiModule.put.mockResolvedValue({ data: {} })
    apiModule.patch.mockResolvedValue({ data: {} })
    apiModule.delete.mockResolvedValue({ data: {} })
  })

  const sectionsWithForms = crudSections.filter((section) => section.fields.length > 0)

  it.each(sectionsWithForms.map((section) => [section.key, section]))('crea registro con datos mínimos en %s', async (_key, section) => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <MantineProvider>
          <CrudSection section={section} />
        </MantineProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(apiModule.get).toHaveBeenCalledWith(section.endpoint))

    const rawValues: Record<string, any> = {}
    for (const field of section.fields) {
      if (!field.required) continue
      const value = sampleValueForField(field)
      rawValues[field.name] = value
      await fillField(field, value)
    }

    const submitButton = await screen.findByRole('button', { name: 'Crear registro' })
    await user.click(submitButton)

    const invalidFields = Array.from(document.querySelectorAll('[aria-invalid="true"]')) as HTMLElement[]
    if (invalidFields.length > 0) {
      const labels = invalidFields.map((element) => {
        const id = element.getAttribute('id')
        if (!id) return element.getAttribute('name') ?? element.tagName
        const label = document.querySelector(`label[for="${id}"]`)
        return label?.textContent?.trim() ?? id
      })
      throw new Error(`Campos inválidos en ${section.key}: ${labels.join(', ')}`)
    }

    await waitFor(() => expect(apiModule.post).toHaveBeenCalledOnce())

    const expectedEndpoint = section.endpoint.endsWith('/') ? section.endpoint : `${section.endpoint}/`
    const expectedSubset = normalizePayload(section.fields, rawValues)
    const [endpointArg, payloadArg] = apiModule.post.mock.calls[0]
    expect(endpointArg).toBe(expectedEndpoint)
    expect(payloadArg).toMatchObject(expectedSubset)
  })
})
