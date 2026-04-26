import test from 'node:test'
import assert from 'node:assert/strict'

import { requestFreshWeather } from './weatherRefresh.js'

test('requestFreshWeather re-requests current position and refreshes weather with latest coords', async () => {
  const writes = []
  const weatherCalls = []
  const states = []

  await requestFreshWeather({
    setGeoStatus: (value) => states.push(value),
    writeSessionJson: (key, value) => writes.push({ key, value }),
    isGeoSupported: () => true,
    isSecureGeoContext: () => true,
    getCurrentPosition: (onSuccess) => {
      onSuccess({
        coords: {
          latitude: 31.2304,
          longitude: 121.4737,
        },
      })
    },
    fetchWeather: async (coords) => {
      weatherCalls.push(coords)
      return { city: '上海', temp: '24°C', text: '晴' }
    },
    geoStatus: {
      REQUESTING: 'requesting',
      IDLE: 'idle',
      DENIED: 'denied',
      ERROR: 'error',
      UNAVAILABLE: 'unavailable',
    },
    weatherGeoCacheKey: 'weather_geo_cache_v1',
    now: () => 1714099200000,
    log: () => {},
  })

  assert.deepEqual(states, ['requesting', 'idle'])
  assert.deepEqual(weatherCalls, [{ latitude: 31.2304, longitude: 121.4737 }])
  assert.deepEqual(writes, [
    { key: 'weather_geo_cache_v1', value: null },
    {
      key: 'weather_geo_cache_v1',
      value: {
        askedAt: 1714099200000,
        coords: {
          latitude: 31.2304,
          longitude: 121.4737,
        },
        coordsAt: 1714099200000,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    },
  ])
})
