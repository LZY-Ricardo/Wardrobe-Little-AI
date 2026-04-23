const { query } = require('../models/db')
const { getAllClothes } = require('./clothes')
const { listOutfitLogsForUser } = require('./outfitLogs')
const { listRecommendationsForUser } = require('./recommendations')
const { buildProfileInsight } = require('./profileInsights.helpers')
const { buildWardrobeAnalytics } = require('./wardrobeAnalytics.helpers')

const parseJsonSafe = (value, fallback) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const getStoredProfileInsight = async (userId) => {
  const rows = await query('SELECT * FROM user_style_profile WHERE user_id = ? LIMIT 1', [userId])
  if (!Array.isArray(rows) || !rows.length) return null
  const row = rows[0]
  return {
    userId,
    preferredColors: parseJsonSafe(row.preferred_colors, []),
    preferredStyles: parseJsonSafe(row.preferred_styles, []),
    frequentScenes: parseJsonSafe(row.frequent_scenes, []),
    frequentSeasons: parseJsonSafe(row.frequent_seasons, []),
    likedReasonTags: parseJsonSafe(row.liked_reason_tags, []),
    confirmationPreferences: parseJsonSafe(row.confirmation_preferences, { lowRiskNoConfirm: false }),
    summary: row.summary || '',
    updateTime: row.update_time,
  }
}

const gatherSourceData = async (userId) => {
  const [clothes, outfitLogs, recommendations] = await Promise.all([
    getAllClothes(userId),
    listOutfitLogsForUser(userId),
    listRecommendationsForUser(userId),
  ])

  const feedbacks = recommendations
    .filter((item) => item.feedback_result)
    .map((item) => ({
      feedback_result: item.feedback_result,
      feedback_reason_tags: Array.isArray(item.feedback_reason_tags) ? item.feedback_reason_tags : [],
    }))

  return {
    clothes: Array.isArray(clothes) ? clothes : [],
    outfitLogs: Array.isArray(outfitLogs) ? outfitLogs : [],
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    feedbacks,
  }
}

const refreshProfileInsight = async (userId) => {
  const stored = await getStoredProfileInsight(userId)
  const sourceData = await gatherSourceData(userId)
  const insight = buildProfileInsight({
    ...sourceData,
    currentPreferences: stored?.confirmationPreferences || { lowRiskNoConfirm: false },
  })
  const now = Date.now()

  await query(
    `INSERT INTO user_style_profile (
      user_id, preferred_colors, preferred_styles, frequent_scenes, frequent_seasons,
      liked_reason_tags, confirmation_preferences, summary, update_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      preferred_colors = VALUES(preferred_colors),
      preferred_styles = VALUES(preferred_styles),
      frequent_scenes = VALUES(frequent_scenes),
      frequent_seasons = VALUES(frequent_seasons),
      liked_reason_tags = VALUES(liked_reason_tags),
      confirmation_preferences = VALUES(confirmation_preferences),
      summary = VALUES(summary),
      update_time = VALUES(update_time)`,
    [
      userId,
      JSON.stringify(insight.preferredColors),
      JSON.stringify(insight.preferredStyles),
      JSON.stringify(insight.frequentScenes),
      JSON.stringify(insight.frequentSeasons),
      JSON.stringify(insight.likedReasonTags),
      JSON.stringify(insight.confirmationPreferences),
      insight.summary,
      now,
    ]
  )

  return {
    ...insight,
    userId,
    updateTime: now,
  }
}

const getProfileInsight = async (userId, { forceRefresh = false } = {}) => {
  if (forceRefresh) {
    return refreshProfileInsight(userId)
  }
  const stored = await getStoredProfileInsight(userId)
  if (stored) return stored
  return refreshProfileInsight(userId)
}

module.exports = {
  gatherSourceData,
  getProfileInsight,
  refreshProfileInsight,
  buildWardrobeAnalytics,
}
