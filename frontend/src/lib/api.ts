import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
})

export function setAuth(token?: string) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    // Cancela solicitudes en curso antes de limpiar el token
    try {
      // Vite/Axios 1.x: no hay cancelación global; se maneja por AbortController en cada request
    } catch {}
    delete api.defaults.headers.common['Authorization']
  }
}
