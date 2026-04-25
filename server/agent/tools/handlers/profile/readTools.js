const {
  getProfileInsight,
  gatherSourceData,
  buildWardrobeAnalytics,
  refreshProfileInsight,
} = require('../../../../controllers/profileInsights')
const { getUserInfoById } = require('../../../../controllers/user')

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))

const getUserProfile = async (userId) => {
  const user = await getUserInfoById(userId)
  if (!user) return { error: 'NOT_FOUND' }
  return {
    id: user.id,
    username: safeString(user.username),
    name: safeString(user.name || user.username),
    sex: safeString(user.sex),
    hasCharacterModel: Boolean(user.characterModel),
  }
}

const getProfileInsightTool = async (userId) => getProfileInsight(userId, {})
const refreshProfileInsightTool = async (userId) => refreshProfileInsight(userId)

const getWardrobeAnalyticsTool = async (userId) => {
  const sourceData = await gatherSourceData(userId)
  return buildWardrobeAnalytics(sourceData)
}

module.exports = {
  getProfileInsightTool,
  getUserProfile,
  getWardrobeAnalyticsTool,
  refreshProfileInsightTool,
}
