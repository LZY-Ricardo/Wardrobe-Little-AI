const { getOutfitLogDetailForUser, listOutfitLogsForUser } = require('../../../../controllers/outfitLogs')

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const listOutfitLogs = async (userId, args = {}) => {
  const offset = Math.max(0, coerceInteger(args.offset) || 0)
  const limit = Math.min(50, Math.max(1, coerceInteger(args.limit) || 20))
  const rows = await listOutfitLogsForUser(userId)
  const list = Array.isArray(rows) ? rows : []
  return {
    total: list.length,
    offset,
    limit,
    items: list.slice(offset, offset + limit),
  }
}

const getOutfitLogDetail = async (userId, args = {}) => {
  const outfitLogId = coerceInteger(args.outfit_log_id || args.id)
  if (!outfitLogId || outfitLogId <= 0) return { error: 'INVALID_OUTFIT_LOG_ID' }
  const detail = await getOutfitLogDetailForUser(userId, outfitLogId)
  return detail || { error: 'NOT_FOUND' }
}

module.exports = {
  getOutfitLogDetail,
  listOutfitLogs,
}
