const { query, withTransaction } = require('../models/db')
const { getClothByIdForUser } = require('./clothes')
const { normalizeOutfitLogPayload } = require('./outfitLogs.helpers')

const getRecommendationByIdForUser = async (userId, recommendationId) => {
  if (!recommendationId) return null
  const rows = await query(
    'SELECT id, adopted, saved_as_outfit_log FROM recommendation_history WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, recommendationId]
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

const runQuery = async (runner, sql, params = []) => {
  const [rows] = await runner.query(sql, params)
  return rows
}

const getRecommendationByIdForUserWithRunner = async (runner, userId, recommendationId) => {
  if (!recommendationId) return null
  const rows = await runQuery(
    runner,
    'SELECT id, adopted, saved_as_suit, saved_as_outfit_log FROM recommendation_history WHERE user_id = ? AND id = ? LIMIT 1',
    [userId, recommendationId]
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

const syncRecommendationOutfitUsage = async (runner, userId, recommendationId) => {
  if (!recommendationId) return
  const recommendation = await getRecommendationByIdForUserWithRunner(runner, userId, recommendationId)
  if (!recommendation) return
  const countRows = await runQuery(
    runner,
    'SELECT COUNT(*) AS count FROM outfit_logs WHERE user_id = ? AND recommendation_id = ?',
    [userId, recommendationId]
  )
  const count = Number(countRows?.[0]?.count || 0)
  const savedAsOutfitLog = count > 0 ? 1 : 0
  const adopted = recommendation.saved_as_suit || savedAsOutfitLog ? 1 : 0

  await runQuery(
    runner,
    `UPDATE recommendation_history
        SET adopted = ?, saved_as_outfit_log = ?, update_time = ?
      WHERE user_id = ? AND id = ?`,
    [adopted, savedAsOutfitLog, Date.now(), userId, recommendationId]
  )
}

const ensureItemsBelongToUser = async (userId, itemIds = []) => {
  const checks = await Promise.all(
    itemIds.map((id) => getClothByIdForUser(userId, id).then((cloth) => ({ id, cloth })))
  )
  const missing = checks.filter((item) => !item.cloth).map((item) => item.id)
  if (missing.length) {
    const error = new Error(`以下单品不存在或不属于当前用户: ${missing.join(',')}`)
    error.status = 400
    throw error
  }
}

const normalizeOutfitLogRow = (row) => ({
  ...row,
  recommendation_id: row.recommendation_id || null,
  suit_id: row.suit_id || null,
  satisfaction: Number(row.satisfaction || 0),
  items: Array.isArray(row.items) ? row.items : [],
})

const getOutfitLogDetailForUser = async (userId, logId) => {
  const rows = await query(
    `SELECT * FROM outfit_logs WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, logId]
  )
  if (!Array.isArray(rows) || !rows.length) return null
  const log = rows[0]
  const itemRows = await query(
    `SELECT oli.outfit_log_id, oli.cloth_id, oli.sort_order,
            c.name, c.type, c.color, c.style, c.season, c.material, c.image, c.favorite
       FROM outfit_log_items oli
       LEFT JOIN clothes c ON c.cloth_id = oli.cloth_id AND c.user_id = ?
      WHERE oli.outfit_log_id = ?
      ORDER BY oli.sort_order, oli.id`,
    [userId, logId]
  )
  log.items = (itemRows || []).map((row) => ({
    cloth_id: row.cloth_id,
    sort_order: row.sort_order,
    name: row.name || '',
    type: row.type || '',
    color: row.color || '',
    style: row.style || '',
    season: row.season || '',
    material: row.material || '',
    image: row.image || '',
    favorite: row.favorite,
  }))
  return normalizeOutfitLogRow(log)
}

const listOutfitLogsForUser = async (userId) => {
  const rows = await query(
    `SELECT * FROM outfit_logs WHERE user_id = ? ORDER BY log_date DESC, create_time DESC`,
    [userId]
  )
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return []
  const ids = list.map((item) => item.id)
  const itemRows = await query(
    `SELECT oli.outfit_log_id, oli.cloth_id, oli.sort_order,
            c.name, c.type, c.color, c.style, c.season, c.material, c.image, c.favorite
       FROM outfit_log_items oli
       LEFT JOIN clothes c ON c.cloth_id = oli.cloth_id AND c.user_id = ?
      WHERE oli.outfit_log_id IN (?)
      ORDER BY oli.outfit_log_id, oli.sort_order, oli.id`,
    [userId, ids]
  )
  const itemMap = new Map()
  ;(itemRows || []).forEach((row) => {
    const items = itemMap.get(row.outfit_log_id) || []
    items.push({
      cloth_id: row.cloth_id,
      sort_order: row.sort_order,
      name: row.name || '',
      type: row.type || '',
      color: row.color || '',
      style: row.style || '',
      season: row.season || '',
      material: row.material || '',
      image: row.image || '',
      favorite: row.favorite,
    })
    itemMap.set(row.outfit_log_id, items)
  })
  return list.map((row) =>
    normalizeOutfitLogRow({
      ...row,
      items: itemMap.get(row.id) || [],
    })
  )
}

const createOutfitLog = async (userId, payload = {}) => {
  const normalized = normalizeOutfitLogPayload(payload)
  if (!normalized.itemIds.length) {
    const error = new Error('穿搭记录至少需要 1 件单品')
    error.status = 400
    throw error
  }
  await ensureItemsBelongToUser(userId, normalized.itemIds)
  if (normalized.recommendationId) {
    const recommendation = await getRecommendationByIdForUser(userId, normalized.recommendationId)
    if (!recommendation) {
      const error = new Error('关联的推荐记录不存在')
      error.status = 400
      throw error
    }
  }

  const logId = await withTransaction(async (connection) => {
    const now = Date.now()
    const res = await runQuery(
      connection,
      `INSERT INTO outfit_logs (
        user_id, recommendation_id, suit_id, log_date, scene, weather_summary,
        satisfaction, source, note, create_time, update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        normalized.recommendationId,
        normalized.suitId,
        normalized.logDate,
        normalized.scene,
        normalized.weatherSummary,
        normalized.satisfaction,
        normalized.source,
        normalized.note,
        now,
        now,
      ]
    )
    const values = normalized.itemIds.map((clothId, index) => [res.insertId, clothId, index])
    await runQuery(connection, 'INSERT INTO outfit_log_items (outfit_log_id, cloth_id, sort_order) VALUES ?', [values])
    await syncRecommendationOutfitUsage(connection, userId, normalized.recommendationId)
    return res.insertId
  })
  return getOutfitLogDetailForUser(userId, logId)
}

const updateOutfitLog = async (userId, logId, payload = {}) => {
  const existed = await getOutfitLogDetailForUser(userId, logId)
  if (!existed) return null
  const normalized = normalizeOutfitLogPayload({
    recommendationId: Object.prototype.hasOwnProperty.call(payload, 'recommendationId')
      ? payload.recommendationId
      : existed.recommendation_id,
    suitId: Object.prototype.hasOwnProperty.call(payload, 'suitId') ? payload.suitId : existed.suit_id,
    logDate: payload.logDate || existed.log_date,
    scene: Object.prototype.hasOwnProperty.call(payload, 'scene') ? payload.scene : existed.scene,
    weatherSummary: Object.prototype.hasOwnProperty.call(payload, 'weatherSummary')
      ? payload.weatherSummary
      : existed.weather_summary,
    satisfaction: Object.prototype.hasOwnProperty.call(payload, 'satisfaction')
      ? payload.satisfaction
      : existed.satisfaction,
    source: payload.source || existed.source,
    note: Object.prototype.hasOwnProperty.call(payload, 'note') ? payload.note : existed.note,
    items: Object.prototype.hasOwnProperty.call(payload, 'items')
      ? payload.items
      : existed.items.map((item) => item.cloth_id),
  })
  if (!normalized.itemIds.length) {
    const error = new Error('穿搭记录至少需要 1 件单品')
    error.status = 400
    throw error
  }
  await ensureItemsBelongToUser(userId, normalized.itemIds)
  if (normalized.recommendationId) {
    const recommendation = await getRecommendationByIdForUser(userId, normalized.recommendationId)
    if (!recommendation) {
      const error = new Error('关联的推荐记录不存在')
      error.status = 400
      throw error
    }
  }

  const previousRecommendationId = existed.recommendation_id
  await withTransaction(async (connection) => {
    await runQuery(
      connection,
      `UPDATE outfit_logs
          SET recommendation_id = ?, suit_id = ?, log_date = ?, scene = ?, weather_summary = ?,
              satisfaction = ?, source = ?, note = ?, update_time = ?
        WHERE user_id = ? AND id = ?`,
      [
        normalized.recommendationId,
        normalized.suitId,
        normalized.logDate,
        normalized.scene,
        normalized.weatherSummary,
        normalized.satisfaction,
        normalized.source,
        normalized.note,
        Date.now(),
        userId,
        logId,
      ]
    )
    await runQuery(connection, 'DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [logId])
    const values = normalized.itemIds.map((clothId, index) => [logId, clothId, index])
    await runQuery(connection, 'INSERT INTO outfit_log_items (outfit_log_id, cloth_id, sort_order) VALUES ?', [values])
    await syncRecommendationOutfitUsage(connection, userId, previousRecommendationId)
    if (normalized.recommendationId !== previousRecommendationId) {
      await syncRecommendationOutfitUsage(connection, userId, normalized.recommendationId)
    }
  })
  return getOutfitLogDetailForUser(userId, logId)
}

const deleteOutfitLog = async (userId, logId) => {
  const existed = await getOutfitLogDetailForUser(userId, logId)
  if (!existed) return false
  return withTransaction(async (connection) => {
    await runQuery(connection, 'DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [logId])
    const res = await runQuery(connection, 'DELETE FROM outfit_logs WHERE user_id = ? AND id = ?', [userId, logId])
    await syncRecommendationOutfitUsage(connection, userId, existed.recommendation_id)
    return res.affectedRows > 0
  })
}

module.exports = {
  listOutfitLogsForUser,
  getOutfitLogDetailForUser,
  createOutfitLog,
  updateOutfitLog,
  deleteOutfitLog,
}
