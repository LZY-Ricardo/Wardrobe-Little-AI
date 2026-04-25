const axios = require('axios')

const DEFAULT_CITY = process.env.WEATHER_CITY || '上海'
const DEFAULT_LAT = Number.parseFloat(process.env.WEATHER_LAT) || 31.2304
const DEFAULT_LON = Number.parseFloat(process.env.WEATHER_LON) || 121.4737
const DEFAULT_TAGS = (process.env.WEATHER_TAGS || '热门,推荐,新品,精选')
  .split(',')
  .map((tag) => tag.trim())
  .filter(Boolean)

const PROVIDER = process.env.WEATHER_PROVIDER || 'open-meteo'
const TIMEOUT_MS = Number.parseInt(process.env.WEATHER_TIMEOUT_MS, 10) || 8000
const CACHE_TTL_MS = Number.parseInt(process.env.WEATHER_CACHE_TTL_MS, 10) || 10 * 60 * 1000

const GEOCODE_PROVIDER = process.env.GEOCODE_PROVIDER || 'bigdatacloud'
const GEOCODE_ENABLED = (process.env.GEOCODE_ENABLED ?? 'true').toLowerCase() !== 'false'
const GEOCODE_TIMEOUT_MS = Number.parseInt(process.env.GEOCODE_TIMEOUT_MS, 10) || 4000
const GEOCODE_CACHE_TTL_MS = Number.parseInt(process.env.GEOCODE_CACHE_TTL_MS, 10) || 24 * 60 * 60 * 1000
const GEOCODE_MIN_INTERVAL_MS = Number.parseInt(process.env.GEOCODE_MIN_INTERVAL_MS, 10) || 1100
const GEOCODE_USER_AGENT = process.env.GEOCODE_USER_AGENT || 'aiclothes-dev/1.0'

const FALLBACK_TEMP = process.env.WEATHER_FALLBACK_TEMP || '25℃'
const FALLBACK_TEXT = process.env.WEATHER_FALLBACK_TEXT || '多云'

const todayCacheByKey = new Map()
const forecastCacheByKey = new Map()
const cityCacheByKey = new Map()
const inflightCityByKey = new Map()
const citySearchCacheByKey = new Map()
const inflightCitySearchByKey = new Map()

let lastGeocodeRequestAt = 0
let geocodeQueue = Promise.resolve()

const parseOptionalFloat = (value) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

const parseCoordsFromQuery = (query) => {
  const latitude = parseOptionalFloat(query?.lat ?? query?.latitude)
  const longitude = parseOptionalFloat(query?.lon ?? query?.longitude)
  if (latitude === null || longitude === null) return null
  if (latitude < -90 || latitude > 90) return null
  if (longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

const toCacheKey = (coords) => {
  if (!coords) return 'default'
  const latKey = coords.latitude.toFixed(3)
  const lonKey = coords.longitude.toFixed(3)
  return `${latKey},${lonKey}`
}

const resolveCityLabel = (query, coords) => {
  const city = typeof query?.city === 'string' ? query.city.trim() : ''
  if (city) return city.slice(0, 32)
  if (coords) return '当前位置'
  return DEFAULT_CITY
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeCityName = (name) => {
  const value = typeof name === 'string' ? name.trim() : ''
  if (!value) return null
  return value.endsWith('市') ? value.slice(0, -1) : value
}

const extractCityFromAddress = (address) =>
  normalizeCityName(
    address?.city ||
      address?.town ||
      address?.municipality ||
      address?.county ||
      address?.state ||
      address?.region ||
      address?.province
  )

const extractCityFromBigDataCloud = (data) =>
  normalizeCityName(
    data?.city ||
      data?.locality ||
      data?.principalSubdivision ||
      data?.administrativeArea ||
      data?.region
  )

const scheduleGeocode = (task) => {
  const run = async () => {
    const now = Date.now()
    const waitMs = GEOCODE_MIN_INTERVAL_MS - (now - lastGeocodeRequestAt)
    if (waitMs > 0) await sleep(waitMs)
    lastGeocodeRequestAt = Date.now()
    return task()
  }

  const chained = geocodeQueue.then(run, run)
  geocodeQueue = chained.catch(() => {})
  return chained
}

const reverseGeocodeCityNominatim = async (coords) => {
  const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
    timeout: GEOCODE_TIMEOUT_MS,
    proxy: false,
    headers: { 'User-Agent': GEOCODE_USER_AGENT },
    params: {
      format: 'jsonv2',
      lat: coords.latitude,
      lon: coords.longitude,
      'accept-language': 'zh-CN',
    },
  })

  return extractCityFromAddress(res?.data?.address)
}

const reverseGeocodeCityBigDataCloud = async (coords) => {
  const res = await axios.get('https://api.bigdatacloud.net/data/reverse-geocode-client', {
    timeout: GEOCODE_TIMEOUT_MS,
    proxy: false,
    headers: { 'User-Agent': GEOCODE_USER_AGENT },
    params: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      localityLanguage: 'zh',
    },
  })

  return extractCityFromBigDataCloud(res?.data)
}

