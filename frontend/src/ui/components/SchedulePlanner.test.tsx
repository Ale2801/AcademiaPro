/// <reference types="vitest/globals" />
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

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

const baseCourseLabel = 'Álgebra · 2025-1 · Grupo A'
const baseProgramLabel = `${baseProgram.name} · ${baseSemester.label}`
const foreignCourseLabel = 'Macroeconomía · 2025-1 · Grupo B'
const foreignProgramLabel = 'Derecho · Semestre 3'

const programScheduleRef: { current: any[] } = { current: [] }
const globalScheduleRef: { current: any[] } = { current: [] }

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

function setupApiMocks() {
  programScheduleRef.current = []
  globalScheduleRef.current = []
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
        if (config?.params?.program_semester_id != null) {
          return Promise.resolve({ data: programScheduleRef.current })
        }
        return Promise.resolve({ data: globalScheduleRef.current })
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
          course_name: baseCourseLabel,
          room_id: payload.room_id,
          timeslot_id: payload.timeslot_id,
          room_code: baseRoom.code,
          day_of_week: baseTimeslot.day_of_week,
          start_time: '09:00',
          end_time: '10:00',
          duration_minutes: payload.duration_minutes ?? 60,
          start_offset_minutes: payload.start_offset_minutes ?? 0,
          program_id: baseProgram.id,
          program_semester_id: baseSemester.id,
          program_semester_label: baseProgramLabel,
          teacher_id: baseTeacher.id,
        }
        programScheduleRef.current = [...programScheduleRef.current.filter((item) => item.id !== entry.id), entry]
        globalScheduleRef.current = [...globalScheduleRef.current.filter((item) => item.id !== entry.id), entry]
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
          course_name: baseCourseLabel,
          room_code: baseRoom.code,
          day_of_week: baseTimeslot.day_of_week,
          start_time: '09:00',
          end_time: '10:00',
          duration_minutes: assignment.duration_minutes ?? 60,
          start_offset_minutes: assignment.start_offset_minutes ?? 0,
          program_id: baseProgram.id,
          program_semester_id: baseSemester.id,
          program_semester_label: baseProgramLabel,
          teacher_id: baseTeacher.id,
        }))
        programScheduleRef.current = entries
        globalScheduleRef.current = entries
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

