const { insertSuit, deleteSuitForUser } = require('../../../../controllers/suits')
const { buildCollectionAttachments } = require('../../../../controllers/unifiedAgentAttachments')

const coerceInteger = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))

const buildSuitCover = async (userId, suit = {}, deps = {}) => {
  const existingCover = safeString(suit?.cover || suit?.image).trim()
  if (existingCover) return existingCover
  if (!userId) return ''

  const attachments = await (deps.buildCollectionAttachments || buildCollectionAttachments)(suit, {
    userId,
    deps,
    objectType: 'suit',
    objectId: suit?.suit_id,
    title: safeString(suit?.name).trim() || safeString(suit?.scene).trim() || '套装',
    source: 'suit',
  })

  return safeString(
    (Array.isArray(attachments) ? attachments : []).find((item) => item?.variant === 'composite')?.dataUrl
  ).trim()
}

const buildSuitPayloadFromLatestTask = async (userId, latestTask = {}, suitIndex = 0, deps = {}) => {
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
    cover: await buildSuitCover(userId, selectedSuit, deps),
    source: 'agent',
    items: itemIds,
  }
}

const buildSuitPayloadFromArgs = async (userId, args = {}, deps = {}) => {
  const payload = {
    name: safeString(args.name).trim() || '推荐套装',
    scene: safeString(args.scene).trim(),
    description: safeString(args.description).trim(),
    source: safeString(args.source).trim() || 'agent',
    items: args.items,
  }
  payload.cover = await buildSuitCover(userId, { ...payload, cover: args.cover }, deps)
  return payload
}

const saveSuit = async (userId, args = {}, ctx = {}) => {
  const payload = Array.isArray(args.items)
    ? await buildSuitPayloadFromArgs(userId, args, ctx.deps)
    : await buildSuitPayloadFromLatestTask(userId, ctx.latestTask, args.suitIndex, ctx.deps)
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
  __testables: {
    buildSuitCover,
    buildSuitPayloadFromArgs,
  },
  buildSuitPayloadFromLatestTask,
  deleteSuit,
  saveSuit,
}
