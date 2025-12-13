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

const cacheByKey = new Map()
const cityCacheByKey = new Map()
const inflightCityByKey = new Map()

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
    } catch (err) {
      return null
    } finally {
      inflightCityByKey.delete(cacheKey)
    }
  })

  inflightCityByKey.set(cacheKey, promise)
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

const getTodayWeather = async (query = {}) => {
  const coords = parseCoordsFromQuery(query)
  const cacheKey = toCacheKey(coords)
  const now = Date.now()
  const cached = cacheByKey.get(cacheKey)

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
        cacheByKey.set(cacheKey, { at: cached.at, data: patched })
        return patched
      }
      return cached.data
    }

    if (!shouldTryGeocode || !isPlaceholderCity(cached.data.city)) return cached.data

    const resolvedCity = await resolveCityFromCoords(coords)
    if (!resolvedCity || isPlaceholderCity(resolvedCity)) return cached.data

    const patched = { ...cached.data, city: resolvedCity }
    cacheByKey.set(cacheKey, { at: cached.at, data: patched })
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
  } catch (err) {
    const resolvedCity = await cityPromise.catch(() => null)
    data = buildFallback(resolvedCity || baseCity)
  }

  cacheByKey.set(cacheKey, { at: now, data })
  return data
}

module.exports = { getTodayWeather }
