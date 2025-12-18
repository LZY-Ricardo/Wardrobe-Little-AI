const { query } = require('../models/db')
const { getClothByIdForUser } = require('./clothes')

const normalizeClothIds = (items = []) => {
  const uniq = new Set()
  ;(items || []).forEach((id) => {
    const num = Number.parseInt(id, 10)
    if (Number.isFinite(num)) uniq.add(num)
  })
  return Array.from(uniq)
    .filter((id) => id > 0)
    .sort((a, b) => a - b)
}

const computeSignature = (clothIds = []) => normalizeClothIds(clothIds).join('-')

const findSuitBySignature = async (userId, signature) => {
  const sql = 'SELECT * FROM suits WHERE user_id = ? AND signature = ? LIMIT 1'
  const res = await query(sql, [userId, signature])
  return Array.isArray(res) && res.length > 0 ? res[0] : null
}

const insertSuit = async (userId, payload) => {
  const clothIds = normalizeClothIds(payload.items)
  if (clothIds.length < 2) {
    const error = new Error('套装至少需要 2 件单品')
    error.code = 'INVALID_ITEMS'
    throw error
  }
  if (clothIds.length > 6) {
    const error = new Error('套装单品数量不能超过 6 件')
    error.code = 'INVALID_ITEMS'
    throw error
  }

  const signature = computeSignature(clothIds)
  if (!signature) {
    const error = new Error('无效的套装单品')
    error.code = 'INVALID_ITEMS'
    throw error
  }

  // 校验单品归属
  const clothChecks = await Promise.all(
    clothIds.map((id) =>
      getClothByIdForUser(userId, id).then((cloth) => ({ id, cloth }))
    )
  )
  const missing = clothChecks.filter((item) => !item.cloth).map((item) => item.id)
  if (missing.length) {
    const error = new Error(`以下单品不存在或不属于当前用户: ${missing.join(',')}`)
    error.code = 'ITEM_NOT_FOUND'
    throw error
  }

  const existed = await findSuitBySignature(userId, signature)
  if (existed) {
    return { existed: true, suit: existed }
  }

  const name = (payload.name || '我的套装').toString().slice(0, 64)
  const scene = (payload.scene || '').toString().slice(0, 64)
  const description = (payload.description || '').toString().slice(0, 255)
  const cover = payload.cover || ''
  const source = (payload.source || 'manual').toString().slice(0, 16)
  const now = Date.now()

  const insertSuitSql =
    'INSERT INTO suits (user_id, name, scene, description, cover, source, signature, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  const res = await query(insertSuitSql, [
    userId,
    name,
    scene,
    description,
    cover,
    source,
    signature,
    now,
    now,
  ])

  const suitId = res?.insertId
  if (!suitId) {
    const error = new Error('创建套装失败')
    error.code = 'CREATE_FAILED'
    throw error
  }

  const values = clothIds.map((id, index) => [suitId, id, index])
  const insertItemsSql = 'INSERT INTO suit_items (suit_id, cloth_id, sort_order) VALUES ?'
  await query(insertItemsSql, [values])

  return {
    existed: false,
    suit: {
      suit_id: suitId,
      user_id: userId,
      name,
      scene,
      description,
      cover,
      source,
      signature,
      create_time: now,
      update_time: now,
    },
  }
}

const listSuitsForUser = async (userId) => {
  const suitsSql = 'SELECT * FROM suits WHERE user_id = ? ORDER BY create_time DESC'
  const suits = await query(suitsSql, [userId])
  if (!Array.isArray(suits) || suits.length === 0) return []

  const suitIds = suits.map((s) => s.suit_id)
  const itemsSql = `
    SELECT si.suit_id, si.cloth_id, si.sort_order,
           c.name, c.type, c.color, c.style, c.season, c.material, c.image, c.favorite
    FROM suit_items si
    LEFT JOIN clothes c ON si.cloth_id = c.cloth_id AND c.user_id = ?
    WHERE si.suit_id IN (?)
    ORDER BY si.suit_id, si.sort_order, si.id
  `
  const items = await query(itemsSql, [userId, suitIds])
  const itemMap = new Map()
  items.forEach((row) => {
    const list = itemMap.get(row.suit_id) || []
    list.push({
      cloth_id: row.cloth_id,
      name: row.name || '',
      type: row.type || '',
      color: row.color || '',
      style: row.style || '',
      season: row.season || '',
      material: row.material || '',
      image: row.image || '',
      favorite: row.favorite,
    })
    itemMap.set(row.suit_id, list)
  })

  return suits.map((suit) => {
    const itemsForSuit = itemMap.get(suit.suit_id) || []
    return {
      ...suit,
      items: itemsForSuit,
      item_count: itemsForSuit.length,
    }
  })
}

const getSuitDetailForUser = async (userId, suitId) => {
  const sql = 'SELECT * FROM suits WHERE user_id = ? AND suit_id = ? LIMIT 1'
  const res = await query(sql, [userId, suitId])
  if (!Array.isArray(res) || res.length === 0) return null
  const suit = res[0]

  const itemsSql = `
    SELECT si.suit_id, si.cloth_id, si.sort_order,
           c.name, c.type, c.color, c.style, c.season, c.material, c.image, c.favorite
    FROM suit_items si
    LEFT JOIN clothes c ON si.cloth_id = c.cloth_id AND c.user_id = ?
    WHERE si.suit_id = ?
    ORDER BY si.sort_order, si.id
  `
  const items = await query(itemsSql, [userId, suitId])
  suit.items = (items || []).map((row) => ({
    cloth_id: row.cloth_id,
    name: row.name || '',
    type: row.type || '',
    color: row.color || '',
    style: row.style || '',
    season: row.season || '',
    material: row.material || '',
    image: row.image || '',
    favorite: row.favorite,
  }))
  suit.item_count = suit.items.length
  return suit
}

const deleteSuitForUser = async (userId, suitId) => {
  const found = await query('SELECT suit_id FROM suits WHERE user_id = ? AND suit_id = ? LIMIT 1', [
    userId,
    suitId,
  ])
  if (!Array.isArray(found) || found.length === 0) return false
  await query('DELETE FROM suit_items WHERE suit_id = ?', [suitId])
  const res = await query('DELETE FROM suits WHERE user_id = ? AND suit_id = ?', [userId, suitId])
  return res.affectedRows > 0
}

module.exports = {
  insertSuit,
  listSuitsForUser,
  getSuitDetailForUser,
  deleteSuitForUser,
  computeSignature,
  normalizeClothIds,
}
