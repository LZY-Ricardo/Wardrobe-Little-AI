const { clampLen, trimToString } = require('../utils/validate')
const { getTodayInChina } = require('../utils/date')

const normalizeLogDate = (value) => {
  const text = trimToString(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return getTodayInChina()
}

const normalizeOutfitLogItems = (items = []) => {
  const uniq = new Set()
  ;(Array.isArray(items) ? items : []).forEach((item) => {
    const num = Number.parseInt(item, 10)
    if (Number.isFinite(num) && num > 0) uniq.add(num)
  })
  return Array.from(uniq).sort((a, b) => a - b)
}

const normalizeSatisfaction = (value) => {
  const num = Number.parseInt(value, 10)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(5, num))
}

const normalizeOutfitLogPayload = (payload = {}) => ({
  recommendationId: Number.parseInt(payload.recommendationId || payload.recommendation_id, 10) || null,
  suitId: Number.parseInt(payload.suitId || payload.suit_id, 10) || null,
  logDate: normalizeLogDate(payload.logDate || payload.log_date),
  scene: clampLen(payload.scene, 64),
  weatherSummary: clampLen(payload.weatherSummary || payload.weather_summary, 64),
  satisfaction: normalizeSatisfaction(payload.satisfaction),
  source: clampLen(payload.source, 32) || 'manual',
  note: clampLen(payload.note, 255),
  itemIds: normalizeOutfitLogItems(payload.items),
})

module.exports = {
  normalizeLogDate,
  normalizeOutfitLogItems,
  normalizeOutfitLogPayload,
}
