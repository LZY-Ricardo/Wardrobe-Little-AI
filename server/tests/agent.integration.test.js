const test = require('node:test')
const assert = require('node:assert/strict')

const { pool, query } = require('../models/db')
const {
  executeAgentTask,
  listAgentTaskHistoryForUser,
  confirmAgentTask,
  cancelAgentTask,
  __clearPendingAgentOpsForTest,
} = require('../controllers/agent')
const { updateConfirmationPreferences } = require('../controllers/profileInsights')
const { executeTool } = require('../utils/toolRegistry')

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

test('agent tools support recommendation history actions and profile refresh', async () => {
  const now = Date.now()
  const username = `agent_reco_tools_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let recommendationId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const recoRes = await query(
      `INSERT INTO recommendation_history (
        user_id, recommendation_type, scene, weather_summary, trigger_source,
        request_summary, result_summary, result_payload,
        adopted, saved_as_suit, saved_as_outfit_log, create_time, update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      [
        userId,
        'scene',
        '通勤',
        '',
        'recommend-page',
        JSON.stringify({ scene: '通勤' }),
        JSON.stringify({ suitCount: 1, itemCount: 2, reasons: ['简洁通勤'] }),
        JSON.stringify([{ scene: '通勤', items: [] }]),
        now,
        now,
      ]
    )
    recommendationId = recoRes.insertId

    const listed = await executeTool('list_recommendations', { limit: 5 }, { userId })
    assert.equal(listed.total, 1)
    assert.equal(listed.items[0].id, recommendationId)

    const adopted = await executeTool(
      'update_recommendation_adoption',
      { recommendation_id: recommendationId, adopted: true },
      { userId }
    )
    assert.equal(Number(adopted.adopted || 0), 1)

    const feedback = await executeTool(
      'submit_recommendation_feedback',
      {
        recommendation_id: recommendationId,
        feedbackResult: 'like',
        reasonTags: ['颜色不喜欢', '太正式'],
        note: '更想休闲一点',
      },
      { userId }
    )
    assert.equal(feedback.feedback_result, 'like')
    assert.deepEqual(feedback.feedback_reason_tags, ['颜色不喜欢', '太正式'])

    const detail = await executeTool(
      'get_recommendation_detail',
      { recommendation_id: recommendationId },
      { userId }
    )
    assert.equal(detail.id, recommendationId)
    assert.equal(detail.feedback_result, 'like')

    const insight = await executeTool('refresh_profile_insight', {}, { userId })
    assert.equal(typeof insight.summary, 'string')
  } finally {
    if (userId) {
      await query('DELETE FROM recommendation_feedback WHERE user_id = ?', [userId])
      if (recommendationId) {
        await query('DELETE FROM recommendation_history WHERE id = ? AND user_id = ?', [recommendationId, userId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent tools support suit library and outfit log queries', async () => {
  const now = Date.now()
  const username = `agent_read_tools_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let clothIds = []
  let suitId = null
  let outfitLogId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['查询套装上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['查询套装下衣', '下衣 / 通勤', '灰色', '通勤', '春季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const suitRes = await query(
      'INSERT INTO suits (user_id, name, scene, description, cover, source, signature, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, '查询用套装', '通勤', '基础黑灰搭配', '', 'manual', clothIds.slice().sort((a, b) => a - b).join('-'), now, now]
    )
    suitId = suitRes.insertId
    await query('INSERT INTO suit_items (suit_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [suitId, clothId, index]),
    ])

    const logRes = await query(
      `INSERT INTO outfit_logs (
        user_id, recommendation_id, suit_id, log_date, scene, weather_summary,
        satisfaction, source, note, create_time, update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, null, suitId, '2026-04-25', '通勤', '晴 24C', 4, 'manual', '查询测试', now, now]
    )
    outfitLogId = logRes.insertId
    await query('INSERT INTO outfit_log_items (outfit_log_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [outfitLogId, clothId, index]),
    ])

    const suitList = await executeTool('list_suits', { limit: 5 }, { userId })
    assert.equal(suitList.total, 1)
    assert.equal(suitList.items[0].suit_id, suitId)

    const suitDetail = await executeTool('get_suit_detail', { suit_id: suitId }, { userId })
    assert.equal(suitDetail.suit_id, suitId)
    assert.equal(suitDetail.items.length, 2)

    const logList = await executeTool('list_outfit_logs', { limit: 5 }, { userId })
    assert.equal(logList.total, 1)
    assert.equal(logList.items[0].id, outfitLogId)

    const logDetail = await executeTool('get_outfit_log_detail', { outfit_log_id: outfitLogId }, { userId })
    assert.equal(logDetail.id, outfitLogId)
    assert.equal(logDetail.items.length, 2)
  } finally {
    if (userId) {
      if (outfitLogId) {
        await query('DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [outfitLogId])
        await query('DELETE FROM outfit_logs WHERE id = ?', [outfitLogId])
      }
      if (suitId) {
        await query('DELETE FROM suit_items WHERE suit_id = ?', [suitId])
        await query('DELETE FROM suits WHERE suit_id = ?', [suitId])
      }
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent write task requires confirmation before creating manual suit draft', async () => {
  const now = Date.now()
  const username = `agent_manual_suit_${now}_${Math.random().toString(16).slice(2, 8)}`
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
      ['手动套装上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['手动套装下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const pending = await executeAgentTask(
      userId,
      '帮我把这两件单品保存成一个通勤套装',
      'agent-page',
      {
        action: 'save_suit',
        latestResult: {
          manualSuitDraft: {
            name: '我的通勤套装',
            scene: '通勤',
            description: '黑白基础款',
            items: clothIds,
            source: 'agent',
          },
        },
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.status, 'pending')
    assert.equal(pending.confirmation.details?.name, '我的通勤套装')
    assert.equal(pending.confirmation.details?.count, '2')

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    createdSuitId = confirmed.relatedObjectId
    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.relatedObjectType, 'suit')

    const suits = await query('SELECT suit_id, name, scene FROM suits WHERE user_id = ? AND suit_id = ?', [userId, createdSuitId])
    assert.equal(suits.length, 1)
    assert.equal(suits[0].name, '我的通勤套装')
    assert.equal(suits[0].scene, '通勤')
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

test('agent write task requires confirmation before creating manual outfit log draft', async () => {
  const now = Date.now()
  const username = `agent_manual_log_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let clothIds = []
  let outfitLogId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['手动记录上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['手动记录下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const pending = await executeAgentTask(
      userId,
      '帮我记录今天这套通勤穿搭',
      'agent-page',
      {
        action: 'create_outfit_log',
        latestResult: {
          manualOutfitLogDraft: {
            logDate: '2026-04-25',
            scene: '通勤',
            weatherSummary: '晴 24C',
            satisfaction: 4,
            note: '黑白基础款',
            items: clothIds,
            source: 'agent',
          },
        },
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.status, 'pending')
    assert.equal(pending.confirmation.details?.logDate, '2026-04-25')
    assert.equal(pending.confirmation.details?.count, '2')

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    outfitLogId = confirmed.relatedObjectId
    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.relatedObjectType, 'outfit_log')

    const rows = await query('SELECT id, log_date, scene FROM outfit_logs WHERE user_id = ? AND id = ?', [userId, outfitLogId])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].log_date, '2026-04-25')
    assert.equal(rows[0].scene, '通勤')
  } finally {
    if (userId) {
      if (outfitLogId) {
        await query('DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [outfitLogId])
        await query('DELETE FROM outfit_logs WHERE id = ?', [outfitLogId])
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

test('agent write task requires confirmation before deleting current suit', async () => {
  const now = Date.now()
  const username = `agent_delete_suit_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let suitId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['Agent套装上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['Agent套装下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const suitRes = await query(
      'INSERT INTO suits (user_id, name, scene, description, cover, source, signature, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, 'Agent待删套装', '通勤', '', '', 'manual', clothIds.slice().sort((a, b) => a - b).join('-'), now, now]
    )
    suitId = suitRes.insertId
    await query('INSERT INTO suit_items (suit_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [suitId, clothId, index]),
    ])

    const pending = await executeAgentTask(
      userId,
      '删除当前套装',
      'agent-page',
      {
        action: 'delete_suit',
        latestResult: {
          selectedSuit: {
            suit_id: suitId,
            name: 'Agent待删套装',
            scene: '通勤',
            item_count: 2,
          },
        },
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.status, 'pending')
    assert.ok(pending.confirmation?.confirmId)

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.relatedObjectType, 'suit')

    const rows = await query('SELECT suit_id FROM suits WHERE user_id = ? AND suit_id = ?', [userId, suitId])
    assert.equal(rows.length, 0)
    suitId = null
  } finally {
    if (userId) {
      if (suitId) {
        await query('DELETE FROM suit_items WHERE suit_id = ?', [suitId])
        await query('DELETE FROM suits WHERE suit_id = ?', [suitId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent write task requires confirmation before deleting current outfit log', async () => {
  const now = Date.now()
  const username = `agent_delete_outfit_log_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let outfitLogId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['Agent记录上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['Agent记录下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const logRes = await query(
      `INSERT INTO outfit_logs (
        user_id, recommendation_id, suit_id, log_date, scene, weather_summary,
        satisfaction, source, note, create_time, update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, null, null, '2026-04-25', '通勤', '', 4, 'manual', '待删除记录', now, now]
    )
    outfitLogId = logRes.insertId
    await query('INSERT INTO outfit_log_items (outfit_log_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [outfitLogId, clothId, index]),
    ])

    const pending = await executeAgentTask(
      userId,
      '删除当前穿搭记录',
      'agent-page',
      {
        action: 'delete_outfit_log',
        latestResult: {
          selectedOutfitLog: {
            id: outfitLogId,
            log_date: '2026-04-25',
            scene: '通勤',
            items: clothIds.map((clothId) => ({ cloth_id: clothId })),
          },
        },
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.status, 'pending')
    assert.ok(pending.confirmation?.confirmId)

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.relatedObjectType, 'outfit_log')

    const rows = await query('SELECT id FROM outfit_logs WHERE user_id = ? AND id = ?', [userId, outfitLogId])
    assert.equal(rows.length, 0)
    outfitLogId = null
  } finally {
    if (userId) {
      if (outfitLogId) {
        await query('DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [outfitLogId])
        await query('DELETE FROM outfit_logs WHERE id = ?', [outfitLogId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent write task requires confirmation before updating user sex', async () => {
  const now = Date.now()
  const username = `agent_update_sex_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, sex, create_time, update_time) VALUES (?, ?, ?, ?, ?)',
      [username, 'test-password', 'man', now, now]
    )
    userId = userRes.insertId

    const pending = await executeAgentTask(
      userId,
      '把我的性别改成女',
      'agent-page',
      {
        action: 'update_user_sex',
        latestResult: {
          sex: 'woman',
        },
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.status, 'pending')
    assert.ok(pending.confirmation?.confirmId)

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.relatedObjectType, 'profile')

    const rows = await query('SELECT sex FROM user WHERE id = ?', [userId])
    assert.equal(rows[0].sex, 'woman')
  } finally {
    if (userId) {
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent confirm can recover pending task from database after in-memory state is lost', async () => {
  const now = Date.now()
  const username = `agent_confirm_restore_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let createdClothId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const pending = await executeAgentTask(
      userId,
      '把这件黑色针织上衣保存到衣橱',
      'agent-page',
      {
        action: 'create_cloth',
        latestResult: {
          draftCloth: {
            name: '黑色针织上衣',
            type: '上衣',
            color: '黑色',
            style: '简约',
            season: '秋冬',
            material: '针织',
          },
        },
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.confirmation?.action, 'create_cloth')
    assert.match(pending.confirmation?.summary || '', /保存到衣橱/)
    __clearPendingAgentOpsForTest()

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    createdClothId = confirmed.relatedObjectId

    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.relatedObjectType, 'cloth')

    const rows = await query('SELECT name FROM clothes WHERE cloth_id = ? AND user_id = ?', [createdClothId, userId])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, '黑色针织上衣')
  } finally {
    if (userId) {
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (createdClothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [createdClothId])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent cancel can recover pending task from database after in-memory state is lost', async () => {
  const now = Date.now()
  const username = `agent_cancel_restore_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const pending = await executeAgentTask(
      userId,
      '把这件白色鞋子保存到衣橱',
      'agent-page',
      {
        action: 'create_cloth',
        latestResult: {
          draftCloth: {
            name: '白色运动鞋',
            type: '鞋子',
            color: '白色',
            style: '运动',
            season: '四季',
            material: '皮革',
          },
        },
      }
    )

    __clearPendingAgentOpsForTest()
    const cancelled = await cancelAgentTask(userId, pending.confirmation.confirmId)

    assert.equal(cancelled.cancelled, true)

    const clothRows = await query('SELECT cloth_id FROM clothes WHERE user_id = ? AND name = ?', [userId, '白色运动鞋'])
    assert.equal(clothRows.length, 0)

    const historyRows = await query(
      'SELECT confirmation_status, status, result_summary FROM agent_task_history WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [userId]
    )
    assert.equal(historyRows[0].confirmation_status, 'cancelled')
    assert.equal(historyRows[0].status, 'cancelled')
  } finally {
    if (userId) {
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM clothes WHERE user_id = ? AND name = ?', [userId, '白色运动鞋'])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('agent can confirm batch cloth creation and save multiple items', async () => {
  const now = Date.now()
  const username = `agent_batch_create_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let createdClothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const pending = await executeAgentTask(
      userId,
      '把图里的两件衣物都存进衣橱',
      'agent-page',
      {
        action: 'create_clothes_batch',
        latestResult: {
          draftClothes: [
            {
              name: '黑色针织上衣',
              type: '上衣',
              color: '黑色',
              style: '简约',
              season: '秋冬',
              material: '针织',
            },
            {
              name: '白色运动鞋',
              type: '鞋子',
              color: '白色',
              style: '运动',
              season: '四季',
              material: '皮革',
            },
          ],
        },
      }
    )

    assert.equal(pending.requiresConfirmation, true)
    assert.equal(pending.confirmation?.action, 'create_clothes_batch')
    assert.equal(pending.confirmation?.details?.count, '2')

    const confirmed = await confirmAgentTask(userId, pending.confirmation.confirmId)
    createdClothIds = Array.isArray(confirmed.result?.items)
      ? confirmed.result.items.map((item) => item?.cloth_id).filter(Boolean)
      : []

    assert.equal(confirmed.status, 'success')
    assert.equal(confirmed.result?.totalCreated, 2)
    assert.equal(createdClothIds.length, 2)

    const rows = await query('SELECT name FROM clothes WHERE user_id = ? ORDER BY cloth_id ASC', [userId])
    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map((row) => row.name), ['黑色针织上衣', '白色运动鞋'])
  } finally {
    if (userId) {
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (createdClothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [createdClothIds])
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
