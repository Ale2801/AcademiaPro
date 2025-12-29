import { api } from './api'

export type UploadedFile = {
  id: number
  original_name: string
  content_type?: string | null
  size_bytes: number
  scope?: string | null
  download_url: string
}

export async function uploadFile(file: File, scope = 'general'): Promise<UploadedFile> {
  const data = new FormData()
  data.append('file', file)
  data.append('scope', scope)
  const response = await api.post<UploadedFile>('/files/upload', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

const FILES_PATH_PATTERN = /\/files\//i

const getOriginFallback = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  const baseURL = api.defaults?.baseURL
  if (typeof baseURL === 'string' && baseURL.startsWith('http')) {
    try {
      return new URL(baseURL).origin
    } catch {
      return 'http://localhost'
    }
  }
  return 'http://localhost'
}

export function buildAuthorizedFileUrl(url?: string | null, token?: string | null): string | undefined {
  if (!url) return undefined
  if (!token || !FILES_PATH_PATTERN.test(url)) return url
  const base = getOriginFallback()
  try {
    const target = new URL(url, base)
    if (!['http:', 'https:'].includes(target.protocol)) {
      return url
    }
    target.searchParams.set('token', token)
    return target.toString()
  } catch {
    return url
  }
}
