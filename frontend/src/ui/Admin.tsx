import React, { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { api } from '../lib/api'
import { TextInput, Checkbox, Button as MButton, Select as MSelect, Group } from '@mantine/core'

type Field = {
  name: string
  label?: string
  type: 'text' | 'number' | 'date' | 'time' | 'checkbox'
  placeholder?: string
  required?: boolean
}

type Section = {
  key: string
  title: string
  endpoint: string
  fields: Field[]
}

function normalizePayload(fields: Field[], form: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const f of fields) {
    let v = form[f.name]
    if (v === '' || v === undefined) continue
    if (f.type === 'number') {
      // Si ya es número (por zod), úsalo; si llega string, intenta parsear
      const num = typeof v === 'number' ? v : (v.toString().includes('.') ? parseFloat(v) : parseInt(v, 10))
      if (!Number.isNaN(num)) v = num
    }
    if (f.type === 'checkbox') v = Boolean(v)
    if (f.type === 'time') {
      // Asegura HH:MM:SS
      if (/^\d{2}:\d{2}$/.test(v)) v = `${v}:00`
    }
    out[f.name] = v
  }
  return out
}

function buildSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    switch (f.type) {
      case 'number': {
        const base = z.preprocess((val: unknown) => {
          if (val === '' || val === undefined || val === null) return undefined
          if (typeof val === 'number') return val
          const s = String(val)
          const n = s.includes('.') ? parseFloat(s) : parseInt(s, 10)
          return Number.isNaN(n) ? undefined : n
        }, z.number({ required_error: 'Requerido', invalid_type_error: 'Debe ser un número' }))
  let numberSchema: z.ZodTypeAny = base
  if (f.name === 'weight') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 1, { message: 'Debe estar entre 0 y 1' })
  if (f.name === 'score') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 100, { message: '0 a 100' })
  if (f.name === 'day_of_week') numberSchema = numberSchema.refine((n: number) => n >= 0 && n <= 6, { message: '0=Lunes … 6=Domingo' })
  if (['credits', 'weekly_hours', 'capacity'].includes(f.name)) numberSchema = numberSchema.refine((n: number) => n >= 0, { message: 'Debe ser >= 0' })
  shape[f.name] = f.required ? numberSchema : numberSchema.optional()
        break
      }
      case 'date': {
        const base = z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato YYYY-MM-DD' })
        shape[f.name] = f.required ? base : base.optional()
        break
      }
      case 'time': {
        const base = z
          .string()
          .regex(/^\d{2}:\d{2}$/, { message: 'Formato HH:MM' })
        shape[f.name] = f.required ? base : base.optional()
        break
      }
      case 'checkbox': {
        const base = z.boolean()
        shape[f.name] = f.required ? base : base.optional()
        break
      }
      case 'text':
      default: {
        const base = z.string().transform((v: string) => (v === '' ? undefined : v))
        shape[f.name] = f.required ? z.string().min(1, 'Requerido') : base.optional()
      }
    }
  }
  return z.object(shape)
}

function endpointFor(fieldName: string): string | undefined {
  switch (fieldName) {
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
    default:
      return undefined
  }
}

function labelForOption(item: any): string {
  const primary = item.name || item.full_name || item.code || item.email
  if (primary) return `${item.id} — ${primary}`
  return String(item.id ?? '')
}