const resolveCityFromCoords = async (coords) => {
  if (!GEOCODE_ENABLED) return null
  if (GEOCODE_PROVIDER !== 'nominatim' && GEOCODE_PROVIDER !== 'bigdatacloud') return null

  const cacheKey = toCacheKey(coords)
  const now = Date.now()
  const cached = cityCacheByKey.get(cacheKey)
  if (cached?.city && now - cached.at < GEOCODE_CACHE_TTL_MS) return cached.city

  const inflight = inflightCityByKey.get(cacheKey)
  if (inflight) return inflight

  const promise = scheduleGeocode(async () => {
    try {
      const city =
        GEOCODE_PROVIDER === 'bigdatacloud'
          ? await reverseGeocodeCityBigDataCloud(coords)
          : await reverseGeocodeCityNominatim(coords)
      if (city) {
        cityCacheByKey.set(cacheKey, { at: Date.now(), city })
      }
      return city
    } catch {
      return null
    } finally {
      inflightCityByKey.delete(cacheKey)
    }
  })

  inflightCityByKey.set(cacheKey, promise)
  return promise
}

const forwardGeocodeCityOpenMeteo = async (city) => {
  const normalizedCity = normalizeCityName(city)
  if (!normalizedCity) return null

  const cacheKey = normalizedCity.toLowerCase()
  const now = Date.now()
  const cached = citySearchCacheByKey.get(cacheKey)
  if (cached?.coords && now - cached.at < GEOCODE_CACHE_TTL_MS) {
    return cached.coords
  }

  const inflight = inflightCitySearchByKey.get(cacheKey)
  if (inflight) return inflight

  const promise = scheduleGeocode(async () => {
    try {
      const res = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        timeout: GEOCODE_TIMEOUT_MS,
        proxy: false,
        headers: { 'User-Agent': GEOCODE_USER_AGENT },
        params: {
          name: normalizedCity,
          count: 1,
          language: 'zh',
          format: 'json',
        },
      })
      const item = Array.isArray(res?.data?.results) ? res.data.results[0] : null
      const latitude = parseOptionalFloat(item?.latitude)
      const longitude = parseOptionalFloat(item?.longitude)
      if (latitude === null || longitude === null) return null

      const coords = {
        latitude,
        longitude,
        city: normalizeCityName(item?.name) || normalizedCity,
      }
      citySearchCacheByKey.set(cacheKey, { at: Date.now(), coords })
      return coords
    } catch {
      return null
    } finally {
      inflightCitySearchByKey.delete(cacheKey)
    }
  })

  inflightCitySearchByKey.set(cacheKey, promise)
  return promise
}

const getTextFromWmoCode = (code) => {
  const numericCode = Number(code)
  if (!Number.isFinite(numericCode)) return '未知'
  if (numericCode === 0) return '晴'
  if (numericCode === 1) return '大部晴朗'
  if (numericCode === 2) return '局部多云'
  if (numericCode === 3) return '阴'
  if (numericCode === 45 || numericCode === 48) return '雾'
  if (numericCode >= 51 && numericCode <= 57) return '毛毛雨'
  if (numericCode >= 61 && numericCode <= 67) return '雨'
  if ((numericCode >= 71 && numericCode <= 77) || (numericCode >= 85 && numericCode <= 86)) return '雪'
  if (numericCode === 80 || numericCode === 81 || numericCode === 82) return '阵雨'
  if (numericCode === 95 || numericCode === 96 || numericCode === 99) return '雷暴'
  return '未知'
}

const formatRangeTemp = (min, max) => {
  const safeMin = Number.isFinite(min) ? Math.round(min) : null
  const safeMax = Number.isFinite(max) ? Math.round(max) : null
  if (safeMin === null && safeMax === null) return FALLBACK_TEMP
  if (safeMin === null) return `${safeMax}℃`
  if (safeMax === null) return `${safeMin}℃`
  return safeMin === safeMax ? `${safeMin}℃` : `${safeMin}~${safeMax}℃`
}

const getTodayDateString = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

const normalizeDateString = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  return normalized
}

