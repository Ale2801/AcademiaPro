/// <reference types="vitest/globals" />
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

import SchedulePlanner from './SchedulePlanner'

const designerRef: { current: any } = { current: null }

const { getMock, postMock, putMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('./ScheduleDesigner', () => {
  return {
    __esModule: true,
    default: (props: any) => {
      designerRef.current = props
      return <div data-testid="schedule-designer" />
    },
  }
})

vi.mock('../../lib/api', () => {
  return {
    api: {
      get: getMock,
      post: postMock,
      put: putMock,
      delete: deleteMock,
      defaults: { headers: { common: {} } },
    },
    setAuth: vi.fn(),
  }
})

const baseProgram = { id: 10, code: 'ENG', name: 'Ingeniería' }
const baseSemester = { id: 20, program_id: baseProgram.id, semester_number: 1, label: 'Semestre 1', is_active: true }
const teacherUser = { id: 500, full_name: 'Docente Demo' }
const baseTeacher = { id: 40, user_id: teacherUser.id }
const baseSubject = { id: 30, name: 'Álgebra' }
const baseCourse = {
  id: 60,
  subject_id: baseSubject.id,
  teacher_id: baseTeacher.id,
  term: '2025-1',
  group: 'A',
  weekly_hours: 1,
}
const baseRoom = { id: 70, code: 'LAB-101', capacity: 30 }
const baseTimeslot = {
  id: 80,
  day_of_week: 2,
  start_time: '09:00:00',
  end_time: '10:00:00',
}

const scheduleEntriesRef: { current: any[] } = { current: [] }

function setupApiMocks() {
  scheduleEntriesRef.current = []
  designerRef.current = null
  getMock.mockReset()
  postMock.mockReset()
  putMock.mockReset()
  deleteMock.mockReset()

  getMock.mockImplementation((path: string, config?: any) => {
    switch (path) {
      case '/programs/':
        return Promise.resolve({ data: [baseProgram] })
      case '/program-semesters/':
        return Promise.resolve({ data: [baseSemester] })
      case '/rooms/':
        return Promise.resolve({ data: [baseRoom] })
      case '/timeslots/':
        return Promise.resolve({ data: [baseTimeslot] })
      case '/teachers/':
        return Promise.resolve({ data: [baseTeacher] })
      case '/students/':
        return Promise.resolve({ data: [] })
      case '/subjects/':
        return Promise.resolve({ data: [baseSubject] })
      case '/users/':
        return Promise.resolve({ data: [teacherUser] })
      case '/courses/':
        if (config?.params?.program_semester_id === baseSemester.id) {
          return Promise.resolve({ data: [baseCourse] })
        }
        return Promise.resolve({ data: [] })
      case '/schedule/overview':
        return Promise.resolve({ data: scheduleEntriesRef.current })
      case '/enrollments/':
        return Promise.resolve({ data: [] })
      default:
        return Promise.resolve({ data: [] })
    }
  })

  postMock.mockImplementation((path: string, payload: any) => {
    switch (path) {
      case '/course-schedules/': {
        const entry = {
          id: 901,
          course_id: payload.course_id,
          room_id: payload.room_id,
          timeslot_id: payload.timeslot_id,
          room_code: baseRoom.code,
          day_of_week: baseTimeslot.day_of_week,
          start_time: '09:00',
          end_time: '10:00',
          duration_minutes: payload.duration_minutes ?? 60,
          start_offset_minutes: payload.start_offset_minutes ?? 0,
        }
        scheduleEntriesRef.current = [entry]
        return Promise.resolve({ data: entry })
      }
      case '/schedule/optimize':
        return Promise.resolve({
          data: {
            assignments: [
              {
                course_id: baseCourse.id,
                room_id: baseRoom.id,
                timeslot_id: baseTimeslot.id,
                duration_minutes: 45,
                start_offset_minutes: 15,
              },
            ],
            unassigned: [{ course_id: baseCourse.id, remaining_minutes: 30 }],
          },
        })
      case '/schedule/assignments/save': {
        const entries = payload.assignments.map((assignment: any, idx: number) => ({
          id: 1000 + idx,
          ...assignment,
          room_code: baseRoom.code,
          day_of_week: baseTimeslot.day_of_week,
          start_time: '09:00',
          end_time: '10:00',
          duration_minutes: assignment.duration_minutes ?? 60,
          start_offset_minutes: assignment.start_offset_minutes ?? 0,
        }))
        scheduleEntriesRef.current = entries
        return Promise.resolve({ data: entries })
      }
      case '/schedule/assignments/teacher':
      case '/schedule/assignments/students':
        return Promise.resolve({ data: {} })
      default:
        return Promise.resolve({ data: {} })
    }
  })

  putMock.mockResolvedValue({ data: {} })
  deleteMock.mockResolvedValue({ data: {} })
}

function renderPlanner() {
  return render(
    <MantineProvider>
      <SchedulePlanner />
    </MantineProvider>
  )
}

describe('SchedulePlanner drag & drop experience', () => {
  beforeEach(() => {
    setupApiMocks()
  })

  it('crea un bloque cuando se arrastra un curso y se confirma el modal', async () => {
    renderPlanner()

    await waitFor(() => expect(designerRef.current).toBeTruthy())

    await act(async () => {
      designerRef.current.onCourseDrop(baseCourse.id, baseTimeslot.id)
    })

    expect(await screen.findByText('Agregar bloque al horario')).toBeInTheDocument()

    const submit = screen.getByRole('button', { name: 'Guardar cambios' })
    fireEvent.click(submit)

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/course-schedules/',
        expect.objectContaining({
          course_id: baseCourse.id,
          room_id: baseRoom.id,
          timeslot_id: baseTimeslot.id,
          duration_minutes: 60,
          start_offset_minutes: 0,
        })
      )
    })

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/schedule/overview', expect.anything()))
  })

  it('ejecuta el optimizador y aplica la propuesta resultante', async () => {
    renderPlanner()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ejecutar optimizador' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar optimizador' }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/schedule/optimize',
        expect.objectContaining({
          courses: [expect.objectContaining({ course_id: baseCourse.id })],
        })
      )
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar propuesta' })).toBeInTheDocument())

    await waitFor(() =>
      expect(
        screen.getByText(/Optimización parcial: 1 bloques sugeridos\. Pendiente: .*30m\./i),
      ).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar propuesta' }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/schedule/assignments/save',
        expect.objectContaining({
          assignments: [
            expect.objectContaining({
              course_id: baseCourse.id,
              timeslot_id: baseTimeslot.id,
              duration_minutes: 45,
              start_offset_minutes: 15,
            }),
          ],
          replace_existing: true,
        })
      )
    })

    await waitFor(() => expect(screen.getByText('Horario aplicado correctamente')).toBeInTheDocument())

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/schedule/overview', expect.anything()))
  })

  it('muestra un resumen cuando el optimizador detecta conflictos docentes sin bloques sugeridos', async () => {
    renderPlanner()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ejecutar optimizador' })).toBeEnabled())

    postMock.mockImplementationOnce((path: string) => {
      expect(path).toBe('/schedule/optimize')
      return Promise.resolve({
        data: {
          assignments: [],
          unassigned: [{ course_id: baseCourse.id, remaining_minutes: 120 }],
        },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar optimizador' }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/schedule/optimize',
        expect.objectContaining({
          courses: [expect.objectContaining({ course_id: baseCourse.id })],
        }),
      )
    })

    await waitFor(() =>
      expect(
        screen.getByText(/Optimización parcial: 0 bloques sugeridos\. Pendiente: .*2h\./i),
      ).toBeInTheDocument(),
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Aplicar propuesta' })).not.toBeInTheDocument()
    })
  })
})
