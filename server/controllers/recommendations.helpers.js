const { trimToString } = require('../utils/validate')

const normalizeFeedbackReasonTags = (tags = []) => {
  const uniq = new Set()
  ;(Array.isArray(tags) ? tags : [])
    .map((tag) => trimToString(tag))
    .filter(Boolean)
    .forEach((tag) => uniq.add(tag))
  return Array.from(uniq)
}

const normalizeRecommendationAdoptionPatch = (current = {}, patch = {}) => {
  const adoptedInput = Object.prototype.hasOwnProperty.call(patch, 'adopted')
    ? patch.adopted
    : current.adopted
  const adopted = adoptedInput === true || adoptedInput === 1 || adoptedInput === '1' || adoptedInput === 'true'

  const savedAsSuitInput = Object.prototype.hasOwnProperty.call(patch, 'saved_as_suit')
    ? patch.saved_as_suit
    : current.saved_as_suit
  const savedAsOutfitLogInput = Object.prototype.hasOwnProperty.call(patch, 'saved_as_outfit_log')
    ? patch.saved_as_outfit_log
    : current.saved_as_outfit_log
  const savedAsSuit = savedAsSuitInput === true || savedAsSuitInput === 1 || savedAsSuitInput === '1' || savedAsSuitInput === 'true'
  const savedAsOutfitLog =
    savedAsOutfitLogInput === true ||
    savedAsOutfitLogInput === 1 ||
    savedAsOutfitLogInput === '1' ||
    savedAsOutfitLogInput === 'true'

  return {
    adopted: adopted || savedAsSuit || savedAsOutfitLog ? 1 : 0,
    saved_as_suit: savedAsSuit ? 1 : 0,
    saved_as_outfit_log: savedAsOutfitLog ? 1 : 0,
  }
}

const buildRecommendationRequestSummary = (payload = {}) => ({
  scene: trimToString(payload.scene),
  formality: trimToString(payload.formality),
  temperaturePreference: trimToString(payload.temperaturePreference),
  weatherSummary: trimToString(payload.weatherSummary),
  triggerSource: trimToString(payload.triggerSource || payload.source || 'recommend-page'),
})

const buildRecommendationResultSummary = (suits = []) => {
  const list = Array.isArray(suits) ? suits : []
  const reasons = list
    .map((item) => trimToString(item?.reason || item?.description))
    .filter(Boolean)
    .slice(0, 2)
  const itemCount = list.reduce((sum, item) => {
    const items = Array.isArray(item?.items) ? item.items.length : 0
    return sum + items
  }, 0)

  return {
    suitCount: list.length,
    itemCount,
    reasons,
  }
}

module.exports = {
  buildRecommendationRequestSummary,
  buildRecommendationResultSummary,
  normalizeFeedbackReasonTags,
  normalizeRecommendationAdoptionPatch,
}
