/// <reference types="vitest/globals" />
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

import GlobalScheduleOptimizer from './GlobalScheduleOptimizer'

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: getMock,
    post: postMock,
    defaults: { headers: { common: {} } },
  },
}))

const sampleProgram = { id: 1, code: 'ENG', name: 'Ingeniería' }
const sampleSemester = { id: 10, program_id: sampleProgram.id, semester_number: 1, label: 'Semestre 1' }
const sampleSubject = { id: 20, name: 'Cálculo diferencial' }
const sampleTeacherUser = { id: 300, full_name: 'Profesora Demo' }
const sampleTeacher = { id: 30, user_id: sampleTeacherUser.id }
const sampleCourse = {
  id: 40,
  subject_id: sampleSubject.id,
  teacher_id: sampleTeacher.id,
  program_semester_id: sampleSemester.id,
  term: '2025-1',
  group: 'A',
  weekly_hours: 3,
}
const sampleRoom = { id: 50, code: 'A-101', capacity: 40 }
const sampleTimeslot = { id: 60, day_of_week: 1, start_time: '08:00:00', end_time: '09:30:00' }

const sampleQualityMetrics = {
  total_assigned: 1,
  total_unassigned: 0,
  lunch_violations: 0,
  consecutive_blocks_violations: 0,
  gap_violations: 0,
  balance_score: 75.5,
  daily_overload_count: 0,
  avg_daily_load: 4.5,
  max_daily_load: 6,
  timeslot_utilization: 0.75,
  unassigned_count: 0,
}

function setupMocks() {
  getMock.mockReset()
  postMock.mockReset()

  getMock.mockImplementation((path: string) => {
    switch (path) {
      case '/programs/':
        return Promise.resolve({ data: [sampleProgram] })
      case '/program-semesters/':
        return Promise.resolve({ data: [sampleSemester] })
      case '/courses/':
        return Promise.resolve({ data: [sampleCourse] })
      case '/rooms/':
        return Promise.resolve({ data: [sampleRoom] })
      case '/timeslots/':
        return Promise.resolve({ data: [sampleTimeslot] })
      case '/subjects/':
        return Promise.resolve({ data: [sampleSubject] })
      case '/teachers/':
        return Promise.resolve({ data: [sampleTeacher] })
      case '/users/':
        return Promise.resolve({ data: [sampleTeacherUser] })
      default:
        return Promise.resolve({ data: [] })
    }
  })

  postMock.mockImplementation((path: string) => {
    if (path === '/schedule/optimize') {
      return Promise.resolve({
        data: {
          assignments: [
            {
              course_id: sampleCourse.id,
              room_id: sampleRoom.id,
              timeslot_id: sampleTimeslot.id,
              duration_minutes: 90,
              start_offset_minutes: 0,
            },
          ],
          unassigned: [],
          quality_metrics: sampleQualityMetrics,
        },
      })
    }
    if (path === '/schedule/assignments/save') {
      return Promise.resolve({ data: [] })
    }
    return Promise.resolve({ data: {} })
  })
}

function renderOptimizer() {
  return render(
    <MantineProvider>
      <GlobalScheduleOptimizer />
    </MantineProvider>,
  )
}

describe('GlobalScheduleOptimizer', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('ejecuta optimizador global con parámetros configurables', async () => {
    renderOptimizer()

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/programs/'))

    const runButton = await screen.findByRole('button', { name: /Optimizar horarios globales/i })
    expect(runButton).toBeEnabled()

  const dailyLimitInput = screen.getByLabelText('Horas máximas por programa al día') as HTMLInputElement
  fireEvent.change(dailyLimitInput, { target: { value: '8' } })

    fireEvent.click(runButton)

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1))
    const payload = postMock.mock.calls[0][1] as any
    expect(payload.courses).toHaveLength(1)
    expect(payload.courses[0]).toMatchObject({
      course_id: sampleCourse.id,
      teacher_id: sampleTeacher.id,
      weekly_hours: sampleCourse.weekly_hours,
      program_semester_id: sampleSemester.id,
    })
    expect(payload.constraints.max_daily_hours_per_program).toBe(8)
    expect(payload.constraints).not.toHaveProperty('max_consecutive_blocks')
    expect(payload.constraints).not.toHaveProperty('min_gap_blocks')
    expect(payload.constraints).not.toHaveProperty('min_gap_minutes')
    expect(payload.constraints).not.toHaveProperty('lunch_blocks')
    expect(payload.constraints.teacher_availability[sampleTeacher.id]).toEqual([sampleTimeslot.id])

    expect(await screen.findByRole('heading', { name: 'Ingeniería' })).toBeInTheDocument()
    const semesterLabel = await screen.findByText('Semestre 1')
    const semesterButton = semesterLabel.closest('button') as HTMLButtonElement
    expect(semesterButton).not.toBeNull()
    fireEvent.click(semesterButton)

    expect(await screen.findByText('Cálculo diferencial · Grupo A')).toBeInTheDocument()
    expect(screen.getByText('A-101')).toBeInTheDocument()
    expect(screen.getByText('Optimizador global: 1 bloque sugerido listo para revisión.')).toBeInTheDocument()
    expect(screen.getByText('75.5%')).toBeInTheDocument()

    const applyButton = screen.getByRole('button', { name: 'Aplicar propuesta global' })
    fireEvent.click(applyButton)

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2))
    const saveCall = postMock.mock.calls[1]
    expect(saveCall[0]).toBe('/schedule/assignments/save')
    expect(saveCall[1].assignments).toEqual([
      {
        course_id: sampleCourse.id,
        room_id: sampleRoom.id,
        timeslot_id: sampleTimeslot.id,
        duration_minutes: 90,
        start_offset_minutes: 0,
      },
    ])
    expect(screen.getByText('Propuesta global aplicada y publicada en el horario institucional.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aplicar propuesta global' })).not.toBeInTheDocument()
  })

  it('muestra un error cuando aplicar la propuesta global falla', async () => {
    renderOptimizer()

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/programs/'))

    const runButton = await screen.findByRole('button', { name: /Optimizar horarios globales/i })
    fireEvent.click(runButton)

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1))

    expect(await screen.findByRole('heading', { name: 'Ingeniería' })).toBeInTheDocument()
    const semesterLabel = await screen.findByText('Semestre 1')
    fireEvent.click(semesterLabel.closest('button') as HTMLButtonElement)

    expect(await screen.findByText('Cálculo diferencial · Grupo A')).toBeInTheDocument()

    const applyButton = screen.getByRole('button', { name: 'Aplicar propuesta global' })
    postMock.mockImplementationOnce((path: string) => {
      expect(path).toBe('/schedule/assignments/save')
      return Promise.reject({ response: { data: { detail: 'No se pudo aplicar la propuesta global' } } })
    })

    fireEvent.click(applyButton)

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2))
    expect(screen.getByText('No se pudo aplicar la propuesta global')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aplicar propuesta global' })).toBeInTheDocument()
  })
})
