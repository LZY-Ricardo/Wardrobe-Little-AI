const { query } = require('../models/db')

const parseJsonSafe = (value, fallback) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const getSessionMemory = async (userId, sessionId) => {
  const rows = await query(
    `SELECT * FROM agent_session_memory WHERE user_id = ? AND session_id = ? LIMIT 1`,
    [userId, sessionId]
  )
  if (!Array.isArray(rows) || !rows.length) return null
  const row = rows[0]
  return {
    session_id: row.session_id,
    summary: row.summary || '',
    key_facts: parseJsonSafe(row.key_facts, []),
    active_goals: parseJsonSafe(row.active_goals, []),
    pending_actions: parseJsonSafe(row.pending_actions, []),
    last_summarized_message_id: row.last_summarized_message_id || null,
    update_time: row.update_time,
  }
}

const upsertSessionMemory = async (userId, sessionId, payload = {}) => {
  const now = Date.now()
  await query(
    `INSERT INTO agent_session_memory (
      session_id, user_id, summary, key_facts, active_goals, pending_actions, last_summarized_message_id, update_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      summary = VALUES(summary),
      key_facts = VALUES(key_facts),
      active_goals = VALUES(active_goals),
      pending_actions = VALUES(pending_actions),
      last_summarized_message_id = VALUES(last_summarized_message_id),
      update_time = VALUES(update_time)`,
    [
      sessionId,
      userId,
      payload.summary || '',
      JSON.stringify(payload.key_facts || []),
      JSON.stringify(payload.active_goals || []),
      JSON.stringify(payload.pending_actions || []),
      payload.last_summarized_message_id || null,
      now,
    ]
  )
  return getSessionMemory(userId, sessionId)
}

module.exports = {
  getSessionMemory,
  upsertSessionMemory,
}
