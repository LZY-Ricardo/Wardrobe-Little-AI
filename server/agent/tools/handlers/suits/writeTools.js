const { insertSuit, deleteSuitForUser } = require('../../../../controllers/suits')

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))

const buildSuitPayloadFromLatestTask = (latestTask = {}, suitIndex = 0) => {
  const suits = Array.isArray(latestTask?.result?.suits) ? latestTask.result.suits : []
  const selectedSuit = suits[Math.max(0, Number(suitIndex) || 0)]
  if (!selectedSuit) return null

  const itemIds = (selectedSuit.items || [])
    .map((item) => coerceInteger(item?.cloth_id))
    .filter((id) => Number.isFinite(id) && id > 0)

  if (itemIds.length < 2) return null

  return {
    name: `${selectedSuit.scene || '推荐'}套装`,
    scene: selectedSuit.scene || '',
    description: selectedSuit.reason || selectedSuit.description || '',
    source: 'agent',
    items: itemIds,
  }
}

const saveSuit = async (userId, args = {}, ctx = {}) => {
  const payload = Array.isArray(args.items) ? {
    name: safeString(args.name).trim() || '推荐套装',
    scene: safeString(args.scene).trim(),
    description: safeString(args.description).trim(),
    source: safeString(args.source).trim() || 'agent',
    items: args.items,
  } : buildSuitPayloadFromLatestTask(ctx.latestTask, args.suitIndex)
  if (!payload) return { error: 'INVALID_LATEST_RECOMMENDATION' }
  return insertSuit(userId, payload)
}

const deleteSuit = async (userId, args = {}) => {
  const suitId = coerceInteger(args.suit_id)
  if (!suitId || suitId <= 0) return { error: 'INVALID_SUIT_ID' }
  const ok = await deleteSuitForUser(userId, suitId)
  if (!ok) return { error: 'NOT_FOUND' }
  return { suit_id: suitId, deleted: true }
}

module.exports = {
  buildSuitPayloadFromLatestTask,
  deleteSuit,
  saveSuit,
}
