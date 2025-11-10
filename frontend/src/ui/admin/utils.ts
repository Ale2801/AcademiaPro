import { z } from 'zod'
import type { Field } from './types'

export function normalizeTimeString(value?: string | null) {
  if (!value) return ''
  const parts = value.split(':')
  if (parts.length < 2) return value
  const [hours, minutes] = parts
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

export function parseTimeString(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^([0-2]?\d):([0-5]\d)$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (hours < 0 || hours > 23) return null
  return hours * 60 + minutes
}

export function minutesToTimeLabel(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export function normalizePayload(fields: Field[], form: Record<string, any>) {
  const out: Record<string, any> = {}
  const zeroDefaultFields = new Set([
    'theoretical_hours_per_week',
    'practical_hours_per_week',
    'laboratory_hours_per_week',
    'weekly_autonomous_work_hours',
  ])
  for (const field of fields) {
    let value = form[field.name]
    if (value === '' || value === undefined || value === null) {
      if (zeroDefaultFields.has(field.name)) {
        out[field.name] = 0
      }
      continue
    }
    if (field.type === 'number') {
      const num = typeof value === 'number' ? value : value.toString().includes('.') ? parseFloat(value) : parseInt(value, 10)
      if (!Number.isNaN(num)) value = num
    }
    if (field.type === 'checkbox') value = Boolean(value)
    if (field.type === 'time' && typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
      value = `${value}:00`
    }
    out[field.name] = value
  }
  return out
}

export function buildSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    switch (field.type) {
      case 'number': {
        const preprocess = (val: unknown) => {
          if (val === '' || val === undefined || val === null) return undefined
          if (typeof val === 'number') return val
          const s = String(val)
          const n = s.includes('.') ? parseFloat(s) : parseInt(s, 10)
          return Number.isNaN(n) ? undefined : n
        }

        const baseNumber = z.number({ required_error: 'Requerido', invalid_type_error: 'Debe ser un número' })
        let numberSchema: z.ZodTypeAny = z.preprocess(preprocess, baseNumber)
        if (field.name === 'weight') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 1, { message: 'Debe estar entre 0 y 1' })
        if (field.name === 'score') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 100, { message: '0 a 100' })
        if (field.name === 'day_of_week') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 6, { message: '0=Lunes … 6=Domingo' })
        if (
          [
            'weekly_hours',
            'capacity',
            'pedagogical_hours_per_week',
            'theoretical_hours_per_week',
            'practical_hours_per_week',
            'laboratory_hours_per_week',
            'weekly_autonomous_work_hours',
          ].includes(field.name)
        ) {
          numberSchema = numberSchema.refine((n: number) => n >= 0, { message: 'Debe ser >= 0' })
        }
        if (field.required) {
          shape[field.name] = numberSchema
        } else {
          shape[field.name] = z.preprocess(
            preprocess,
            baseNumber.optional(),
          )
        }
        break
      }
      case 'date': {
        const schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD' })
        if (field.required) {
          shape[field.name] = schema
        } else {
          shape[field.name] = z.preprocess(
            (val) => (val === '' ? undefined : val),
            schema.optional(),
          )
        }
        break
      }
      case 'time': {
        const schema = z.string().regex(/^\d{2}:\d{2}$/, { message: 'Formato HH:MM' })
        if (field.required) {
          shape[field.name] = schema
        } else {
          shape[field.name] = z.preprocess(
            (val) => (val === '' ? undefined : val),
            schema.optional(),
          )
        }
        break
      }
      case 'checkbox': {
        const schema = z.boolean()
        shape[field.name] = field.required ? schema : schema.optional()
        break
      }
      case 'select': {
        const allowedValues = field.options?.map((option) => option.value) ?? []
        const validateOption = (val: unknown) => {
          if (val === undefined || val === null || val === '') {
            return !field.required
          }
          if (typeof val !== 'string') return false
          if (allowedValues.length === 0) return true
          return allowedValues.includes(val)
        }

        if (field.required) {
          let schema: z.ZodTypeAny = z.string({ required_error: 'Requerido' }).min(1, 'Requerido')
          if (allowedValues.length > 0) {
            schema = schema.refine((val) => validateOption(val), { message: 'Selecciona una opción válida' })
          }
          shape[field.name] = schema
        } else {
          let schema: z.ZodTypeAny = z.preprocess(
            (val) => (val === '' ? undefined : val),
            z.string().optional(),
          )
          if (allowedValues.length > 0) {
            schema = schema.refine((val) => validateOption(val), {
              message: 'Selecciona una opción válida',
            })
          }
          shape[field.name] = schema
        }
        break
      }
      case 'text':
      default: {
        const base = z.string().transform((val: string) => (val === '' ? undefined : val))
        shape[field.name] = field.required ? z.string().min(1, 'Requerido') : base.optional()
      }
    }
  }
  return z.object(shape)
}

export function endpointFor(fieldName: string): string | undefined {
  switch (fieldName) {
    case 'user_id':
      return '/users/'
    case 'program_id':
      return '/programs/'
    case 'subject_id':
      return '/subjects/'
    case 'teacher_id':
      return '/teachers/'
    case 'student_id':
      return '/students/'
    case 'course_id':
      return '/courses/'
    case 'room_id':
      return '/rooms/'
    case 'timeslot_id':
      return '/timeslots/'
    case 'program_semester_id':
      return '/program-semesters/'
    default:
      return undefined
  }
}

export function labelForOption(item: any): string {
  const primary = item?.name || item?.full_name || item?.label || item?.code || item?.email
  const secondary = item?.semester_number ? `Sem ${item.semester_number}` : item?.level
  if (!primary) return String(item?.id ?? '')
  if (secondary) return `${item.id} — ${primary} (${secondary})`
  return `${item.id} — ${primary}`
}
