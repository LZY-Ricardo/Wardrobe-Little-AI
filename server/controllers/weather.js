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

let cache = { at: 0, data: null }

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

const fetchOpenMeteoToday = async () => {
  const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
    timeout: TIMEOUT_MS,
    params: {
      latitude: DEFAULT_LAT,
      longitude: DEFAULT_LON,
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

const buildFallback = () => ({
  city: DEFAULT_CITY,
  temp: FALLBACK_TEMP,
  text: FALLBACK_TEXT,
  tags: DEFAULT_TAGS,
  source: 'fallback',
  updatedAt: new Date().toISOString(),
})

const getTodayWeather = async () => {
  const now = Date.now()
  if (cache.data && now - cache.at < CACHE_TTL_MS) return cache.data

  let data
  try {
    if (PROVIDER === 'open-meteo') {
      const real = await fetchOpenMeteoToday()
      data = {
        city: DEFAULT_CITY,
        temp: real.temp,
        text: real.text,
        tags: DEFAULT_TAGS,
        source: 'open-meteo',
        updatedAt: new Date().toISOString(),
      }
    } else {
      data = { ...buildFallback(), source: 'mock' }
    }
  } catch (err) {
    data = buildFallback()
  }

  cache = { at: now, data }
  return data
}

module.exports = { getTodayWeather }
