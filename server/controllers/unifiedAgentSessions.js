const { query } = require('../models/db')
const { deriveSessionTitle } = require('./unifiedAgent.helpers')

const createSession = async (userId, payload = {}) => {
  const now = Date.now()
  const title = deriveSessionTitle(payload.title || payload.firstMessage || '新会话')
  const res = await query(
    `INSERT INTO agent_sessions (
      user_id, title, status, current_task_type, last_message_at, create_time, update_time
    ) VALUES (?, ?, 'active', '', ?, ?, ?)`,
    [userId, title, now, now, now]
  )
  return getSessionById(userId, res.insertId)
}

const listSessionsForUser = async (userId, limit = 20) => {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20))
  const rows = await query(
    `SELECT s.*,
            (
              SELECT content
              FROM agent_messages am
              WHERE am.session_id = s.id
              ORDER BY am.create_time DESC, am.id DESC
              LIMIT 1
            ) AS last_message_preview
       FROM agent_sessions s
      WHERE s.user_id = ?
      ORDER BY s.last_message_at DESC
      LIMIT ?`,
    [userId, safeLimit]
  )
  return Array.isArray(rows) ? rows : []
}

const findLatestSessionByTitle = async (userId, title) => {
  const rows = await query(
    `SELECT * FROM agent_sessions WHERE user_id = ? AND title = ? ORDER BY last_message_at DESC LIMIT 1`,
    [userId, title]
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

const getSessionById = async (userId, sessionId) => {
  const rows = await query(
    `SELECT * FROM agent_sessions WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, sessionId]
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

const updateSessionMeta = async (userId, sessionId, patch = {}) => {
  const fields = []
  const params = []
  ;['title', 'current_task_type', 'last_message_at'].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return
    fields.push(`${key} = ?`)
    params.push(patch[key])
  })
  if (!fields.length) return
  fields.push('update_time = ?')
  params.push(Date.now(), userId, sessionId)
  await query(`UPDATE agent_sessions SET ${fields.join(', ')} WHERE user_id = ? AND id = ?`, params)
}

const appendMessage = async (userId, sessionId, payload = {}) => {
  const now = Date.now()
  const role = String(payload.role || 'user').trim() || 'user'
  const content = String(payload.content || '').trim()
  const messageType = String(payload.messageType || 'chat').trim() || 'chat'
  const taskId = payload.taskId || null
  const toolName = String(payload.toolName || '').trim()
  const confirmationStatus = String(payload.confirmationStatus || '').trim()

  if (!content) {
    const error = new Error('消息内容不能为空')
    error.status = 400
    throw error
  }

  const session = await getSessionById(userId, sessionId)
  if (!session) {
    const error = new Error('会话不存在')
    error.status = 404
    throw error
  }

  const res = await query(
    `INSERT INTO agent_messages (
      session_id, user_id, role, content, message_type, task_id, tool_name, confirmation_status, create_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, role, content, messageType, taskId, toolName, confirmationStatus, now]
  )

  await query(
    `UPDATE agent_sessions SET last_message_at = ?, update_time = ? WHERE user_id = ? AND id = ?`,
    [now, now, userId, sessionId]
  )

  return getMessageById(userId, res.insertId)
}

const getMessageById = async (userId, messageId) => {
  const rows = await query(
    `SELECT * FROM agent_messages WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, messageId]
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

const listMessagesForSession = async (userId, sessionId) => {
  const rows = await query(
    `SELECT * FROM agent_messages WHERE user_id = ? AND session_id = ? ORDER BY create_time ASC, id ASC`,
    [userId, sessionId]
  )
  return Array.isArray(rows) ? rows : []
}

module.exports = {
  appendMessage,
  createSession,
  findLatestSessionByTitle,
  getMessageById,
  getSessionById,
  listMessagesForSession,
  listSessionsForUser,
  updateSessionMeta,
}
