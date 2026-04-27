import { defaultWeather } from '@/config/homeConfig'

export const WEATHER_GEO_CACHE_KEY = 'weather_geo_cache_v1'
export const WEATHER_DATA_CACHE_KEY = 'weather_today_cache_v1'
export const WEATHER_STALE_MS = 10 * 60 * 1000

export const GEO_STATUS = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
  WEATHER_ERROR: 'weather_error',
}

export const readSessionJson = (key) => {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const writeSessionJson = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export const normalizeWeatherData = (value) => {
  if (!value || typeof value !== 'object') return null

  return {
    city: value.city || defaultWeather.city,
    temp: value.temp || defaultWeather.temp,
    text: value.text || defaultWeather.text,
    weatherCode: typeof value.weatherCode === 'number' ? value.weatherCode : defaultWeather.weatherCode,
    isDay: typeof value.isDay === 'boolean' ? value.isDay : defaultWeather.isDay,
  }
}

export const readCachedWeatherMeta = () => {
  const cached = readSessionJson(WEATHER_DATA_CACHE_KEY)
  return {
    weather: normalizeWeatherData(cached?.weather ?? cached),
    fetchedAt: typeof cached?.fetchedAt === 'number' ? cached.fetchedAt : null,
  }
}

export const readCachedGeoCoords = () => {
  const cached = readSessionJson(WEATHER_GEO_CACHE_KEY)
  if (
    Number.isFinite(cached?.coords?.latitude) &&
    Number.isFinite(cached?.coords?.longitude)
  ) {
    return cached.coords
  }
  return null
}

export const isGeoSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.geolocation)

export const isSecureGeoContext = () => {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location?.hostname
  return host === 'localhost' || host === '127.0.0.1'
}
