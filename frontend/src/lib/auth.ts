import { create } from 'zustand'
import { api, setAuth } from './api'

type AuthState = {
  token?: string
  mustChangePassword: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, full_name: string, password: string, role: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  logout: () => void
}

const TOKEN_STORAGE_KEY = 'authToken'
const MUST_CHANGE_STORAGE_KEY = 'authMustChangePassword'

const initialToken = (() => {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY) || undefined
    if (stored) setAuth(stored)
    return stored
  } catch {
    return undefined
  }
})()

const initialMustChange = (() => {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(MUST_CHANGE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
})()

const persistMustChange = (value: boolean) => {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      localStorage.setItem(MUST_CHANGE_STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(MUST_CHANGE_STORAGE_KEY)
    }
  } catch {
    /* ignore persistence failures */
  }
}

const persistToken = (value?: string) => {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      localStorage.setItem(TOKEN_STORAGE_KEY, value)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    /* ignore persistence failures */
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  token: initialToken,
  mustChangePassword: initialMustChange,
  async login(email, password) {
    const params = new URLSearchParams()
    params.set('grant_type', 'password')
    params.set('username', email)
    params.set('password', password)
    try {
      const { data } = await api.post('/auth/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      const mustChange = Boolean(data.must_change_password)
      setAuth(data.access_token)
      persistToken(data.access_token)
      persistMustChange(mustChange)
      set({ token: data.access_token, mustChangePassword: mustChange })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error de autenticación'
      throw new Error(detail)
    }
  },
  async signup(email, full_name, password, role) {
    try {
      const { data } = await api.post('/auth/signup', { email, full_name, password, role })
      const mustChange = Boolean(data.must_change_password)
      setAuth(data.access_token)
      persistToken(data.access_token)
      persistMustChange(mustChange)
      set({ token: data.access_token, mustChangePassword: mustChange })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al crear usuario'
      throw new Error(detail)
    }
  },
  async changePassword(currentPassword, newPassword) {
    try {
      const { data } = await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      const mustChange = Boolean(data.must_change_password)
      setAuth(data.access_token)
      persistToken(data.access_token)
      persistMustChange(mustChange)
      set({ token: data.access_token, mustChangePassword: mustChange })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo cambiar la contraseña'
      throw new Error(detail)
    }
  },
  logout() {
    setAuth(undefined)
    persistToken(undefined)
    persistMustChange(false)
    set({ token: undefined, mustChangePassword: false })
  }
}))