const fetchOpenMeteoToday = async (coords) => {
  const latitude = coords?.latitude ?? DEFAULT_LAT
  const longitude = coords?.longitude ?? DEFAULT_LON
  const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
    timeout: TIMEOUT_MS,
    proxy: false,
    params: {
      latitude,
      longitude,
      current: 'temperature_2m,weather_code,is_day',
      timezone: 'Asia/Shanghai',
    },
  })

  const current = res?.data?.current
  const temperature = current?.temperature_2m
  const weatherCodeRaw = current?.weather_code
  const isDayRaw = current?.is_day
  const weatherCode = Number(weatherCodeRaw)

  if (!Number.isFinite(temperature)) {
    throw new Error('INVALID_WEATHER_RESPONSE')
  }

  return {
    temp: `${Math.round(temperature)}℃`,
    text: getTextFromWmoCode(weatherCode),
    weatherCode: Number.isFinite(weatherCode) ? weatherCode : null,
    isDay: typeof isDayRaw === 'number' ? isDayRaw === 1 : null,
  }
}

const fetchOpenMeteoForecast = async (coords, date) => {
  const latitude = coords?.latitude ?? DEFAULT_LAT
  const longitude = coords?.longitude ?? DEFAULT_LON
  const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
    timeout: TIMEOUT_MS,
    proxy: false,
    params: {
      latitude,
      longitude,
      daily:
        'weather_code,temperature_2m_min,temperature_2m_max,apparent_temperature_min,apparent_temperature_max',
      timezone: 'Asia/Shanghai',
      start_date: date,
      end_date: date,
    },
  })

  const daily = res?.data?.daily
  const targetDate = Array.isArray(daily?.time) ? daily.time[0] : null
  const weatherCode = Number(Array.isArray(daily?.weather_code) ? daily.weather_code[0] : null)
  const tempMin = Number(Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min[0] : null)
  const tempMax = Number(Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max[0] : null)
  const apparentTempMin = Number(
    Array.isArray(daily?.apparent_temperature_min) ? daily.apparent_temperature_min[0] : null
  )
  const apparentTempMax = Number(
    Array.isArray(daily?.apparent_temperature_max) ? daily.apparent_temperature_max[0] : null
  )

  if (!targetDate || !Number.isFinite(tempMin) || !Number.isFinite(tempMax)) {
    throw new Error('INVALID_FORECAST_RESPONSE')
  }

  return {
    date: targetDate,
    text: getTextFromWmoCode(weatherCode),
    weatherCode: Number.isFinite(weatherCode) ? weatherCode : null,
    temp: formatRangeTemp(tempMin, tempMax),
    tempMin: Math.round(tempMin),
    tempMax: Math.round(tempMax),
    apparentTempMin: Number.isFinite(apparentTempMin) ? Math.round(apparentTempMin) : null,
    apparentTempMax: Number.isFinite(apparentTempMax) ? Math.round(apparentTempMax) : null,
  }
}

const parseFallbackTempValue = () => {
  const match = String(FALLBACK_TEMP).match(/-?\d+/)
  if (!match) return 25
  const numeric = Number(match[0])
  return Number.isFinite(numeric) ? numeric : 25
}

const buildFallback = (city) => ({
  city,
  temp: FALLBACK_TEMP,
  text: FALLBACK_TEXT,
  weatherCode: null,
  isDay: null,
  tags: DEFAULT_TAGS,
  source: 'fallback',
  updatedAt: new Date().toISOString(),
})

const buildFallbackForecast = (city, date) => {
  const baseTemp = parseFallbackTempValue()
  return {
    city,
    date,
    text: FALLBACK_TEXT,
    weatherCode: null,
    temp: FALLBACK_TEMP,
    tempMin: baseTemp,
    tempMax: baseTemp,
    apparentTempMin: baseTemp,
    apparentTempMax: baseTemp,
    tags: DEFAULT_TAGS,
    source: 'fallback',
    updatedAt: new Date().toISOString(),
  }
}

