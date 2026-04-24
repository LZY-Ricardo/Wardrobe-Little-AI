const test = require('node:test')
const assert = require('node:assert/strict')

const { pool, query } = require('../models/db')
const {
  createAgentSession,
  appendAgentMessage,
  getOrCreateLegacyChatSession,
  refreshSessionMemoryIfNeeded,
  restoreAgentSession,
  sendUnifiedAgentMessage,
  updateAgentSessionMemory,
} = require('../controllers/unifiedAgentRuntime')

test('unified agent session can be created, appended, and restored with memory', async () => {
  const now = Date.now()
  const username = `unified_session_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '帮我做通勤搭配' })
    sessionId = created.session.id
    assert.equal(created.session.title, '帮我做通勤搭配')

    for (let index = 0; index < 15; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await appendAgentMessage(userId, sessionId, {
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `message-${index + 1}`,
        messageType: 'chat',
      })
    }

    await updateAgentSessionMemory(userId, sessionId, {
      summary: '之前已经讨论过通勤场景',
      key_facts: ['偏好深色'],
      active_goals: ['完成一套通勤搭配'],
      pending_actions: ['等待继续推荐'],
      last_summarized_message_id: 3,
    })

    const restored = await restoreAgentSession(userId, sessionId)
    assert.equal(restored.session.id, sessionId)
    assert.equal(restored.recent_messages.length, 12)
    assert.equal(restored.recent_messages[0].content, 'message-4')
    assert.equal(restored.session_memory.summary, '之前已经讨论过通勤场景')
    assert.ok(restored.preference_summary)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent auto refreshes session memory when messages exceed 12', async () => {
  const now = Date.now()
  const username = `unified_summary_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '摘要会话' })
    sessionId = created.session.id

    for (let index = 0; index < 13; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await sendUnifiedAgentMessage(userId, sessionId, `第${index + 1}轮消息`, {
        generateReply: async () => '固定回复',
        generateSummary: async () =>
          JSON.stringify({
            summary: '自动摘要已生成',
            key_facts: ['这是测试摘要'],
            active_goals: ['验证摘要自动刷新'],
            pending_actions: [],
          }),
      })
    }

    const restored = await restoreAgentSession(userId, sessionId)
    assert.ok(restored.session_memory)
    assert.equal(restored.session_memory.summary, '自动摘要已生成')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent does not regenerate summary when older boundary is unchanged', async () => {
  const now = Date.now()
  const username = `unified_boundary_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let summaryCalls = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '边界会话' })
    sessionId = created.session.id

    for (let index = 0; index < 13; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await appendAgentMessage(userId, sessionId, {
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `message-${index + 1}`,
        messageType: 'chat',
      })
    }

    const existingMessages = await query(
      'SELECT id FROM agent_messages WHERE session_id = ? ORDER BY create_time ASC, id ASC',
      [sessionId]
    )

    await updateAgentSessionMemory(userId, sessionId, {
      summary: '已有摘要',
      key_facts: ['事实'],
      active_goals: ['目标'],
      pending_actions: [],
      last_summarized_message_id: existingMessages[0]?.id || null,
    })

    await refreshSessionMemoryIfNeeded(userId, sessionId, {
      generateSummary: async () => {
        summaryCalls += 1
        return JSON.stringify({
          summary: '新的摘要',
          key_facts: [],
          active_goals: [],
          pending_actions: [],
        })
      },
    })

    await refreshSessionMemoryIfNeeded(userId, sessionId, {
      generateSummary: async () => {
        summaryCalls += 1
        return JSON.stringify({
          summary: '新的摘要',
          key_facts: [],
          active_goals: [],
          pending_actions: [],
        })
      },
    })

    assert.equal(summaryCalls, 0)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can send message and persist assistant reply in same session', async () => {
  const now = Date.now()
  const username = `unified_chat_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '新对话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '你好，帮我介绍一下功能', {
      generateReply: async () => '这是测试回复',
    })

    assert.equal(sent.message.role, 'assistant')
    assert.equal(sent.message.content, '这是测试回复')
    assert.equal(sent.restored.recent_messages.length, 2)
    assert.equal(sent.restored.recent_messages[0].role, 'user')
    assert.equal(sent.restored.recent_messages[1].role, 'assistant')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can execute recommendation task inside same session', async () => {
  const now = Date.now()
  const username = `unified_task_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['统一上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['统一下衣', '下衣 / 通勤', '蓝色', '通勤', '秋季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '任务会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我推荐一套通勤穿搭', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_TASK')
      },
    })

    assert.equal(sent.latest_task.taskType, 'recommendation')
    assert.ok(Array.isArray(sent.latest_task.result.suits))
    assert.ok(sent.latest_task.result.suits.length >= 1)
    assert.equal(sent.restored.recent_messages.length, 2)
    assert.match(sent.restored.recent_messages[1].content, /生成了/)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM recommendation_feedback WHERE user_id = ?', [userId])
      await query('DELETE FROM recommendation_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can confirm write action inside same session', async () => {
  const now = Date.now()
  const username = `unified_confirm_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let suitIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['统一确认上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['统一确认下衣', '下衣 / 通勤', '蓝色', '通勤', '秋季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '确认会话' })
    sessionId = created.session.id

    const recommended = await sendUnifiedAgentMessage(userId, sessionId, '帮我推荐一套通勤穿搭', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_TASK')
      },
    })

    const pending = await sendUnifiedAgentMessage(userId, sessionId, '把当前推荐的第1套保存为套装', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONFIRMABLE_TASK')
      },
      latestTask: recommended.latest_task,
    })

    assert.equal(pending.latest_task.requiresConfirmation, true)
    assert.ok(pending.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      pending.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.restored.recent_messages.slice(-1)[0].role, 'assistant')

    const suits = await query('SELECT suit_id FROM suits WHERE user_id = ?', [userId])
    suitIds = suits.map((item) => item.suit_id)
    assert.ok(suitIds.length >= 1)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      if (suitIds.length) {
        await query('DELETE FROM suit_items WHERE suit_id IN (?)', [suitIds])
        await query('DELETE FROM suits WHERE suit_id IN (?)', [suitIds])
      }
      await query('DELETE FROM recommendation_feedback WHERE user_id = ?', [userId])
      await query('DELETE FROM recommendation_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('legacy chat compatibility reuses unified legacy session', async () => {
  const now = Date.now()
  const username = `legacy_chat_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const first = await getOrCreateLegacyChatSession(userId)
    const second = await getOrCreateLegacyChatSession(userId)

    assert.equal(first.id, second.id)
    assert.equal(first.title, '兼容聊天会话')
  } finally {
    if (userId) {
      const sessions = await query('SELECT id FROM agent_sessions WHERE user_id = ?', [userId])
      const sessionIds = sessions.map((item) => item.id)
      if (sessionIds.length) {
        await query('DELETE FROM agent_session_memory WHERE session_id IN (?)', [sessionIds])
        await query('DELETE FROM agent_messages WHERE session_id IN (?)', [sessionIds])
        await query('DELETE FROM agent_sessions WHERE id IN (?)', [sessionIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent prefers llm generated title when available', async () => {
  const now = Date.now()
  const username = `unified_title_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '新会话' })
    sessionId = created.session.id

    await sendUnifiedAgentMessage(userId, sessionId, '帮我推荐一套适合明天面试的通勤穿搭', {
      generateReply: async () => '固定回复',
      generateTitle: async () => '面试通勤搭配',
    })

    const rows = await query('SELECT title FROM agent_sessions WHERE id = ?', [sessionId])
    assert.equal(rows[0].title, '面试通勤搭配')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM recommendation_feedback WHERE user_id = ?', [userId])
      await query('DELETE FROM recommendation_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent prefers llm structured summary when available', async () => {
  const now = Date.now()
  const username = `unified_memory_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '摘要测试' })
    sessionId = created.session.id

    for (let index = 0; index < 13; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await sendUnifiedAgentMessage(userId, sessionId, `第${index + 1}轮消息`, {
        generateReply: async () => '固定回复',
        generateSummary: async () =>
          JSON.stringify({
            summary: '本会话围绕通勤搭配与面试准备展开。',
            key_facts: ['偏好深色', '关注面试通勤'],
            active_goals: ['生成合适搭配'],
            pending_actions: ['等待进一步确认'],
          }),
      })
    }

    const restored = await restoreAgentSession(userId, sessionId)
    assert.equal(restored.session_memory.summary, '本会话围绕通勤搭配与面试准备展开。')
    assert.deepEqual(restored.session_memory.key_facts, ['偏好深色', '关注面试通勤'])
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent keeps previous memory when summary generation fails after success', async () => {
  const now = Date.now()
  const username = `unified_memory_keep_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '摘要保留测试' })
    sessionId = created.session.id

    for (let index = 0; index < 13; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await sendUnifiedAgentMessage(userId, sessionId, `第${index + 1}轮消息`, {
        generateReply: async () => '固定回复',
        generateSummary: async () =>
          JSON.stringify({
            summary: '高质量摘要',
            key_facts: ['偏好深色'],
            active_goals: ['完成推荐'],
            pending_actions: ['等待下一步'],
          }),
      })
    }

    const before = await restoreAgentSession(userId, sessionId)
    assert.equal(before.session_memory.summary, '高质量摘要')

    await sendUnifiedAgentMessage(userId, sessionId, '继续聊下一步', {
      generateReply: async () => '固定回复',
      generateSummary: async () => {
        throw new Error('SUMMARY_FAILED')
      },
    })

    const after = await restoreAgentSession(userId, sessionId)
    assert.equal(after.session_memory.summary, '高质量摘要')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent falls back to rule summary when there is no existing memory and summary generation fails', async () => {
  const now = Date.now()
  const username = `unified_rule_fallback_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '规则摘要会话' })
    sessionId = created.session.id

    for (let index = 0; index < 13; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await sendUnifiedAgentMessage(userId, sessionId, `第${index + 1}轮消息`, {
        generateReply: async () => '固定回复',
        generateSummary: async () => {
          throw new Error('SUMMARY_FAILED')
        },
      })
    }

    const restored = await restoreAgentSession(userId, sessionId)
    assert.ok(restored.session_memory)
    assert.match(restored.session_memory.summary, /第/)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent keeps previous memory when summary generation returns invalid json without throwing', async () => {
  const now = Date.now()
  const username = `unified_invalid_json_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '非法 JSON 会话' })
    sessionId = created.session.id

    for (let index = 0; index < 13; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await sendUnifiedAgentMessage(userId, sessionId, `第${index + 1}轮消息`, {
        generateReply: async () => '固定回复',
        generateSummary: async () =>
          JSON.stringify({
            summary: '已有高质量摘要',
            key_facts: ['事实A'],
            active_goals: ['目标A'],
            pending_actions: ['待办A'],
          }),
      })
    }

    const before = await restoreAgentSession(userId, sessionId)
    assert.equal(before.session_memory.summary, '已有高质量摘要')

    await sendUnifiedAgentMessage(userId, sessionId, '继续下一步', {
      generateReply: async () => '固定回复',
      generateSummary: async () => 'not-json',
    })

    const after = await restoreAgentSession(userId, sessionId)
    assert.equal(after.session_memory.summary, '已有高质量摘要')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent still replies when title generation fails', async () => {
  const now = Date.now()
  const username = `unified_title_fail_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '新会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '你好，今天想随便聊聊近况', {
      generateReply: async () => '标题失败也要继续回复',
      generateTitle: async () => {
        throw new Error('TITLE_FAILED')
      },
    })

    assert.equal(sent.message.content, '标题失败也要继续回复')
    const rows = await query('SELECT title FROM agent_sessions WHERE id = ?', [sessionId])
    assert.ok(rows[0].title)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified session list exposes updated title, task type and last message preview', async () => {
  const now = Date.now()
  const username = `unified_list_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '新会话' })
    sessionId = created.session.id

    await sendUnifiedAgentMessage(userId, sessionId, '帮我推荐一套通勤穿搭', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_TASK')
      },
      generateTitle: async () => '通勤搭配会话',
    })

    const sessions = await query(
      `SELECT title, current_task_type,
              (SELECT content FROM agent_messages am WHERE am.session_id = agent_sessions.id ORDER BY create_time DESC, id DESC LIMIT 1) AS last_message_preview
         FROM agent_sessions WHERE id = ?`,
      [sessionId]
    )

    assert.equal(sessions[0].title, '通勤搭配会话')
    assert.equal(sessions[0].current_task_type, 'recommendation')
    assert.match(sessions[0].last_message_preview, /生成了/)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM recommendation_feedback WHERE user_id = ?', [userId])
      await query('DELETE FROM recommendation_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test.after(async () => {
  try {
    await pool.promise().end()
  } catch {}
})
