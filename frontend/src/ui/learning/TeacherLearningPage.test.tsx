/// <reference types="vitest/globals" />
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'

import TeacherLearningPage from './TeacherLearningPage'
import { useAppSettingsStore } from '../../lib/settings'
import { useAuth } from '../../lib/auth'
import { uploadFile } from '../../lib/files'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: {} })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: apiMock.get,
    post: apiMock.post,
    put: apiMock.put,
    delete: apiMock.delete,
    defaults: { headers: { common: {} } },
  },
}))

const learningModule = vi.hoisted(() => ({
  fetchCourses: vi.fn(),
  fetchCourseMaterials: vi.fn(),
  fetchAssignments: vi.fn(),
  createCourseMaterial: vi.fn(),
  updateCourseMaterial: vi.fn(),
  deleteCourseMaterial: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  fetchSubmissions: vi.fn(),
  gradeSubmission: vi.fn(),
}))

vi.mock('../../lib/learning', () => learningModule)

const filesModule = vi.hoisted(() => ({
  uploadFile: vi.fn(),
}))

vi.mock('../../lib/files', async () => {
  const actual = await vi.importActual<typeof import('../../lib/files')>('../../lib/files')
  return {
    ...actual,
    uploadFile: filesModule.uploadFile,
  }
})

const uploadFileMock = uploadFile as vi.MockedFunction<typeof uploadFile>

const defaultCourse = {
  id: 101,
  subject_id: 11,
  teacher_id: 7,
  program_semester_id: 5,
  term: '2025-1',
  group: 'A',
}

function getFileInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null
  if (!input) {
    throw new Error('No se encontró el input de archivos en el modal')
  }
  return input
}

function primeLearningMocks() {
  learningModule.fetchCourses.mockResolvedValue([defaultCourse])
  learningModule.fetchCourseMaterials.mockResolvedValue([])
  learningModule.fetchAssignments.mockResolvedValue([])
}

function renderTeacherPage() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/dashboard/teacher/learning']}>
        <TeacherLearningPage />
      </MemoryRouter>
    </MantineProvider>,
  )
}

async function bootstrapPage() {
  renderTeacherPage()
  await waitFor(() => expect(learningModule.fetchCourses).toHaveBeenCalled())
  await waitFor(() => expect(learningModule.fetchCourseMaterials).toHaveBeenCalledWith(defaultCourse.id))
  await waitFor(() => expect(learningModule.fetchAssignments).toHaveBeenCalledWith(defaultCourse.id))
}

beforeEach(() => {
  vi.clearAllMocks()
  primeLearningMocks()
  useAppSettingsStore.setState({
    values: {},
    loadingCategories: {},
    loadedCategories: { branding: true, theme: true },
    error: undefined,
  })
  useAuth.setState((state) => ({
    ...state,
    token: 'test-token',
    mustChangePassword: false,
  }))
})

describe('TeacherLearningPage uploads', () => {
  it('usa uploadFile para materiales y muestra la previsualización', async () => {
    uploadFileMock.mockResolvedValueOnce({
      id: 1,
      original_name: 'guia.png',
      download_url: 'https://files.test/files/guia.png',
      content_type: 'image/png',
      size_bytes: 2048,
      scope: 'course_material',
    })

    await bootstrapPage()

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo material' }))
    const dialog = await screen.findByRole('dialog', { name: /Nuevo material/i })
    const fileInput = getFileInput(dialog)
    const fakeFile = new File(['contenido'], 'insumo.pdf', { type: 'application/pdf' })

    await userEvent.upload(fileInput, fakeFile)

    await waitFor(() => expect(uploadFileMock).toHaveBeenCalledWith(fakeFile, 'course_material'))
    await waitFor(() => expect(within(dialog).getByText('guia.png')).toBeInTheDocument())

    expect(within(dialog).getByText('2.0 KB')).toBeInTheDocument()
    const preview = within(dialog).getByRole('img', { name: 'guia.png' })
    expect(preview).toBeInTheDocument()
    const viewLink = within(dialog).getByRole('link', { name: 'Ver archivo' })
    expect(viewLink).toHaveAttribute('href', 'https://files.test/files/guia.png?token=test-token')
  })

  it('muestra el error cuando la carga del adjunto falla', async () => {
    uploadFileMock.mockRejectedValueOnce(new Error('falló la carga'))

    await bootstrapPage()

    await userEvent.click(screen.getByRole('tab', { name: /Evaluaciones y tareas/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Nueva evaluación' }))
    const dialog = await screen.findByRole('dialog', { name: /Nueva evaluación/i })
    const fileInput = getFileInput(dialog)
    const fakeFile = new File(['demo'], 'tarea.pdf', { type: 'application/pdf' })

    await userEvent.upload(fileInput, fakeFile)

    await waitFor(() => expect(uploadFileMock).toHaveBeenCalledWith(fakeFile, 'assignment_attachment'))
    await waitFor(() => expect(within(dialog).getByText('falló la carga')).toBeInTheDocument())
    expect(within(dialog).queryByText(/Adjunto listo para los estudiantes/i)).not.toBeInTheDocument()
  })
})
