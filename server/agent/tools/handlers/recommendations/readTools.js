const {
  getRecommendationDetailForUser,
  listRecommendationsForUser,
} = require('../../../../controllers/recommendations')

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const listRecommendations = async (userId, args = {}) => {
  const limit = Math.max(1, Math.min(20, coerceInteger(args.limit) || 10))
  const rows = await listRecommendationsForUser(userId)
  const source = Array.isArray(rows) ? rows : []

  return {
    total: source.length,
    items: source.slice(0, limit).map((item) => ({
      id: item.id,
      scene: item.scene || '',
      adopted: Number(item.adopted || 0) === 1,
      saved_as_suit: Number(item.saved_as_suit || 0) === 1,
      saved_as_outfit_log: Number(item.saved_as_outfit_log || 0) === 1,
      feedback_result: item.feedback_result || '',
      create_time: item.create_time,
      result_summary: item.result_summary || {},
    })),
  }
}

const getRecommendationDetail = async (userId, args = {}) => {
  const recommendationId = coerceInteger(args.recommendation_id)
  if (!recommendationId || recommendationId <= 0) return { error: 'INVALID_RECOMMENDATION_ID' }

  const detail = await getRecommendationDetailForUser(userId, recommendationId)
  if (!detail) return { error: 'NOT_FOUND' }
  return detail
}

module.exports = {
  getRecommendationDetail,
  listRecommendations,
}
