const wardrobeReadTools = require('../handlers/wardrobe/readTools')
const wardrobeWriteTools = require('../handlers/wardrobe/writeTools')
const profileReadTools = require('../handlers/profile/readTools')
const profileWriteTools = require('../handlers/profile/writeTools')
const suitsReadTools = require('../handlers/suits/readTools')
const suitsWriteTools = require('../handlers/suits/writeTools')
const outfitLogReadTools = require('../handlers/outfitLogs/readTools')
const outfitLogWriteTools = require('../handlers/outfitLogs/writeTools')
const recommendationReadTools = require('../handlers/recommendations/readTools')
const recommendationWriteTools = require('../handlers/recommendations/writeTools')
const visionTools = require('../handlers/vision/analyzeImageTool')
const weatherReadTools = require('../handlers/weather/readTools')
const mediaReadTools = require('../handlers/media/readTools')

const MODULE_REGISTRY = {
  profile: {
    read: profileReadTools,
    write: profileWriteTools,
  },
  wardrobe: {
    read: wardrobeReadTools,
    write: wardrobeWriteTools,
  },
  suits: {
    read: suitsReadTools,
    write: suitsWriteTools,
  },
  recommendations: {
    read: recommendationReadTools,
    write: recommendationWriteTools,
  },
  weather: {
    read: weatherReadTools,
  },
  outfitLogs: {
    read: outfitLogReadTools,
    write: outfitLogWriteTools,
  },
  vision: {
    read: visionTools,
  },
  media: {
    read: mediaReadTools,
  },
}

const HANDLER_ALIASES = {
  'profile.read.getProfileInsight': 'getProfileInsightTool',
  'profile.read.getWardrobeAnalytics': 'getWardrobeAnalyticsTool',
  'profile.read.refreshProfileInsight': 'refreshProfileInsightTool',
  'profile.write.updateUserName': 'updateUserNameTool',
  'profile.write.uploadUserAvatar': 'uploadUserAvatarTool',
  'profile.write.uploadCharacterModel': 'uploadCharacterModelTool',
  'profile.write.deleteCharacterModel': 'deleteCharacterModelTool',
  'profile.write.updateConfirmationPreferences': 'updateConfirmationPreferencesTool',
  'recommendations.write.submitRecommendationFeedback': 'submitRecommendationFeedbackTool',
  'recommendations.write.updateRecommendationAdoption': 'updateRecommendationAdoptionTool',
  'wardrobe.write.setFavorite': 'setClothFavorite',
  'outfitLogs.write.createOutfitLog': 'createOutfitLogTool',
  'outfitLogs.write.updateOutfitLog': 'updateOutfitLogTool',
  'outfitLogs.write.deleteOutfitLog': 'deleteOutfitLogTool',
  'vision.read.analyzeImage': 'analyzeImageTool',
}

const parseHandlerKey = (handlerKey = '') => {
  const parts = String(handlerKey || '').trim().split('.').filter(Boolean)
  if (parts.length !== 3) return null
  return {
    domain: parts[0],
    mode: parts[1],
    action: parts[2],
  }
}

const resolveToolHandler = (tool = {}) => {
  const handlerKey = String(tool?.handler || '').trim()
  if (!handlerKey) return null

  const parsed = parseHandlerKey(handlerKey)
  if (!parsed) return null

  const moduleGroup = MODULE_REGISTRY[parsed.domain]
  const moduleRef = moduleGroup?.[parsed.mode]
  if (!moduleRef) return null

  const exportName = HANDLER_ALIASES[handlerKey] || parsed.action
  const candidate = moduleRef?.[exportName]
  return typeof candidate === 'function' ? candidate : null
}

module.exports = {
  HANDLER_ALIASES,
  MODULE_REGISTRY,
  resolveToolHandler,
}