function CrudSection({ section }: { section: Section }) {
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | undefined>()
  const [editingId, setEditingId] = useState<number | null>(null)
  const schema = useMemo(() => {
    let base: z.ZodTypeAny = buildSchema(section.fields)
    if (section.key === 'timeslots') {
      base = base.refine((data: any) => {
        const a = data.start_time as string | undefined
        const b = data.end_time as string | undefined
        if (!a || !b) return true
        return a < b
      }, { path: ['end_time'], message: 'La hora de término debe ser mayor a la de inicio' })
    }
    return base
  }, [section.fields, section.key])
  const { register, handleSubmit, reset, formState: { errors, isSubmitting }, control } = useForm<Record<string, any>>({
    resolver: zodResolver(schema),
    defaultValues: {},
  })
  const [selectOptions, setSelectOptions] = useState<Record<string, { value: string; label: string }[]>>({})

  const load = async () => {
    setLoading(true)
    setError(undefined)
    try {
      const { data } = await api.get(section.endpoint.endsWith('/') ? section.endpoint : section.endpoint + '/')
      setItems(data)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al cargar'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.endpoint])

  useEffect(() => {
    let cancelled = false
    const fieldsNeedingOptions = section.fields
      .map((f) => ({ f, ep: endpointFor(f.name) }))
      .filter((x): x is { f: Field; ep: string } => Boolean(x.ep))

    if (fieldsNeedingOptions.length === 0) {
      setSelectOptions({})
      return
    }

    ;(async () => {
      const accum: Record<string, { value: string; label: string }[]> = {}
      for (const { f, ep } of fieldsNeedingOptions) {
        try {
          const { data } = await api.get(ep)
          if (cancelled) return
          accum[f.name] = (Array.isArray(data) ? data : []).map((it: any) => ({ value: String(it.id), label: labelForOption(it) }))
        } catch {
          // ignora errores
        }
      }
      if (!cancelled) setSelectOptions(accum)
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.key])

  const onCreate = async (values: Record<string, any>) => {
    setError(undefined)
    setSuccess(undefined)
    try {
      const payload = normalizePayload(section.fields, values)
      if (editingId) {
        const base = section.endpoint.endsWith('/') ? section.endpoint.slice(0, -1) : section.endpoint
        await api.put(`${base}/${editingId}`, payload)
        setSuccess('Actualizado correctamente')
      } else {
        await api.post(section.endpoint.endsWith('/') ? section.endpoint : section.endpoint + '/', payload)
        setSuccess('Creado correctamente')
      }
      reset({})
      setEditingId(null)
      await load()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al crear'
      setError(detail)
    }
  }

  const onDelete = async (id: number) => {
    setError(undefined)
    setSuccess(undefined)
    try {
      if (typeof window !== 'undefined') {
        const ok = window.confirm('¿Eliminar este registro?')
        if (!ok) return
      }
      const base = section.endpoint.endsWith('/') ? section.endpoint.slice(0, -1) : section.endpoint
      await api.delete(`${base}/${id}`)
      setSuccess('Eliminado')
      await load()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al eliminar'
      setError(detail)
    }
  }

  return (
    <div>
      <h3>{section.title}</h3>
  {error && <p style={{ color: 'crimson' }}>{error}</p>}
  {success && <p style={{ color: 'seagreen' }}>{success}</p>}
      <form onSubmit={handleSubmit(onCreate)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {section.fields.map((f) => {
          const relationOptions = selectOptions[f.name]
          if (relationOptions && relationOptions.length > 0) {
            return (
              <div key={f.name} style={{ minWidth: 260 }}>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field }) => (
                    <MSelect
                      label={f.label || f.name}
                      placeholder={f.placeholder || (f.required ? 'Requerido' : 'Opcional')}
                      data={relationOptions}
                      value={field.value?.toString() ?? ''}
                      onChange={(val) => field.onChange(val ?? '')}
                      error={(errors as any)[f.name]?.message as string | undefined}
                      searchable
                      clearable={!f.required}
                      aria-invalid={errors[f.name] ? 'true' : 'false'}
                    />
                  )}
                />
                {errors[f.name] && (
                  <span role="alert" style={{ color: 'crimson', fontSize: 12 }}>
                    {(errors as any)[f.name]?.message as string}
                  </span>
                )}
              </div>
            )
          }
          if (f.type === 'checkbox') {
            return (
              <div key={f.name} style={{ display: 'flex', alignItems: 'end', minHeight: 54 }}>
                <Checkbox label={f.label || f.name} {...register(f.name)} />
              </div>
            )
          }
          return (
            <div key={f.name} style={{ minWidth: 220 }}>
              <TextInput
                label={f.label || f.name}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'}
                placeholder={f.placeholder || f.name}
                aria-invalid={errors[f.name] ? 'true' : 'false'}
                error={(errors as any)[f.name]?.message as string | undefined}
                {...register(f.name)}
              />
              {errors[f.name] && (
                <span role="alert" style={{ color: 'crimson', fontSize: 12 }}>
                  {(errors as any)[f.name]?.message as string}
                </span>
              )}
            </div>
          )
        })}
        <Group align="end" gap="sm">
          <MButton type="submit" color="dark" loading={isSubmitting}>{editingId ? 'Guardar' : 'Crear'}</MButton>
          <MButton variant="light" onClick={() => { reset({}); setEditingId(null); setError(undefined); setSuccess(undefined) }}>Limpiar</MButton>
        </Group>
      </form>
      {loading ? (
        <p>Cargando…</p>
      ) : items.length === 0 ? (
        <p>No hay registros</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {Object.keys(items[0]).map(k => (
                <th key={k} style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>{k}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(row => (
              <tr key={row.id}>
                {Object.keys(items[0]).map(k => (
                  <td key={k} style={{ padding: '4px 0' }}>{String(row[k])}</td>
                ))}
                <td>
                  <button onClick={() => {
                    // Pre-cargar valores en el formulario para editar
                    const values: Record<string, any> = {}
                    for (const f of section.fields) {
                      let v = row[f.name]
                      if (v === null || v === undefined) continue
                      if (f.type === 'time' && typeof v === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(v)) {
                        v = v.slice(0, 5)
                      }
                      values[f.name] = v
                    }
                    reset(values)
                    setEditingId(row.id)
                    setError(undefined)
                    setSuccess(undefined)
                  }}>Editar</button>
                  <button style={{ marginLeft: 8 }} onClick={() => onDelete(row.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function Admin() {
  const sections: Section[] = useMemo(() => ([
    { key: 'programs', title: 'Programas', endpoint: '/programs/', fields: [
      { name: 'code', type: 'text', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'level', type: 'text' },
      { name: 'duration_semesters', type: 'number' },
      { name: 'description', type: 'text' },
    ]},
    { key: 'students', title: 'Estudiantes', endpoint: '/students/', fields: [
      { name: 'user_id', type: 'number', required: true },
      { name: 'enrollment_year', type: 'number', required: true },
      { name: 'program_id', type: 'number' },
    ]},
    { key: 'teachers', title: 'Profesores', endpoint: '/teachers/', fields: [
      { name: 'user_id', type: 'number', required: true },
      { name: 'department', type: 'text' },
    ]},
    { key: 'subjects', title: 'Asignaturas', endpoint: '/subjects/', fields: [
      { name: 'code', type: 'text', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'credits', type: 'number', required: true },
  { name: 'program_id', type: 'number' },
    ]},
    { key: 'rooms', title: 'Salas', endpoint: '/rooms/', fields: [
      { name: 'code', type: 'text', required: true },
      { name: 'capacity', type: 'number', required: true },
      { name: 'building', type: 'text' },
    ]},
    { key: 'courses', title: 'Cursos', endpoint: '/courses/', fields: [
      { name: 'subject_id', type: 'number', required: true },
      { name: 'teacher_id', type: 'number', required: true },
      { name: 'term', type: 'text', required: true, placeholder: '2025-2' },
      { name: 'group', type: 'text', placeholder: 'A' },
      { name: 'weekly_hours', type: 'number' },
    ]},
    { key: 'timeslots', title: 'Bloques Horarios', endpoint: '/timeslots/', fields: [
      { name: 'day_of_week', type: 'number', required: true, placeholder: '0=Lunes' },
      { name: 'start_time', type: 'time', required: true },
      { name: 'end_time', type: 'time', required: true },
    ]},
    { key: 'course_schedules', title: 'Horarios de Curso', endpoint: '/course-schedules/', fields: [
  { name: 'course_id', type: 'number', required: true },
  { name: 'room_id', type: 'number', required: true },
  { name: 'timeslot_id', type: 'number', required: true },
    ]},
    { key: 'enrollments', title: 'Matrículas', endpoint: '/enrollments/', fields: [
  { name: 'student_id', type: 'number', required: true },
  { name: 'course_id', type: 'number', required: true },
    ]},
    { key: 'evaluations', title: 'Evaluaciones', endpoint: '/evaluations/', fields: [
  { name: 'course_id', type: 'number', required: true },
  { name: 'name', type: 'text', required: true },
  { name: 'weight', type: 'number', required: true },
    ]},
    { key: 'grades', title: 'Notas', endpoint: '/grades/', fields: [
  { name: 'enrollment_id', type: 'number', required: true },
  { name: 'evaluation_id', type: 'number', required: true },
  { name: 'score', type: 'number', required: true },
    ]},
    { key: 'attendance', title: 'Asistencia', endpoint: '/attendance/', fields: [
  { name: 'enrollment_id', type: 'number', required: true },
  { name: 'session_date', type: 'date', required: true },
      { name: 'present', type: 'checkbox' },
    ]},
  ]), [])

  const [active, setActive] = useState(sections[0].key)
  const current = sections.find(s => s.key === active)!

  return (
    <div>
      <h2>Panel Admin</h2>
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            style={{
      padding: '8px 12px',
      borderRadius: 8,
      border: '1px solid rgba(148,163,184,.35)',
      color: s.key === active ? 'white' : '#0f172a',
      background: s.key === active ? '#0f172a' : '#f1f5f9',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 1px 2px rgba(0,0,0,.05)',
      transition: 'transform .06s ease, background .2s ease',
      cursor: 'pointer'
            }}
          >{s.title}</button>
        ))}
      </div>
      <CrudSection section={current} />
    </div>
  )
}
