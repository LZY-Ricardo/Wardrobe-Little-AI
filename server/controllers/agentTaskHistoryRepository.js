const { query } = require('../models/db')
const {
  buildAgentTaskSummary,
  summarizeAgentHistoryItem,
} = require('./agent.helpers')

const parseAgentTaskResultSummary = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const insertAgentTaskHistory = async (userId, payload = {}) => {
  const now = Date.now()
  const resultSummary = JSON.stringify(payload.result || {})
  const res = await query(
    `INSERT INTO agent_task_history (
      user_id, source_entry, task_type, task_summary, status, requires_confirmation,
      confirmation_status, related_object_type, related_object_id, result_summary, create_time, update_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      payload.sourceEntry || 'agent-page',
      payload.taskType || 'unknown',
      buildAgentTaskSummary(payload.taskSummary || ''),
      payload.status || 'success',
      payload.requiresConfirmation ? 1 : 0,
      payload.confirmationStatus || 'not_required',
      payload.relatedObjectType || '',
      payload.relatedObjectId || null,
      resultSummary,
      now,
      now,
    ]
  )
  return res.insertId
}

const updateAgentTaskHistory = async (historyId, patch = {}) => {
  const fields = []
  const params = []
  ;['status', 'confirmation_status', 'related_object_type', 'related_object_id', 'result_summary'].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return
    fields.push(`${key} = ?`)
    if (key === 'result_summary') {
      params.push(JSON.stringify(patch[key] || {}))
    } else {
      params.push(patch[key])
    }
  })
  if (!fields.length) return
  fields.push('update_time = ?')
  params.push(Date.now(), historyId)
  await query(`UPDATE agent_task_history SET ${fields.join(', ')} WHERE id = ?`, params)
}

const listAgentTaskHistoryForUser = async (userId, limit = 20) => {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20))
  const rows = await query(
    `SELECT * FROM agent_task_history WHERE user_id = ? ORDER BY create_time DESC LIMIT ?`,
    [userId, safeLimit]
  )
  return Array.isArray(rows)
    ? rows.map((row) => ({
        ...row,
        ...summarizeAgentHistoryItem(row),
        result_summary: parseAgentTaskResultSummary(row.result_summary),
      }))
    : []
}

const getPendingAgentTaskByConfirmId = async (userId, confirmId, allowedActions = new Set()) => {
  const rows = await query(
    `SELECT *
       FROM agent_task_history
      WHERE user_id = ?
        AND status = 'pending'
        AND confirmation_status = 'pending'
      ORDER BY create_time DESC
      LIMIT 50`,
    [userId]
  )

  if (!Array.isArray(rows) || !rows.length) return null

  for (const row of rows) {
    const resultSummary = parseAgentTaskResultSummary(row.result_summary)
    const confirmation = resultSummary?.confirmation
    if (!confirmation || confirmation.confirmId !== confirmId) continue
    if (allowedActions.size && !allowedActions.has(String(confirmation.action || '').trim())) continue
    return {
      row,
      confirmation,
      resultSummary,
    }
  }

  return null
}

module.exports = {
  getPendingAgentTaskByConfirmId,
  insertAgentTaskHistory,
  listAgentTaskHistoryForUser,
  parseAgentTaskResultSummary,
  updateAgentTaskHistory,
}
