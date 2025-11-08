import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

export type ProgramSemesterState = 'planned' | 'current' | 'finished'

export type ProgramSemesterSummary = {
  id: number
  semester_number: number
  label?: string | null
  description?: string | null
  is_active: boolean
  state: ProgramSemesterState
}

export type StudentProgramEnrollmentSummary = {
  enrollment_id: number
  enrolled_at: string
  status: 'active' | 'completed' | 'withdrawn'
  program_semester: ProgramSemesterSummary
}

export type StudentSemesterSelectionResponse = {
  current: StudentProgramEnrollmentSummary | null
  available: ProgramSemesterSummary[]
  history: StudentProgramEnrollmentSummary[]
  registration_number?: string | null
}

type StudentSemesterContextValue = {
  data: StudentSemesterSelectionResponse | null
  loading: boolean
  error: string | null
  needsSelection: boolean
  selecting: boolean
  refresh: () => Promise<StudentSemesterSelectionResponse | null>
  selectSemester: (semesterId: number) => Promise<StudentSemesterSelectionResponse>
}

const StudentSemesterContext = createContext<StudentSemesterContextValue | null>(null)

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const detail = (error as any)?.response?.data?.detail
    if (typeof detail === 'string') return detail
    const message = (error as any)?.message
    if (typeof message === 'string') return message
  }
  return 'No se pudo obtener la información de matrícula'
}

export function StudentSemesterProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<StudentSemesterSelectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)

  const fetchSemesters = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<StudentSemesterSelectionResponse>('/student-schedule/semesters')
      setData(response.data)
      return response.data
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      setData(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSemesters()
  }, [fetchSemesters])

  const selectSemester = useCallback(async (semesterId: number) => {
    setSelecting(true)
    try {
      const response = await api.post<StudentSemesterSelectionResponse>('/student-schedule/semesters', {
        program_semester_id: semesterId,
      })
      setData(response.data)
      setError(null)
      return response.data
    } catch (err) {
      const message = getErrorMessage(err)
      const error = new Error(message)
      ;(error as any).cause = err
      throw error
    } finally {
      setSelecting(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    return fetchSemesters()
  }, [fetchSemesters])

  const needsSelection = useMemo(() => !data?.current, [data])

  const value = useMemo<StudentSemesterContextValue>(
    () => ({ data, loading, error, needsSelection, selecting, refresh, selectSemester }),
    [data, loading, error, needsSelection, selecting, refresh, selectSemester],
  )

  return <StudentSemesterContext.Provider value={value}>{children}</StudentSemesterContext.Provider>
}

export function useStudentSemesters(): StudentSemesterContextValue {
  const ctx = useContext(StudentSemesterContext)
  if (!ctx) {
    throw new Error('useStudentSemesters must be used within a StudentSemesterProvider')
  }
  return ctx
}

export { getErrorMessage as getSemesterErrorMessage }
