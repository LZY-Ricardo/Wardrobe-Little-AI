const { createOutfitLog, deleteOutfitLog, updateOutfitLog } = require('../../../../controllers/outfitLogs')
const { getTodayInChina } = require('../../../../utils/date')

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const buildOutfitLogPayloadFromLatestTask = (latestTask = {}, suitIndex = 0) => {
  const suits = Array.isArray(latestTask?.result?.suits) ? latestTask.result.suits : []
  const selectedSuit = suits[Math.max(0, Number(suitIndex) || 0)]
  if (!selectedSuit) return null

  const itemIds = (selectedSuit.items || [])
    .map((item) => coerceInteger(item?.cloth_id))
    .filter((id) => Number.isFinite(id) && id > 0)

  if (!itemIds.length) return null

  return {
    recommendationId: latestTask?.result?.recommendationHistoryId || null,
    logDate: getTodayInChina(),
    scene: selectedSuit.scene || '',
    source: 'agent',
    note: selectedSuit.reason || selectedSuit.description || '',
    items: itemIds,
  }
}

const createOutfitLogTool = async (userId, args = {}, ctx = {}) => {
  const payload = Array.isArray(args.items) ? {
    recommendationId: args.recommendationId || null,
    suitId: args.suitId || null,
    logDate: args.logDate || getTodayInChina(),
    scene: args.scene || '',
    weatherSummary: args.weatherSummary || '',
    satisfaction: args.satisfaction || 0,
    source: args.source || 'agent',
    note: args.note || '',
    items: args.items,
  } : buildOutfitLogPayloadFromLatestTask(ctx.latestTask, args.suitIndex)
  if (!payload) return { error: 'INVALID_LATEST_RECOMMENDATION' }
  return createOutfitLog(userId, payload)
}

const updateOutfitLogTool = async (userId, args = {}, ctx = {}) => {
  const outfitLogId = coerceInteger(args.outfit_log_id)
  if (!outfitLogId || outfitLogId <= 0) return { error: 'INVALID_OUTFIT_LOG_ID' }
  const updater = ctx.updateOutfitLog || updateOutfitLog
  const payload = {}
  ;['recommendationId', 'suitId', 'logDate', 'scene', 'weatherSummary', 'satisfaction', 'source', 'note', 'items'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(args, key)) payload[key] = args[key]
  })
  const result = await updater(userId, outfitLogId, payload)
  if (!result) return { error: 'NOT_FOUND' }
  return result
}

const deleteOutfitLogTool = async (userId, args = {}) => {
  const outfitLogId = coerceInteger(args.outfit_log_id)
  if (!outfitLogId || outfitLogId <= 0) return { error: 'INVALID_OUTFIT_LOG_ID' }
  const ok = await deleteOutfitLog(userId, outfitLogId)
  if (!ok) return { error: 'NOT_FOUND' }
  return { outfit_log_id: outfitLogId, deleted: true }
}

module.exports = {
  buildOutfitLogPayloadFromLatestTask,
  createOutfitLogTool,
  deleteOutfitLogTool,
  updateOutfitLogTool,
}
