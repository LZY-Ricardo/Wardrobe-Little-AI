const {
  submitRecommendationFeedback,
  updateRecommendationAdoption,
} = require('../../../../controllers/recommendations')

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const coerceBoolean = (value) =>
  value === true || value === 1 || value === '1' || value === 'true'

const submitRecommendationFeedbackTool = async (userId, args = {}) => {
  const recommendationId = coerceInteger(args.recommendation_id)
  if (!recommendationId || recommendationId <= 0) return { error: 'INVALID_RECOMMENDATION_ID' }

  try {
    return await submitRecommendationFeedback(userId, recommendationId, {
      feedbackResult: args.feedbackResult,
      reasonTags: Array.isArray(args.reasonTags) ? args.reasonTags : [],
      note: args.note,
    })
  } catch (error) {
    return {
      error: error.message || 'SUBMIT_RECOMMENDATION_FEEDBACK_FAILED',
      status: error.status || 500,
    }
  }
}

const updateRecommendationAdoptionTool = async (userId, args = {}) => {
  const recommendationId = coerceInteger(args.recommendation_id)
  if (!recommendationId || recommendationId <= 0) return { error: 'INVALID_RECOMMENDATION_ID' }

  const result = await updateRecommendationAdoption(userId, recommendationId, {
    adopted: coerceBoolean(args.adopted),
    saved_as_suit: coerceBoolean(args.saved_as_suit),
    saved_as_outfit_log: coerceBoolean(args.saved_as_outfit_log),
  })

  return result || { error: 'NOT_FOUND' }
}

module.exports = {
  submitRecommendationFeedbackTool,
  updateRecommendationAdoptionTool,
}
