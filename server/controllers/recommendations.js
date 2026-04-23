const { query } = require('../models/db')
const {
  buildRecommendationRequestSummary,
  buildRecommendationResultSummary,
  normalizeFeedbackReasonTags,
  normalizeRecommendationAdoptionPatch,
} = require('./recommendations.helpers')
const { clampLen, trimToString } = require('../utils/validate')

const parseJsonSafe = (value, fallback) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const toBoolNumber = (value) => {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1
  return 0
}

const normalizeHistoryRow = (row) => {
  if (!row) return null
  return {
    ...row,
    adopted: toBoolNumber(row.adopted),
    saved_as_suit: toBoolNumber(row.saved_as_suit),
    saved_as_outfit_log: toBoolNumber(row.saved_as_outfit_log),
    request_summary: parseJsonSafe(row.request_summary, {}),
    result_summary: parseJsonSafe(row.result_summary, {}),
    result_payload: parseJsonSafe(row.result_payload, []),
    feedback_reason_tags: parseJsonSafe(row.feedback_reason_tags, []),
  }
}

const createRecommendationHistory = async (userId, payload = {}) => {
  const suits = Array.isArray(payload.suits) ? payload.suits : []
  if (!suits.length) {
    const error = new Error('推荐结果不能为空')
    error.status = 400
    throw error
  }

  const requestSummary = buildRecommendationRequestSummary(payload)
  const resultSummary = buildRecommendationResultSummary(suits)
  const recommendationType = trimToString(payload.recommendationType || 'scene').slice(0, 32) || 'scene'
  const scene = clampLen(payload.scene || requestSummary.scene, 64)
  const weatherSummary = clampLen(payload.weatherSummary, 64)
  const triggerSource = clampLen(payload.triggerSource || requestSummary.triggerSource, 32)
  const safeSuits = suits.map((item, index) => ({
    id: item?.id ?? index,
    scene: clampLen(item?.scene || scene, 64),
    source: clampLen(item?.source || 'llm', 16),
    description: clampLen(item?.description || item?.reason, 255),
    items: Array.isArray(item?.items)
      ? item.items.map((cloth) => ({
          cloth_id: Number.parseInt(cloth?.cloth_id, 10) || 0,
          name: clampLen(cloth?.name, 64),
          type: clampLen(cloth?.type, 64),
          color: clampLen(cloth?.color, 64),
          style: clampLen(cloth?.style, 64),
          season: clampLen(cloth?.season, 64),
        }))
      : [],
  }))
  const now = Date.now()

  const sql = `
    INSERT INTO recommendation_history (
      user_id, recommendation_type, scene, weather_summary, trigger_source,
      request_summary, result_summary, result_payload,
      adopted, saved_as_suit, saved_as_outfit_log, create_time, update_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
  `
  const params = [
    userId,
    recommendationType,
    scene,
    weatherSummary,
    triggerSource,
    JSON.stringify(requestSummary),
    JSON.stringify(resultSummary),
    JSON.stringify(safeSuits),
    now,
    now,
  ]
  const res = await query(sql, params)
  return getRecommendationDetailForUser(userId, res.insertId)
}

const baseHistorySelect = `
  SELECT
    rh.*,
    rf.feedback_result,
    rf.reason_tags AS feedback_reason_tags,
    rf.note AS feedback_note,
    rf.update_time AS feedback_update_time
  FROM recommendation_history rh
  LEFT JOIN recommendation_feedback rf
    ON rf.recommendation_id = rh.id AND rf.user_id = rh.user_id
`

const listRecommendationsForUser = async (userId) => {
  const rows = await query(
    `${baseHistorySelect} WHERE rh.user_id = ? ORDER BY rh.create_time DESC`,
    [userId]
  )
  return Array.isArray(rows) ? rows.map(normalizeHistoryRow) : []
}

const getRecommendationDetailForUser = async (userId, recommendationId) => {
  const rows = await query(
    `${baseHistorySelect} WHERE rh.user_id = ? AND rh.id = ? LIMIT 1`,
    [userId, recommendationId]
  )
  if (!Array.isArray(rows) || !rows.length) return null
  return normalizeHistoryRow(rows[0])
}

const updateRecommendationAdoption = async (userId, recommendationId, patch = {}) => {
  const existed = await getRecommendationDetailForUser(userId, recommendationId)
  if (!existed) return null

  const nextState = normalizeRecommendationAdoptionPatch(existed, patch)

  await query(
    `UPDATE recommendation_history
     SET adopted = ?, saved_as_suit = ?, saved_as_outfit_log = ?, update_time = ?
     WHERE user_id = ? AND id = ?`,
    [
      nextState.adopted,
      nextState.saved_as_suit,
      nextState.saved_as_outfit_log,
      Date.now(),
      userId,
      recommendationId,
    ]
  )
  return getRecommendationDetailForUser(userId, recommendationId)
}

const submitRecommendationFeedback = async (userId, recommendationId, payload = {}) => {
  const existed = await getRecommendationDetailForUser(userId, recommendationId)
  if (!existed) {
    const error = new Error('推荐记录不存在')
    error.status = 404
    throw error
  }

  const feedbackResult = clampLen(payload.feedbackResult, 16)
  if (!feedbackResult) {
    const error = new Error('反馈结果不能为空')
    error.status = 400
    throw error
  }
  const reasonTags = normalizeFeedbackReasonTags(payload.reasonTags)
  const note = clampLen(payload.note, 255)
  const now = Date.now()

  await query(
    `INSERT INTO recommendation_feedback
      (recommendation_id, user_id, feedback_result, reason_tags, note, create_time, update_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      feedback_result = VALUES(feedback_result),
      reason_tags = VALUES(reason_tags),
      note = VALUES(note),
      update_time = VALUES(update_time)`,
    [recommendationId, userId, feedbackResult, JSON.stringify(reasonTags), note, now, now]
  )

  return getRecommendationDetailForUser(userId, recommendationId)
}

module.exports = {
  createRecommendationHistory,
  listRecommendationsForUser,
  getRecommendationDetailForUser,
  updateRecommendationAdoption,
  submitRecommendationFeedback,
}
