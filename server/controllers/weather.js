const axios = require('axios')

const DEFAULT_CITY = process.env.WEATHER_CITY || '上海'
const DEFAULT_LAT = Number.parseFloat(process.env.WEATHER_LAT) || 31.2304
const DEFAULT_LON = Number.parseFloat(process.env.WEATHER_LON) || 121.4737
const DEFAULT_TAGS = (process.env.WEATHER_TAGS || '热门,推荐,新品,精选')
  .split(',')
  .map((tag) => tag.trim())
  .filter(Boolean)

const PROVIDER = process.env.WEATHER_PROVIDER || 'open-meteo'
const TIMEOUT_MS = Number.parseInt(process.env.WEATHER_TIMEOUT_MS, 10) || 4000
const CACHE_TTL_MS = Number.parseInt(process.env.WEATHER_CACHE_TTL_MS, 10) || 10 * 60 * 1000

const FALLBACK_TEMP = process.env.WEATHER_FALLBACK_TEMP || '25℃'
const FALLBACK_TEXT = process.env.WEATHER_FALLBACK_TEXT || '多云'

const cacheByKey = new Map()

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
    params: {
      latitude,
      longitude,
      current: 'temperature_2m,weather_code',
      timezone: 'Asia/Shanghai',
    },
  })

  const current = res?.data?.current
  const temperature = current?.temperature_2m
  const weatherCode = current?.weather_code

  if (!Number.isFinite(temperature)) {
    throw new Error('INVALID_WEATHER_RESPONSE')
  }

  return {
    temp: `${Math.round(temperature)}℃`,
    text: getTextFromWmoCode(weatherCode),
  }
}

const buildFallback = (city) => ({
  city,
  temp: FALLBACK_TEMP,
  text: FALLBACK_TEXT,
  tags: DEFAULT_TAGS,
  source: 'fallback',
  updatedAt: new Date().toISOString(),
})

const getTodayWeather = async (query = {}) => {
  const coords = parseCoordsFromQuery(query)
  const city = resolveCityLabel(query, coords)
  const cacheKey = toCacheKey(coords)
  const now = Date.now()
  const cached = cacheByKey.get(cacheKey)
  if (cached?.data && now - cached.at < CACHE_TTL_MS) return cached.data

  let data
  try {
    if (PROVIDER === 'open-meteo') {
      const real = await fetchOpenMeteoToday(coords)
      data = {
        city,
        temp: real.temp,
        text: real.text,
        tags: DEFAULT_TAGS,
        source: 'open-meteo',
        updatedAt: new Date().toISOString(),
      }
    } else {
      data = { ...buildFallback(city), source: 'mock' }
    }
  } catch (err) {
    data = buildFallback(city)
  }

  cacheByKey.set(cacheKey, { at: now, data })
  return data
}

module.exports = { getTodayWeather }
