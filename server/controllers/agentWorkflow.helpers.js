const { clampLen, trimToString } = require('../utils/validate')

const normalizeField = (value, fallback = '') => clampLen(trimToString(value || fallback), 64)

const buildClothDraftFromAnalysis = (analysis = {}, overrides = {}) => {
  const type = normalizeField(overrides.type || analysis.type)
  const color = normalizeField(overrides.color || analysis.color)
  const style = normalizeField(overrides.style || analysis.style)
  const season = normalizeField(overrides.season || analysis.season)
  const material = normalizeField(overrides.material || analysis.material || '未知')
  const name = normalizeField(
    overrides.name || [color, type].filter(Boolean).join('') || '识别衣物',
    '识别衣物'
  )

  return {
    name,
    type,
    color,
    style,
    season,
    material,
  }
}

const findMissingClothFields = (draft = {}) => {
  const fields = ['type', 'color', 'style', 'season']
  return fields.filter((key) => !trimToString(draft[key]))
}

module.exports = {
  buildClothDraftFromAnalysis,
  findMissingClothFields,
}

