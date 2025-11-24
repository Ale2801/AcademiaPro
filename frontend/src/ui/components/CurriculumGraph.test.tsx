/// <reference types="vitest/globals" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import CurriculumGraph from './CurriculumGraph'

const apiModule = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: apiModule.get,
  },
}))

const apiGet = apiModule.get

function renderComponent() {
  return render(
    <MantineProvider>
      <CurriculumGraph />
    </MantineProvider>,
  )
}

describe('CurriculumGraph', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiGet.mockImplementation((path: string) => {
      if (path === '/programs/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Ingeniería', code: 'ING' }] })
      }
      if (path === '/program-semesters/') {
        return Promise.resolve({
          data: [
            { id: 10, program_id: 1, semester_number: 1 },
            { id: 11, program_id: 1, semester_number: 2 },
            { id: 12, program_id: 1, semester_number: 3 },
          ],
        })
      }
      if (path === '/courses/') {
        return Promise.resolve({
          data: [
            { id: 200, program_semester_id: 10, subject_id: 100 },
            { id: 201, program_semester_id: 11, subject_id: 200 },
            { id: 202, program_semester_id: 12, subject_id: 300 },
          ],
        })
      }
      if (path === '/subjects/') {
        return Promise.resolve({
          data: [
            { id: 100, name: 'Álgebra I', code: 'MAT101', prerequisite_subject_ids: [] },
            { id: 200, name: 'Álgebra II', code: 'MAT201', prerequisite_subject_ids: [100] },
            { id: 300, name: 'Álgebra III', code: 'MAT301', prerequisite_subject_ids: [200] },
          ],
        })
      }
      throw new Error(`Unexpected path: ${path}`)
    })
  })

  it('renderiza semestres y resalta prerrequisitos al hacer hover', async () => {
    const { container } = renderComponent()

    await waitFor(() => expect(screen.getByText('Semestre 1')).toBeInTheDocument())
    expect(screen.getByText('Semestre 2')).toBeInTheDocument()
    expect(screen.getByText('Semestre 3')).toBeInTheDocument()
    expect(screen.getByText('Total de cursos: 3')).toBeInTheDocument()
    expect(container.querySelectorAll('line')).toHaveLength(0)

    const advancedCourse = screen.getByText('Álgebra II')
    fireEvent.mouseEnter(advancedCourse)

    const advancedCard = advancedCourse.closest('[data-node-state]')
    const baseCard = screen.getByText('Álgebra I').closest('[data-node-state]')
    const dependentCard = screen.getByText('Álgebra III').closest('[data-node-state]')

    await waitFor(() => {
      expect(advancedCard).toHaveAttribute('data-node-state', 'active')
      expect(baseCard).toHaveAttribute('data-node-state', 'prerequisite')
      expect(dependentCard).toHaveAttribute('data-node-state', 'dependent')
      expect(container.querySelectorAll('line').length).toBeGreaterThan(0)
    })

    fireEvent.mouseLeave(advancedCourse)

    await waitFor(() => {
      expect(advancedCard).toHaveAttribute('data-node-state', 'default')
      expect(baseCard).toHaveAttribute('data-node-state', 'default')
      expect(dependentCard).toHaveAttribute('data-node-state', 'default')
      expect(container.querySelectorAll('line')).toHaveLength(0)
    })
  })
})
