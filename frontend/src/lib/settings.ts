import { useEffect } from 'react'
import { create } from 'zustand'

import { api } from './api'

export type SettingRecord = Record<string, string>

type SettingResponse = {
  key: string
  value?: string | null
  category?: string | null
}

type MergeOptions = {
  markAsLoaded?: boolean
  categories?: string | string[]
}

type CategoryState = Record<string, boolean>

type AppSettingsState = {
  values: SettingRecord
  loadingCategories: CategoryState
  loadedCategories: CategoryState
  error?: string
  fetchPublic: (category?: string) => Promise<void>
  mergeValues: (entries: SettingRecord, options?: MergeOptions) => void
}

const NO_CATEGORY = '__all__'

const normalizeCategory = (category?: string | null) => category?.trim() || NO_CATEGORY
const normalizeCategories = (input?: string | string[] | null): string[] => {
  if (!input) return [NO_CATEGORY]
  if (Array.isArray(input)) {
    const resolved = input.map(normalizeCategory).filter(Boolean)
    return resolved.length > 0 ? resolved : [NO_CATEGORY]
  }
  return [normalizeCategory(input)]
}

export const BRANDING_KEYS = {
  appName: 'branding.app_name',
  tagline: 'branding.tagline',
  logoUrl: 'branding.logo_url',
  primaryColor: 'branding.primary_color',
  portalUrl: 'branding.portal_url',
  enableLanding: 'branding.enable_landing',
} as const

export const BRANDING_DEFAULTS = {
  appName: 'AcademiaPro',
  tagline: '',
  logoUrl: '',
  primaryColor: '',
  portalUrl: '',
  enableLanding: 'true',
}

export const THEME_KEYS = {
  lightPrimary: 'theme.light_primary',
  lightSurface: 'theme.light_surface',
  lightAccent: 'theme.light_accent',
  darkPrimary: 'theme.dark_primary',
  darkSurface: 'theme.dark_surface',
  darkAccent: 'theme.dark_accent',
} as const

export const THEME_DEFAULTS = {
  light: {
    primary: '#4338ca',
    surface: '#f8fafc',
    accent: '#0ea5e9',
  },
  dark: {
    primary: '#a5b4fc',
    surface: '#0f172a',
    accent: '#34d399',
  },
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  values: {},
  loadingCategories: {},
  loadedCategories: {},
  error: undefined,
  async fetchPublic(category?: string) {
    const categoryKey = normalizeCategory(category)
    if (get().loadingCategories[categoryKey]) return
    set((state) => ({
      loadingCategories: { ...state.loadingCategories, [categoryKey]: true },
      error: undefined,
    }))
    try {
      const query = category ? `?category=${encodeURIComponent(category)}` : ''
      const { data } = await api.get<SettingResponse[]>(`/settings/public${query}`)
      const nextValues: SettingRecord = {}
      data.forEach((item) => {
        if (item.key) {
          nextValues[item.key] = item.value ?? ''
        }
      })
      set((state) => ({
        values: { ...state.values, ...nextValues },
        loadingCategories: { ...state.loadingCategories, [categoryKey]: false },
        loadedCategories: { ...state.loadedCategories, [categoryKey]: true },
      }))
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'No se pudo cargar la configuración pública.'
      set((state) => ({
        loadingCategories: { ...state.loadingCategories, [categoryKey]: false },
        error: detail,
      }))
    }
  },
  mergeValues(entries, options) {
    if (!entries || Object.keys(entries).length === 0) return
    set((state) => {
      const nextValues = { ...state.values, ...entries }
      let nextLoaded = state.loadedCategories
      if (options?.markAsLoaded) {
        const categories = normalizeCategories(options.categories)
        nextLoaded = { ...state.loadedCategories }
        categories.forEach((categoryKey) => {
          nextLoaded[categoryKey] = true
        })
      }
      return {
        values: nextValues,
        loadedCategories: nextLoaded,
      }
    })
  },
}))

function useCategoryLoader(category: string) {
  const isLoaded = useAppSettingsStore((state) => Boolean(state.loadedCategories[category]))
  const isLoading = useAppSettingsStore((state) => Boolean(state.loadingCategories[category]))
  const fetchPublic = useAppSettingsStore((state) => state.fetchPublic)

  useEffect(() => {
    if (!isLoaded && !isLoading) {
      void fetchPublic(category === NO_CATEGORY ? undefined : category)
    }
  }, [category, fetchPublic, isLoaded, isLoading])

  return { isLoaded, isLoading }
}

export function useBrandingSettings() {
  const values = useAppSettingsStore((state) => state.values)
  const { isLoaded, isLoading } = useCategoryLoader('branding')

  const appNameRaw = values[BRANDING_KEYS.appName]?.trim()
  const taglineRaw = values[BRANDING_KEYS.tagline]?.trim()
  const logoUrlRaw = values[BRANDING_KEYS.logoUrl]?.trim()
  const primaryColorRaw = values[BRANDING_KEYS.primaryColor]?.trim()
  const portalUrlRaw = values[BRANDING_KEYS.portalUrl]?.trim()
  const enableLandingRaw = values[BRANDING_KEYS.enableLanding]?.trim()
  const enableLanding = enableLandingRaw ? enableLandingRaw !== 'false' : BRANDING_DEFAULTS.enableLanding !== 'false'

  return {
    appName: appNameRaw || BRANDING_DEFAULTS.appName,
    tagline: taglineRaw || BRANDING_DEFAULTS.tagline,
    logoUrl: logoUrlRaw || BRANDING_DEFAULTS.logoUrl,
    primaryColor: primaryColorRaw || BRANDING_DEFAULTS.primaryColor,
    portalUrl: portalUrlRaw || BRANDING_DEFAULTS.portalUrl,
    enableLanding,
    loading: isLoading && !isLoaded,
    loaded: isLoaded,
  }
}

export function useThemePalette() {
  const values = useAppSettingsStore((state) => state.values)
  const { isLoaded, isLoading } = useCategoryLoader('theme')

  const resolve = (key: string, fallback: string) => values[key]?.trim() || fallback

  return {
    light: {
      primary: resolve(THEME_KEYS.lightPrimary, THEME_DEFAULTS.light.primary),
      surface: resolve(THEME_KEYS.lightSurface, THEME_DEFAULTS.light.surface),
      accent: resolve(THEME_KEYS.lightAccent, THEME_DEFAULTS.light.accent),
    },
    dark: {
      primary: resolve(THEME_KEYS.darkPrimary, THEME_DEFAULTS.dark.primary),
      surface: resolve(THEME_KEYS.darkSurface, THEME_DEFAULTS.dark.surface),
      accent: resolve(THEME_KEYS.darkAccent, THEME_DEFAULTS.dark.accent),
    },
    loading: isLoading && !isLoaded,
    loaded: isLoaded,
  }
}