function renderPlanner(initialEntries: string[] = ['/app/schedule-planner']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MantineProvider>
        <SchedulePlanner />
      </MantineProvider>
    </MemoryRouter>
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

  it('resalta opciones conflictivas cuando la sala ya está ocupada', async () => {
    const occupiedEntry = {
      id: 777,
      course_id: baseCourse.id,
      course_name: baseCourseLabel,
      room_id: baseRoom.id,
      timeslot_id: baseTimeslot.id,
      room_code: baseRoom.code,
      day_of_week: baseTimeslot.day_of_week,
      start_time: '09:00',
      end_time: '10:00',
      duration_minutes: 60,
      start_offset_minutes: 0,
      program_id: baseProgram.id,
      program_semester_id: baseSemester.id,
      program_semester_label: baseProgramLabel,
      teacher_id: baseTeacher.id,
    }
    programScheduleRef.current = [occupiedEntry]
    globalScheduleRef.current = [occupiedEntry]

    renderPlanner()

    await waitFor(() => expect(designerRef.current).toBeTruthy())

    await act(async () => {
      designerRef.current.onCourseDrop(baseCourse.id, baseTimeslot.id)
    })

    expect(
      await screen.findByText('No hay espacio disponible en este bloque para la sala seleccionada.'),
    ).toBeInTheDocument()

    await screen.findByRole('button', { name: 'Guardar cambios' })

    const roomInput = screen.getByPlaceholderText('Selecciona una sala') as HTMLInputElement
    await waitFor(() => expect(roomInput).toHaveStyle('color: #fa5252'))

    await waitFor(() => {
      const alertElement = screen.getByRole('alert')
      expect(alertElement).toBeInTheDocument()
      expect(screen.queryAllByText(baseCourseLabel, { exact: false }).length).toBeGreaterThan(0)
      expect(screen.queryAllByText(baseProgramLabel, { exact: false }).length).toBeGreaterThan(0)
    })

    fireEvent.mouseDown(roomInput)
    const roomOptionNodes = await screen.findAllByText('LAB-101 (30 personas)')
    const roomOption = roomOptionNodes.find((node) => node.closest('[data-combobox-option]'))
    expect(roomOption).toBeTruthy()
    expect(roomOption).toHaveStyle({ color: 'rgb(250, 82, 82)' })

    const timeslotInput = screen.getByPlaceholderText('Selecciona un bloque') as HTMLInputElement
    await waitFor(() => expect(timeslotInput).toHaveStyle('color: #fa5252'))

    fireEvent.mouseDown(timeslotInput)
    const timeslotOptionNodes = await screen.findAllByText('Miércoles · 09:00-10:00')
    const timeslotOption = timeslotOptionNodes.find((node) => node.closest('[data-combobox-option]'))
    expect(timeslotOption).toBeTruthy()
    expect(timeslotOption).toHaveStyle({ color: 'rgb(250, 82, 82)' })
  })

  it('detecta conflictos cuando otra carrera ocupa la sala', async () => {
    const foreignEntry = {
      id: 888,
      course_id: baseCourse.id + 1,
      course_name: foreignCourseLabel,
      room_id: baseRoom.id,
      timeslot_id: baseTimeslot.id,
      room_code: baseRoom.code,
      day_of_week: baseTimeslot.day_of_week,
      start_time: '09:00',
      end_time: '10:00',
      duration_minutes: 60,
      start_offset_minutes: 0,
      program_id: baseProgram.id + 1,
      program_semester_id: baseSemester.id + 1,
      program_semester_label: foreignProgramLabel,
      teacher_id: baseTeacher.id,
    }
    programScheduleRef.current = []
    globalScheduleRef.current = [foreignEntry]

    renderPlanner()

    await waitFor(() => expect(designerRef.current).toBeTruthy())

    await act(async () => {
      designerRef.current.onCourseDrop(baseCourse.id, baseTimeslot.id)
    })

    expect(
      await screen.findByText('No hay espacio disponible en este bloque para la sala seleccionada.'),
    ).toBeInTheDocument()

    const roomInput = screen.getByPlaceholderText('Selecciona una sala') as HTMLInputElement
    await waitFor(() => expect(roomInput).toHaveStyle('color: #fa5252'))

    await waitFor(() => {
      const alertElement = screen.getByRole('alert')
      expect(alertElement).toBeInTheDocument()
      expect(screen.queryAllByText(foreignCourseLabel, { exact: false }).length).toBeGreaterThan(0)
      expect(screen.queryAllByText(foreignProgramLabel, { exact: false }).length).toBeGreaterThan(0)
    })

    fireEvent.mouseDown(roomInput)
    const roomOptionNodes = await screen.findAllByText('LAB-101 (30 personas)')
    const roomOption = roomOptionNodes.find((node) => node.closest('[data-combobox-option]'))
    expect(roomOption).toBeTruthy()
    expect(roomOption).toHaveStyle({ color: 'rgb(250, 82, 82)' })

    const timeslotInput = screen.getByPlaceholderText('Selecciona un bloque') as HTMLInputElement
    await waitFor(() => expect(timeslotInput).toHaveStyle('color: #fa5252'))

    fireEvent.mouseDown(timeslotInput)
    const timeslotOptionNodes = await screen.findAllByText('Miércoles · 09:00-10:00')
    const timeslotOption = timeslotOptionNodes.find((node) => node.closest('[data-combobox-option]'))
    expect(timeslotOption).toBeTruthy()
    expect(timeslotOption).toHaveStyle({ color: 'rgb(250, 82, 82)' })
  })

  it('mantiene el modal abierto y muestra el error del backend', async () => {
    renderPlanner()

    await waitFor(() => expect(designerRef.current).toBeTruthy())

    await act(async () => {
      designerRef.current.onCourseDrop(baseCourse.id, baseTimeslot.id)
    })

    postMock.mockRejectedValueOnce({
      response: { data: { detail: 'Conflicto detectado por el backend' } },
    })

    const submit = await screen.findByRole('button', { name: 'Guardar cambios' })
    fireEvent.click(submit)

    expect(await screen.findByText('Conflicto detectado por el backend')).toBeInTheDocument()
    expect(screen.getByText('No se pudo guardar el bloque')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
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

  it('adjunta conflictos docentes del horario global al optimizar', async () => {
    const foreignEntry = {
      id: 999,
      course_id: baseCourse.id + 99,
      course_name: foreignCourseLabel,
      room_id: baseRoom.id,
      timeslot_id: baseTimeslot.id,
      room_code: baseRoom.code,
      day_of_week: baseTimeslot.day_of_week,
      start_time: '09:00',
      end_time: '10:00',
      duration_minutes: 60,
      start_offset_minutes: 0,
      program_id: baseProgram.id + 1,
      program_semester_id: baseSemester.id + 1,
      program_semester_label: foreignProgramLabel,
      teacher_id: baseTeacher.id,
    }
    globalScheduleRef.current = [foreignEntry]

    renderPlanner()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ejecutar optimizador' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar optimizador' }))

    await waitFor(() => {
      const optimizeCall = postMock.mock.calls.find(([path]) => path === '/schedule/optimize')
      expect(optimizeCall).toBeTruthy()
      const [, payload] = optimizeCall!
      expect(payload.constraints.teacher_conflicts).toEqual({
        [baseTeacher.id]: [baseTimeslot.id],
      })
    })
  })

  it('deriva conflictos docentes del semestre activo cuando no hay horario global', async () => {
    const localEntry = {
      id: 1001,
      course_id: baseCourse.id + 50,
      course_name: foreignCourseLabel,
      room_id: baseRoom.id,
      timeslot_id: baseTimeslot.id,
      room_code: baseRoom.code,
      day_of_week: baseTimeslot.day_of_week,
      start_time: '09:00',
      end_time: '10:00',
      duration_minutes: 60,
      start_offset_minutes: 0,
      program_id: baseProgram.id,
      program_semester_id: baseSemester.id,
      program_semester_label: baseProgramLabel,
      teacher_id: baseTeacher.id,
    }
    programScheduleRef.current = [localEntry]
    globalScheduleRef.current = []

    renderPlanner()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ejecutar optimizador' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar optimizador' }))

    await waitFor(() => {
      const optimizeCall = postMock.mock.calls.find(([path]) => path === '/schedule/optimize')
      expect(optimizeCall).toBeTruthy()
      const [, payload] = optimizeCall!
      expect(payload.constraints.teacher_conflicts).toEqual({
        [baseTeacher.id]: [baseTimeslot.id],
      })
    })
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

  it('should handle incomplete quality metrics gracefully', async () => {
    setupApiMocks()

    postMock.mockImplementation((path: string) => {
      if (path === '/schedule/optimize') {
        return Promise.resolve({
          data: {
            assignments: [
              {
                course_id: baseCourse.id,
                room_id: baseRoom.id,
                timeslot_id: baseTimeslot.id,
                duration_minutes: 60,
                start_offset_minutes: 0,
              },
            ],
            unassigned: [],
            // Métricas parciales (simulando backend con error o versión antigua)
            quality_metrics: {
              balance_score: 75,
              total_assigned: 1,
              // avg_daily_load, max_daily_load y timeslot_utilization llegan como undefined
            },
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    await act(async () => {
      renderPlanner()
    })

    await waitFor(() => expect(screen.getByText(baseCourseLabel)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar optimizador' }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/schedule/optimize', expect.any(Object))
    })

    // Verificar que muestra el score disponible
    await waitFor(() => {
      expect(screen.getByText(/Score: 75\/100/i)).toBeInTheDocument()
    })

    // Verificar que el panel de métricas se renderiza sin crashear
    await waitFor(() => {
      expect(screen.getByText('Métricas de Calidad del Horario')).toBeInTheDocument()
    })

    // Verificar que muestra valores (aunque sean fallbacks)
    // El componente no debe crashear con métricas incompletas
    expect(screen.getByText(/Asignados/i)).toBeInTheDocument()
  })

  it('muestra métricas de rendimiento y diagnósticos del optimizador', async () => {
    renderPlanner()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ejecutar optimizador' })).toBeEnabled())

    postMock.mockImplementationOnce((path: string) => {
      expect(path).toBe('/schedule/optimize')
      return Promise.resolve({
        data: {
          assignments: [
            {
              course_id: baseCourse.id,
              room_id: baseRoom.id,
              timeslot_id: baseTimeslot.id,
              duration_minutes: 60,
              start_offset_minutes: 0,
            },
          ],
          unassigned: [{ course_id: baseCourse.id, remaining_minutes: 30 }],
          quality_metrics: {
            total_assigned: 1,
            balance_score: 80,
            avg_daily_load: 2,
            max_daily_load: 3,
            timeslot_utilization: 0.5,
            daily_overload_count: 0,
            unassigned_count: 1,
          },
          performance_metrics: {
            runtime_seconds: 0.456,
            requested_courses: 1,
            assigned_courses: 1,
            requested_minutes: 60,
            assigned_minutes: 30,
            fill_rate: 0.5,
          },
          diagnostics: {
            messages: ['Ejecución completada en 0.456 s.', 'Se asignaron 1 de 1 cursos solicitados.'],
            unassigned_causes: {
              [String(baseCourse.id)]: 'Sin bloques compatibles tras aplicar disponibilidad docente y jornadas.',
            },
          },
        },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar optimizador' }))

    await waitFor(() => expect(screen.getByText(/Desempeño del optimizador/i)).toBeInTheDocument())
    expect(screen.getByText(/Cobertura 50.0%/i)).toBeInTheDocument()
    expect(screen.getAllByText(/0.456 s/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Ejecución completada en 0.456 s\./i)).toBeInTheDocument()
    expect(screen.getByText(/Álgebra · 2025-1 · Grupo A/i)).toBeInTheDocument()
    expect(screen.getByText(/Sin bloques compatibles/i)).toBeInTheDocument()
  })
})
