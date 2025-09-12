import { create } from 'zustand'
import { api, setAuth } from './api'

type AuthState = {
  token?: string
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, full_name: string, password: string, role: string) => Promise<void>
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  token: undefined,
  async login(email, password) {
    const params = new URLSearchParams()
    params.set('grant_type', 'password')
    params.set('username', email)
    params.set('password', password)
    try {
      const { data } = await api.post('/auth/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
  setAuth(data.access_token)
  try { localStorage.setItem('authToken', data.access_token) } catch {}
      set({ token: data.access_token })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error de autenticación'
      throw new Error(detail)
    }
  },
  async signup(email, full_name, password, role) {
    try {
      const { data } = await api.post('/auth/signup', { email, full_name, password, role })
  setAuth(data.access_token)
  try { localStorage.setItem('authToken', data.access_token) } catch {}
      set({ token: data.access_token })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al crear usuario'
      throw new Error(detail)
    }
  },
  logout() {
    setAuth(undefined)
  try { localStorage.removeItem('authToken') } catch {}
    set({ token: undefined })
  }
}))
