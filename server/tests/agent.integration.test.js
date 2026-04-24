const test = require('node:test')
const assert = require('node:assert/strict')

const { pool, query } = require('../models/db')
const {
  executeAgentTask,
  listAgentTaskHistoryForUser,
  confirmAgentTask,
} = require('../controllers/agent')
const { updateConfirmationPreferences } = require('../controllers/profileInsights')

test('agent execute supports closet query and recommendation history', async () => {
  const now = Date.now()
  const username = `agent_test_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['Agent上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['Agent下衣', '下衣 / 通勤', '蓝色', '通勤', '秋季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const closetResult = await executeAgentTask(userId, '帮我看看衣橱里有哪些衣物', 'agent-page')
    assert.equal(closetResult.taskType, 'closet_query')
    assert.equal(closetResult.result.total, 2)

    const recommendResult = await executeAgentTask(userId, '帮我推荐一套通勤穿搭', 'agent-page')
    assert.equal(recommendResult.taskType, 'recommendation')
    assert.ok(Array.isArray(recommendResult.result.suits))
    assert.ok(recommendResult.result.suits.length >= 1)

    const history = await listAgentTaskHistoryForUser(userId, 10)
    assert.equal(history.length, 2)
    assert.equal(history[0].task_type, 'recommendation')
    assert.equal(history[1].task_type, 'closet_query')
  } finally {
    if (userId) {
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent write task requires confirmation before creating suit', async () => {
  const now = Date.now()
  const username = `agent_write_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let clothIds = []
  let createdSuitId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['Agent写上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['Agent写下衣', '下衣 / 通勤', '蓝色', '通勤', '秋季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const recommendResult = await executeAgentTask(userId, '帮我推荐一套通勤穿搭', 'agent-page')
    const pending = await executeAgentTask(
      userId,
      '把当前推荐的第1套保存为套装',
      'agent-page',
      {
        action: 'save_suit',
        latestResult: recommendResult,
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.status, 'pending')
    assert.ok(pending.confirmation?.confirmId)

    const historyBeforeConfirm = await listAgentTaskHistoryForUser(userId, 10)
    assert.equal(historyBeforeConfirm[0].status, 'pending')

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    createdSuitId = confirmed.relatedObjectId
    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.relatedObjectType, 'suit')

    const suits = await query('SELECT suit_id FROM suits WHERE user_id = ? AND suit_id = ?', [userId, createdSuitId])
    assert.equal(suits.length, 1)
  } finally {
    if (userId) {
      if (createdSuitId) {
        await query('DELETE FROM suit_items WHERE suit_id = ?', [createdSuitId])
        await query('DELETE FROM suits WHERE suit_id = ?', [createdSuitId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent low-risk write action auto executes when no-confirm preference is enabled', async () => {
  const now = Date.now()
  const username = `agent_lowrisk_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let clothId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const clothRes = await query(
      `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'Agent收藏衣物', '上衣 / 通勤', '黑色', '通勤', '春季', '', '', now, now]
    )
    clothId = clothRes.insertId

    await updateConfirmationPreferences(userId, { lowRiskNoConfirm: true })

    const result = await executeAgentTask(
      userId,
      '切换当前衣物收藏状态',
      'agent-page',
      {
        action: 'toggle_favorite',
        latestResult: {
          selectedCloth: {
            cloth_id: clothId,
            name: 'Agent收藏衣物',
            favorite: 0,
          },
        },
      }
    )

    assert.equal(result.requiresConfirmation, false)
    assert.equal(result.status, 'success')
    const rows = await query('SELECT favorite FROM clothes WHERE cloth_id = ? AND user_id = ?', [clothId, userId])
    assert.equal(Number(rows[0]?.favorite || 0), 1)
  } finally {
    if (userId) {
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test.after(async () => {
  try {
    await pool.promise().end()
  } catch {}
})
