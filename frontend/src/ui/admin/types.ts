import type { ComponentType } from 'react'

export type FieldOption = {
  value: string
  label: string
}

export type Field = {
  name: string
  label?: string
  type: 'text' | 'number' | 'date' | 'time' | 'checkbox' | 'select' | 'multiselect'
  placeholder?: string
  required?: boolean
  options?: FieldOption[]
}

export type Section = {
  key: string
  title: string
  endpoint: string
  fields: Field[]
  description: string
  icon: ComponentType<{ size?: number | string }>
}

export type TimeslotRecord = {
  id?: number
  day_of_week: number
  start_time: string
  end_time: string
  campus?: string | null
  comment?: string | null
}

export type ProgramRecord = {
  id: number
  code?: string
  name?: string
  level?: string
  duration_semesters?: number
  description?: string
  is_active?: boolean
  [key: string]: unknown
}