const getTodayWeather = async (query = {}) => {
  const coords = parseCoordsFromQuery(query)
  const cacheKey = toCacheKey(coords)
  const now = Date.now()
  const cached = todayCacheByKey.get(cacheKey)

  const explicitCity =
    typeof query?.city === 'string' && query.city.trim() ? query.city.trim().slice(0, 32) : ''
  const hasExplicitCity = Boolean(explicitCity)
  const isPlaceholderCity = (value) => value === '当前位置' || !value

  const baseCity = resolveCityLabel(query, coords)
  const shouldTryGeocode = Boolean(coords) && !hasExplicitCity

  if (cached?.data && now - cached.at < CACHE_TTL_MS) {
    if (hasExplicitCity) {
      if (explicitCity && explicitCity !== cached.data.city) {
        const patched = { ...cached.data, city: explicitCity }
        todayCacheByKey.set(cacheKey, { at: cached.at, data: patched })
        return patched
      }
      return cached.data
    }

    if (!shouldTryGeocode || !isPlaceholderCity(cached.data.city)) return cached.data

    const resolvedCity = await resolveCityFromCoords(coords)
    if (!resolvedCity || isPlaceholderCity(resolvedCity)) return cached.data

    const patched = { ...cached.data, city: resolvedCity }
    todayCacheByKey.set(cacheKey, { at: cached.at, data: patched })
    return patched
  }

  const cityPromise = shouldTryGeocode ? resolveCityFromCoords(coords) : Promise.resolve(null)

  let data
  try {
    if (PROVIDER === 'open-meteo') {
      const [real, resolvedCity] = await Promise.all([fetchOpenMeteoToday(coords), cityPromise])
      data = {
        city: resolvedCity || baseCity,
        temp: real.temp,
        text: real.text,
        weatherCode: real.weatherCode,
        isDay: real.isDay,
        tags: DEFAULT_TAGS,
        source: 'open-meteo',
        updatedAt: new Date().toISOString(),
      }
    } else {
      const resolvedCity = await cityPromise
      data = { ...buildFallback(resolvedCity || baseCity), source: 'mock' }
    }
  } catch {
    const resolvedCity = await cityPromise.catch(() => null)
    data = buildFallback(resolvedCity || baseCity)
  }

  todayCacheByKey.set(cacheKey, { at: now, data })
  return data
}

const resolveForecastLocation = async (query = {}) => {
  const coords = parseCoordsFromQuery(query)
  const explicitCity = normalizeCityName(query?.city)

  if (coords) {
    if (explicitCity) {
      return { coords, city: explicitCity }
    }
    const resolvedCity = await resolveCityFromCoords(coords)
    return { coords, city: resolvedCity || resolveCityLabel(query, coords) }
  }

  if (explicitCity) {
    const geocoded = await forwardGeocodeCityOpenMeteo(explicitCity)
    if (geocoded) {
      return {
        coords: {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
        },
        city: geocoded.city || explicitCity,
      }
    }
    return {
      coords: null,
      city: explicitCity,
    }
  }

  return {
    coords: { latitude: DEFAULT_LAT, longitude: DEFAULT_LON },
    city: DEFAULT_CITY,
  }
}

const getWeatherForecast = async (query = {}) => {
  const date = normalizeDateString(query?.date) || getTodayDateString()
  const location = await resolveForecastLocation(query)
  const cacheKey = `${date}:${toCacheKey(location.coords)}:${String(location.city || DEFAULT_CITY)}`
  const now = Date.now()
  const cached = forecastCacheByKey.get(cacheKey)
  if (cached?.data && now - cached.at < CACHE_TTL_MS) {
    return cached.data
  }

  let data
  try {
    if (PROVIDER === 'open-meteo' && location.coords) {
      const real = await fetchOpenMeteoForecast(location.coords, date)
      data = {
        city: location.city || DEFAULT_CITY,
        date: real.date || date,
        text: real.text,
        weatherCode: real.weatherCode,
        temp: real.temp,
        tempMin: real.tempMin,
        tempMax: real.tempMax,
        apparentTempMin: real.apparentTempMin,
        apparentTempMax: real.apparentTempMax,
        tags: DEFAULT_TAGS,
        source: 'open-meteo',
        updatedAt: new Date().toISOString(),
      }
    } else if (PROVIDER === 'open-meteo') {
      data = buildFallbackForecast(location.city || DEFAULT_CITY, date)
    } else {
      data = { ...buildFallbackForecast(location.city || DEFAULT_CITY, date), source: 'mock' }
    }
  } catch {
    data = buildFallbackForecast(location.city || DEFAULT_CITY, date)
  }

  forecastCacheByKey.set(cacheKey, { at: now, data })
  return data
}

const clearWeatherCaches = () => {
  todayCacheByKey.clear()
  forecastCacheByKey.clear()
  cityCacheByKey.clear()
  inflightCityByKey.clear()
  citySearchCacheByKey.clear()
  inflightCitySearchByKey.clear()
}

module.exports = {
  getTodayWeather,
  getWeatherForecast,
  __testables: {
    clearWeatherCaches,
    fetchOpenMeteoForecast,
    forwardGeocodeCityOpenMeteo,
    getTodayDateString,
    normalizeDateString,
    resolveForecastLocation,
  },
}
