const weatherController = require('../../../../controllers/weather')

const resolveWeatherArgsWithContext = (args = {}, context = {}) => {
  const next = args && typeof args === 'object' ? { ...args } : {}
  const clientContext = context?.clientContext || {}
  const geo = clientContext?.geo || {}
  const profile = clientContext?.profile || {}

  if (
    (next.lat == null || next.lon == null) &&
    Number.isFinite(Number(geo.latitude)) &&
    Number.isFinite(Number(geo.longitude))
  ) {
    next.lat = Number(geo.latitude)
    next.lon = Number(geo.longitude)
  }

  if (!String(next.city || '').trim() && typeof profile.city === 'string' && profile.city.trim()) {
    next.city = profile.city.trim()
  }

  return next
}

const getWeatherForecast = async (_userId, args = {}, context = {}) => {
  return weatherController.getWeatherForecast(resolveWeatherArgsWithContext(args, context))
}

module.exports = {
  getWeatherForecast,
  resolveWeatherArgsWithContext,
}
