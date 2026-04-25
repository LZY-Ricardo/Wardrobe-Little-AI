const test = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')

const weatherModule = require('../controllers/weather')

const { getWeatherForecast, __testables } = weatherModule

test('getWeatherForecast can resolve city and date into forecast weather', async () => {
  const originalGet = axios.get

  axios.get = async (url, config = {}) => {
    if (url.includes('geocoding-api.open-meteo.com')) {
      assert.equal(config.params.name, '上海')
      return {
        data: {
          results: [
            { latitude: 31.2304, longitude: 121.4737, name: '上海' },
          ],
        },
      }
    }

    if (url.includes('api.open-meteo.com/v1/forecast')) {
      assert.equal(config.params.latitude, 31.2304)
      assert.equal(config.params.longitude, 121.4737)
      assert.equal(config.params.start_date, '2026-04-26')
      assert.equal(config.params.end_date, '2026-04-26')
      return {
        data: {
          daily: {
            time: ['2026-04-26'],
            weather_code: [3],
            temperature_2m_min: [19.2],
            temperature_2m_max: [27.4],
            apparent_temperature_min: [18.5],
            apparent_temperature_max: [28.1],
          },
        },
      }
    }

    throw new Error(`Unexpected axios.get url: ${url}`)
  }

  try {
    const result = await getWeatherForecast({ city: '上海', date: '2026-04-26' })
    assert.equal(result.city, '上海')
    assert.equal(result.date, '2026-04-26')
    assert.equal(result.text, '阴')
    assert.equal(result.temp, '19~27℃')
    assert.equal(result.tempMin, 19)
    assert.equal(result.tempMax, 27)
    assert.equal(result.source, 'open-meteo')
  } finally {
    axios.get = originalGet
    __testables.clearWeatherCaches()
  }
})

test('getWeatherForecast defaults to current shanghai date when date is missing', async () => {
  const originalGet = axios.get

  axios.get = async (url, config = {}) => {
    if (url.includes('geocoding-api.open-meteo.com')) {
      return {
        data: {
          results: [
            { latitude: 30.2741, longitude: 120.1551, name: '杭州' },
          ],
        },
      }
    }

    if (url.includes('api.open-meteo.com/v1/forecast')) {
      const expectedDate = __testables.getTodayDateString()
      assert.equal(config.params.start_date, expectedDate)
      assert.equal(config.params.end_date, expectedDate)
      return {
        data: {
          daily: {
            time: [expectedDate],
            weather_code: [1],
            temperature_2m_min: [14.1],
            temperature_2m_max: [22.2],
            apparent_temperature_min: [13.2],
            apparent_temperature_max: [23.3],
          },
        },
      }
    }

    throw new Error(`Unexpected axios.get url: ${url}`)
  }

  try {
    const result = await getWeatherForecast({ city: '杭州' })
    assert.equal(result.city, '杭州')
    assert.equal(result.date, __testables.getTodayDateString())
    assert.equal(result.text, '大部晴朗')
    assert.equal(result.tempMin, 14)
    assert.equal(result.tempMax, 22)
  } finally {
    axios.get = originalGet
    __testables.clearWeatherCaches()
  }
})
