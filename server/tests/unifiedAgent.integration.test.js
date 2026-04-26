const test = require('node:test')
const assert = require('node:assert/strict')

const { pool, query } = require('../models/db')
const { updateConfirmationPreferences } = require('../controllers/profileInsights')
const {
  createAgentSession,
  appendAgentMessage,
  getOrCreateLegacyChatSession,
  refreshSessionMemoryIfNeeded,
  restoreAgentSession,
  sendUnifiedAgentMessage,
  updateAgentSessionMemory,
  __testables,
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
    assert.equal(created.session.title, '做通勤搭配')

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

test('unified agent can let llm autonomously choose read tools before replying', async () => {
  const now = Date.now()
  const username = `unified_llm_read_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['自主白鞋', '鞋类', '白色', '休闲', '春季'],
      ['自主黑鞋', '鞋类', '黑色', '通勤', '秋季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '自主读工具会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '看看我衣橱里的鞋子', {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-read-1',
                type: 'function',
                function: {
                  name: 'list_clothes',
                  arguments: JSON.stringify({ type: '鞋', limit: 10 }),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        return {
          role: 'assistant',
          content: '我已经帮你看过衣橱了，目前有 2 双鞋。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_LLM_AUTONOMOUS_TOOLS_HANDLE_READ')
      },
    })

    assert.equal(sent.message.role, 'assistant')
    assert.equal(sent.message.message_type, 'chat')
    assert.match(sent.message.content, /2 双鞋/)
    assert.equal(turn, 2)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent preserves autonomous closet query context for follow-up image actions', async () => {
  const now = Date.now()
  const username = `unified_llm_closet_context_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['黑色高帮帆布鞋', '鞋子 / 帆布鞋', '黑色', '休闲'],
      ['黑色低帮帆布鞋', '鞋子 / 帆布鞋', '黑色', '休闲'],
      ['白色低帮帆布鞋', '鞋子 / 帆布鞋', '白色', '休闲'],
    ]) {
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], '春季', '', `data:image/png;base64,${Buffer.from(row[0]).toString('base64')}`, now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '衣橱图片上下文会话' })
    sessionId = created.session.id

    const first = await sendUnifiedAgentMessage(userId, sessionId, '有没有黑色帆布鞋', {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-read-black-canvas',
                type: 'function',
                function: {
                  name: 'list_clothes',
                  arguments: JSON.stringify({ type: '帆布鞋', limit: 20 }),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        return {
          role: 'assistant',
          content: '有 2 双黑色帆布鞋。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_AUTONOMOUS_READ_CONTEXT_IS_AVAILABLE')
      },
    })

    assert.equal(first.latest_task.taskType, 'closet_query')
    assert.equal(first.latest_task.result.items.length, 3)

    assert.equal(first.latest_task.taskType, 'closet_query')
    assert.equal(first.latest_task.result.items.length, 3)
    assert.ok(first.message.meta?.latestTask)
    assert.equal(first.message.meta.latestTask.taskType, 'closet_query')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent follow-up turn can persist three selected clothes images to chat message', async () => {
  const now = Date.now()
  const username = `unified_llm_batch_clothes_images_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['黑色高帮帆布鞋', '鞋子 / 帆布鞋', '黑色', '休闲'],
      ['黑色运动鞋', '鞋子 / 运动鞋', '黑色', '运动'],
      ['黑色低帮帆布鞋', '鞋子 / 帆布鞋', '黑色', '休闲'],
    ]) {
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], '春季', '', `data:image/png;base64,${Buffer.from(row[0]).toString('base64')}`, now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '批量图片会话' })
    sessionId = created.session.id

    const first = await sendUnifiedAgentMessage(userId, sessionId, '我衣橱里有没有黑色鞋子', {
      enableAutonomousTools: true,
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-read-black-shoes',
                type: 'function',
                function: {
                  name: 'list_clothes',
                  arguments: JSON.stringify({ type: '鞋', limit: 20 }),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        return {
          role: 'assistant',
          content: '有 3 双黑色鞋子。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_BATCH_IMAGE_CONTEXT_IS_AVAILABLE')
      },
    })

    assert.equal(first.latest_task.taskType, 'closet_query')
    assert.equal(first.latest_task.result.items.length, 3)

    const second = await sendUnifiedAgentMessage(userId, sessionId, '帮我将这三双鞋子的图片都展示出来', {
      latestTask: first.latest_task,
      enableAutonomousTools: true,
      requestAssistantTurn: async (messages) => {
        const lastToolMessage = messages[messages.length - 1]
        if (lastToolMessage.role === 'tool') {
          assert.match(lastToolMessage.content, /已准备 3 张衣物图片/)
          return {
            role: 'assistant',
            content: '已把这三双鞋子的图片发给你。',
          }
        }
        return {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tool-show-three-shoes',
              type: 'function',
              function: {
                name: 'show_clothes_images',
                arguments: JSON.stringify({ cloth_ids: clothIds }),
              },
            },
          ],
        }
      },
      generateReply: async () => '已把这三双鞋子的图片发给你。',
    })

    assert.equal(second.message.attachments?.length, 3)
    assert.deepEqual(
      second.message.attachments.map((item) => item.objectId),
      clothIds,
    )
    assert.match(second.message.content, /三双鞋子/)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('buildAttachmentAwareReply rewrites contradictory image reply when attachments already exist', () => {
  const reply = __testables.buildAttachmentAwareReply(
    '三双鞋其实都有图片记录，但目前在对话上下文中还没有关联到具体的展示对象。',
    [
      {
        type: 'image',
        objectType: 'cloth',
        objectId: 21,
        dataUrl: 'data:image/png;base64,aaa',
      },
      {
        type: 'image',
        objectType: 'cloth',
        objectId: 23,
        dataUrl: 'data:image/png;base64,bbb',
      },
    ],
  )

  assert.equal(reply, '已为你展示当前匹配衣物图片，共 2 张。')
})

test('unified agent can let llm autonomously read weather forecast before replying', async () => {
  const now = Date.now()
  const username = `unified_llm_weather_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let turn = 0
  const weatherModule = require('../controllers/weather')
  const originalGetWeatherForecast = weatherModule.getWeatherForecast

  weatherModule.getWeatherForecast = async (args = {}) => ({
    city: args.city || '上海',
    date: args.date || '2026-04-26',
    text: '小雨',
    temp: '18~24℃',
    tempMin: 18,
    tempMax: 24,
    apparentTempMin: 17,
    apparentTempMax: 25,
    source: 'open-meteo',
    updatedAt: new Date(now).toISOString(),
  })

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '天气工具会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我看看 2026-04-26 上海天气', {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-weather-1',
                type: 'function',
                function: {
                  name: 'get_weather_forecast',
                  arguments: JSON.stringify({ city: '上海', date: '2026-04-26' }),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        assert.match(toolMessage.content, /18/)
        return {
          role: 'assistant',
          content: '2026-04-26 上海有小雨，气温 18~24℃。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_LLM_AUTONOMOUS_TOOLS_HANDLE_WEATHER')
      },
    })

    assert.equal(sent.message.role, 'assistant')
    assert.match(sent.message.content, /上海/)
    assert.match(sent.message.content, /18~24℃/)
    assert.equal(turn, 2)
  } finally {
    weatherModule.getWeatherForecast = originalGetWeatherForecast
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent weather tool can fallback to client geo and profile context when llm omits args', async () => {
  const now = Date.now()
  const username = `unified_llm_weather_ctx_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let turn = 0
  const weatherModule = require('../controllers/weather')
  const originalGetWeatherForecast = weatherModule.getWeatherForecast

  weatherModule.getWeatherForecast = async (args = {}) => {
    assert.equal(args.lat, 27.9483)
    assert.equal(args.lon, 116.3581)
    assert.equal(args.city, '南昌')
    return {
      city: '抚州',
      date: '2026-04-25',
      text: '多云',
      temp: '20~28℃',
      tempMin: 20,
      tempMax: 28,
      apparentTempMin: 19,
      apparentTempMax: 29,
      source: 'open-meteo',
      updatedAt: new Date(now).toISOString(),
    }
  }

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '天气上下文会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '今天天气怎么样', {
      clientContext: {
        geo: {
          latitude: 27.9483,
          longitude: 116.3581,
        },
        profile: {
          city: '南昌',
        },
      },
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-weather-context-1',
                type: 'function',
                function: {
                  name: 'get_weather_forecast',
                  arguments: JSON.stringify({}),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        assert.match(toolMessage.content, /抚州/)
        return {
          role: 'assistant',
          content: '抚州今天多云，气温 20~28℃。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_LLM_WEATHER_CONTEXT_IS_AVAILABLE')
      },
    })

    assert.equal(sent.message.role, 'assistant')
    assert.match(sent.message.content, /抚州/)
    assert.match(sent.message.content, /20~28℃/)
    assert.equal(turn, 2)
  } finally {
    weatherModule.getWeatherForecast = originalGetWeatherForecast
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can let llm autonomously choose write tools and still require confirmation', async () => {
  const now = Date.now()
  const username = `unified_llm_write_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '待改颜色鞋子', '鞋类', '白色', '通勤', '春季', '', '', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '自主写工具会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这双鞋的颜色改成蓝色', {
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tool-write-1',
            type: 'function',
            function: {
              name: 'update_cloth_fields',
              arguments: JSON.stringify({ cloth_id: clothId, color: '蓝色' }),
            },
          },
        ],
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_LLM_AUTONOMOUS_TOOLS_HANDLE_WRITE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_cloth_fields')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const rows = await query('SELECT color FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, clothId])
    assert.equal(rows[0].color, '白色')
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can let llm autonomously export closet data', async () => {
  const now = Date.now()
  const username = `unified_export_closet_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const [name, type] of [['导出上衣', '上衣 / 通勤'], ['导出鞋子', '鞋子 / 休闲']]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, type, '黑色', '通勤', '春季', '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '导出衣橱会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我导出衣橱数据', {
      enableAutonomousTools: true,
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-export-1',
                type: 'function',
                function: {
                  name: 'export_closet_data',
                  arguments: JSON.stringify({ includeImages: false }),
                },
              },
            ],
          }
        }
        assert.equal(messages[messages.length - 1].role, 'tool')
        return {
          role: 'assistant',
          content: '已经帮你准备好衣橱导出数据了。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_FOR_AUTONOMOUS_EXPORT')
      },
    })

    assert.equal(sent.message.message_type, 'chat')
    assert.match(sent.message.content, /衣橱导出数据/)
    assert.equal(turn, 2)
  } finally {
    if (userId) {
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can let llm autonomously stage closet import with confirmation', async () => {
  const now = Date.now()
  const username = `unified_import_closet_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let importedIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '导入衣橱会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我把这份衣橱数据导入进去', {
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tool-import-1',
            type: 'function',
            function: {
              name: 'import_closet_data',
              arguments: JSON.stringify({
                items: [
                  {
                    name: '导入黑色上衣',
                    type: '上衣',
                    color: '黑色',
                    style: '通勤',
                    season: '春季',
                  },
                  {
                    name: '导入白色鞋子',
                    type: '鞋子',
                    color: '白色',
                    style: '休闲',
                    season: '四季',
                  },
                ],
              }),
            },
          },
        ],
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_FOR_AUTONOMOUS_IMPORT')
      },
    })

    assert.equal(sent.latest_task.taskType, 'import_closet_data')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const confirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    const rows = await query(
      'SELECT cloth_id, name FROM clothes WHERE user_id = ? AND name IN (?, ?) ORDER BY cloth_id ASC',
      [userId, '导入黑色上衣', '导入白色鞋子']
    )
    importedIds = rows.map((item) => item.cloth_id)
    assert.equal(rows.length, 2)
  } finally {
    if (userId) {
      if (importedIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [importedIds])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can let llm analyze one image and stage batch cloth creation', async () => {
  const now = Date.now()
  const username = `unified_llm_batch_ingest_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '批量识别衣物' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '直接把图里的衣物都存入衣橱', {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'multi-look.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
      enableAutonomousTools: true,
      analyzeImage: async () => ({
        summary: '图中有一件黑色针织上衣和一双白色运动鞋',
        category: '上衣',
        attributes: {
          color: ['黑色', '白色'],
          style: ['简约', '运动'],
          season: ['秋冬', '四季'],
          material: ['针织', '皮革'],
        },
        items: [
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
      }),
      requestAssistantTurn: async () => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-image-1',
                type: 'function',
                function: {
                  name: 'analyze_image',
                  arguments: JSON.stringify({ attachmentIndex: 0, question: '分析图片中的衣物并给出可录入字段' }),
                },
              },
            ],
          }
        }

        return {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tool-batch-create-1',
              type: 'function',
              function: {
                name: 'create_clothes_batch',
                arguments: JSON.stringify({
                  items: [
                    {
                      name: '黑色针织上衣',
                      type: '上衣',
                      color: '黑色',
                      style: '简约',
                      season: '秋冬',
                      material: '针织',
                      image: 'data:image/jpeg;base64,ZmFrZQ==',
                    },
                    {
                      name: '白色运动鞋',
                      type: '鞋子',
                      color: '白色',
                      style: '运动',
                      season: '四季',
                      material: '皮革',
                      image: 'data:image/jpeg;base64,ZmFrZQ==',
                    },
                  ],
                }),
              },
            },
          ],
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_BATCH_WRITE_IS_STAGED')
      },
    })

    assert.equal(sent.latest_task.taskType, 'create_clothes_batch')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.equal(sent.latest_task.confirmation?.details?.count, '2')
    assert.equal(sent.latest_task.confirmation?.details?.items?.length, 2)
    assert.equal(sent.latest_task.confirmation?.details?.items?.[0]?.name, '黑色针织上衣')
    assert.equal(sent.latest_task.confirmation?.details?.items?.[1]?.name, '白色运动鞋')

    const historyRows = await query(
      'SELECT confirmation_status, result_summary FROM agent_task_history WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [userId]
    )
    assert.equal(historyRows[0].confirmation_status, 'pending')
    assert.match(String(historyRows[0].result_summary || ''), /create_clothes_batch/)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent keeps the conversation alive when llm emits invalid write tool arguments', async () => {
  const now = Date.now()
  const username = `unified_llm_invalid_write_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '自主坏参数会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我把性别改掉', {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-write-invalid-1',
                type: 'function',
                function: {
                  name: 'update_user_sex',
                  arguments: JSON.stringify({}),
                },
              },
            ],
          }
        }
        assert.equal(messages[messages.length - 1].role, 'tool')
        return {
          role: 'assistant',
          content: '我还需要你告诉我要改成男还是女。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_WHEN_INVALID_WRITE_TOOL_IS_RECOVERED')
      },
    })

    assert.equal(sent.message.message_type, 'chat')
    assert.match(sent.message.content, /改成男还是女/)
    assert.equal(turn, 2)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent autonomous mode does not run legacy image workflow first', async () => {
  const now = Date.now()
  const username = `unified_autonomous_skip_legacy_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '跳过旧图片工作流会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这张图片存入我的衣橱', {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'coat.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
      enableAutonomousTools: true,
      analyzeImage: async () => {
        throw new Error('SHOULD_NOT_RUN_LEGACY_IMAGE_WORKFLOW_FIRST')
      },
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '我先看看这张图片，再决定下一步。',
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_IN_AUTONOMOUS_MODE')
      },
    })

    assert.equal(sent.message.message_type, 'chat')
    assert.match(sent.message.content, /先看看这张图片/)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent auto-stages image save confirmation when analysis reply stops at natural language confirmation', async () => {
  const now = Date.now()
  const username = `unified_autostage_image_save_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '自动挂起图片保存会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我分析这张衣物图片，并在确认后帮我录入衣橱', {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'shorts.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
      enableAutonomousTools: true,
      analyzeImage: async () => ({
        summary: '识别到一条黑色运动短裤',
        category: '下衣',
        attributes: {
          color: ['黑色'],
          style: ['运动'],
          season: ['四季'],
          material: ['聚酯纤维'],
        },
        items: [
          {
            name: '黑色运动短裤',
            type: '下衣',
            color: '黑色',
            style: '运动',
            season: '四季',
            material: '聚酯纤维',
          },
        ],
      }),
      requestAssistantTurn: async (messages) => {
        const latest = messages[messages.length - 1]
        if (latest?.role !== 'tool') {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-image-1',
                type: 'function',
                function: {
                  name: 'analyze_image',
                  arguments: JSON.stringify({
                    attachmentIndex: 0,
                    question: '帮我分析这张衣物图片，并在确认后帮我录入衣橱',
                  }),
                },
              },
            ],
          }
        }

        return {
          role: 'assistant',
          content: '我已经识别出这是一条黑色运动短裤，确认无误的话我就帮你存入衣橱。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_CHAT_REPLY_WHEN_IMAGE_SAVE_CONFIRMATION_IS_AUTO_STAGED')
      },
    })

    assert.equal(sent.message.message_type, 'confirm_request')
    assert.equal(sent.latest_task.taskType, 'create_cloth')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)
    assert.equal(sent.latest_task.confirmation?.details?.name, '黑色运动短裤')
    assert.equal(sent.latest_task.confirmation?.details?.type, '下衣')
    assert.equal(sent.latest_task.confirmation?.previewImages?.length, 1)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent auto-shows current cloth image after confirmed save even when llm misses the media tool', async () => {
  const now = Date.now()
  const username = `unified_autoshow_saved_image_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let createdClothId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '展示刚保存图片会话' })
    sessionId = created.session.id

    const staged = await sendUnifiedAgentMessage(userId, sessionId, '帮我分析这张衣物图片，并在确认后帮我录入衣橱', {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'shorts.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
      enableAutonomousTools: true,
      analyzeImage: async () => ({
        summary: '识别到一条黑色运动短裤',
        items: [
          {
            name: '黑色运动短裤',
            type: '下衣',
            color: '黑色',
            style: '运动',
            season: '四季',
            material: '聚酯纤维',
          },
        ],
      }),
      requestAssistantTurn: async (messages) => {
        const latest = messages[messages.length - 1]
        if (latest?.role !== 'tool') {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-image-1',
                type: 'function',
                function: {
                  name: 'analyze_image',
                  arguments: JSON.stringify({
                    attachmentIndex: 0,
                    question: '帮我分析这张衣物图片，并在确认后帮我录入衣橱',
                  }),
                },
              },
            ],
          }
        }

        return {
          role: 'assistant',
          content: '我已经识别出这是一条黑色运动短裤，确认无误的话我就帮你存入衣橱。',
        }
      },
    })

    const confirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      staged.latest_task.confirmation.confirmId
    )
    createdClothId = confirmed.latest_task.relatedObjectId

    const shown = await sendUnifiedAgentMessage(userId, sessionId, '将刚刚我让你存入衣橱的那个黑色裤子的图片展示给我看看', {
      latestTask: confirmed.latest_task,
      enableAutonomousTools: true,
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '抱歉，我查看了一下你的衣橱，目前并没有找到刚才那条黑色运动短裤的记录。',
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_PLAIN_CHAT_REPLY_WHEN_CONTEXT_IMAGE_CAN_BE_AUTO_SHOWN')
      },
    })

    assert.equal(shown.message.message_type, 'chat')
    assert.match(shown.message.content, /已准备当前衣物图片/)
    assert.equal(shown.message.attachments?.length, 1)
    assert.equal(shown.message.attachments?.[0]?.objectType, 'cloth')
    assert.equal(shown.message.attachments?.[0]?.objectId, createdClothId)
  } finally {
    if (userId) {
      if (createdClothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [createdClothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can let llm autonomously save a recommended suit with confirmation', async () => {
  const now = Date.now()
  const username = `unified_llm_save_suit_${now}_${Math.random().toString(16).slice(2, 8)}`
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
      ['自主保存上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['自主保存下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '自主保存套装会话' })
    sessionId = created.session.id

    const latestTask = {
      taskType: 'recommendation',
      result: {
        recommendationHistoryId: null,
        suits: [
          {
            scene: '通勤',
            reason: '通勤规则：平衡上/下装与配色',
            items: clothIds.map((clothId, index) => ({
              cloth_id: clothId,
              name: index === 0 ? '自主保存上衣' : '自主保存下衣',
              type: index === 0 ? '上衣 / 通勤' : '下衣 / 通勤',
              color: index === 0 ? '黑色' : '白色',
            })),
          },
        ],
      },
    }

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把刚才那套保存成套装', {
      latestTask,
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tool-save-suit-1',
            type: 'function',
            function: {
              name: 'save_suit',
              arguments: JSON.stringify({ suitIndex: 0 }),
            },
          },
        ],
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_FOR_AUTONOMOUS_SAVE_SUIT')
      },
    })

    assert.equal(sent.latest_task.taskType, 'save_suit')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const confirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    const suits = await query('SELECT suit_id FROM suits WHERE user_id = ?', [userId])
    suitIds = suits.map((item) => item.suit_id)
    assert.ok(suitIds.length >= 1)
  } finally {
    if (userId) {
      if (suitIds.length) {
        await query('DELETE FROM suit_items WHERE suit_id IN (?)', [suitIds])
        await query('DELETE FROM suits WHERE suit_id IN (?)', [suitIds])
      }
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM recommendation_feedback WHERE user_id = ?', [userId])
      await query('DELETE FROM recommendation_history WHERE user_id = ?', [userId])
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can let llm autonomously execute low-risk write tool without confirmation when preference is enabled', async () => {
  const now = Date.now()
  const username = `unified_llm_lowrisk_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const clothRes = await query(
      `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, favorite, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, '自主低风险衣物', '上衣 / 通勤', '黑色', '通勤', '春季', '', '', 0, now, now]
    )
    clothId = clothRes.insertId

    await updateConfirmationPreferences(userId, { lowRiskNoConfirm: true })

    const created = await createAgentSession(userId, { firstMessage: '低风险自主执行会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我把这件衣服收藏起来', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '自主低风险衣物',
          favorite: 0,
        },
      },
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tool-set-favorite-1',
            type: 'function',
            function: {
              name: 'set_cloth_favorite',
              arguments: JSON.stringify({ cloth_id: clothId, favorite: true }),
            },
          },
        ],
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_FOR_LOW_RISK_WRITE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'toggle_favorite')
    assert.equal(sent.latest_task.requiresConfirmation, false)
    assert.equal(sent.latest_task.status, 'success')

    const rows = await query('SELECT favorite FROM clothes WHERE cloth_id = ? AND user_id = ?', [clothId, userId])
    assert.equal(Number(rows[0]?.favorite || 0), 1)
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can let llm autonomously combine profile and analytics tools', async () => {
  const now = Date.now()
  const username = `unified_llm_profile_analytics_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['分析上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['分析鞋子', '鞋类', '白色', '休闲', '秋季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '自主画像分析会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我看看我的风格画像和衣橱分析', {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-profile-1',
                type: 'function',
                function: {
                  name: 'get_profile_insight',
                  arguments: JSON.stringify({}),
                },
              },
              {
                id: 'tool-analytics-1',
                type: 'function',
                function: {
                  name: 'get_wardrobe_analytics',
                  arguments: JSON.stringify({}),
                },
              },
            ],
          }
        }
        return {
          role: 'assistant',
          content: '我已经结合你的偏好画像和衣橱分析整理好了结果。',
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_FOR_AUTONOMOUS_PROFILE_ANALYTICS')
      },
    })

    assert.equal(sent.message.message_type, 'chat')
    assert.match(sent.message.content, /偏好画像和衣橱分析/)
    assert.equal(turn, 2)
  } finally {
    if (userId) {
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM recommendation_feedback WHERE user_id = ?', [userId])
      await query('DELETE FROM recommendation_history WHERE user_id = ?', [userId])
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent autonomous mode does not let legacy contextual write parser override llm decision', async () => {
  const now = Date.now()
  const username = `unified_autonomous_skip_context_parser_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '上下文测试衣物', '上衣 / 通勤', '白色', '通勤', '春季', '', '', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '跳过旧上下文解析会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这件衣服颜色改成蓝色', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '上下文测试衣物',
          color: '白色',
          type: '上衣 / 通勤',
        },
      },
      enableAutonomousTools: true,
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '我先确认一下，你是想把这件衣服改成更偏深蓝还是浅蓝？',
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_IN_AUTONOMOUS_CONTEXT_TEST')
      },
    })

    assert.equal(sent.message.message_type, 'chat')
    assert.match(sent.message.content, /深蓝|浅蓝/)

    const rows = await query('SELECT color FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, clothId])
    assert.equal(rows[0].color, '白色')
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
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
        [userId, row[0], row[1], row[2], row[3], row[4], '', `data:image/png;base64,${Buffer.from(row[0]).toString('base64')}`, now, now]
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
    assert.ok(Array.isArray(sent.message.attachments))
    assert.ok(sent.message.attachments.length >= 2)
    assert.equal(sent.message.attachments[0].variant, 'composite')
    assert.equal(sent.restored.recent_messages.length, 2)
    assert.equal(sent.restored.recent_messages[1].content, '当前展示 1 套推荐')
    assert.ok(Array.isArray(sent.restored.recent_messages[1].attachments))
    assert.equal(sent.restored.recent_messages[1].attachments[0].variant, 'composite')
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

test('unified agent can confirm create outfit log inside same session', async () => {
  const now = Date.now()
  const username = `unified_outfit_log_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let outfitLogIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['统一穿搭上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['统一穿搭下衣', '下衣 / 通勤', '蓝色', '通勤', '秋季'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const created = await createAgentSession(userId, { firstMessage: '记录穿搭会话' })
    sessionId = created.session.id

    const recommended = await sendUnifiedAgentMessage(userId, sessionId, '帮我推荐一套通勤穿搭', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_TASK')
      },
    })

    const pending = await sendUnifiedAgentMessage(userId, sessionId, '把当前推荐记成今天穿搭', {
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

    const logs = await query('SELECT id FROM outfit_logs WHERE user_id = ?', [userId])
    outfitLogIds = logs.map((item) => item.id)
    assert.ok(outfitLogIds.length >= 1)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      if (outfitLogIds.length) {
        await query('DELETE FROM outfit_log_items WHERE outfit_log_id IN (?)', [outfitLogIds])
        await query('DELETE FROM outfit_logs WHERE id IN (?)', [outfitLogIds])
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
    assert.equal(sessions[0].last_message_preview, '暂未生成推荐')
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

test('unified agent can use contextual cloth state for favorite toggle confirmation', async () => {
  const now = Date.now()
  const username = `unified_cloth_ctx_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '上下文衣物', '上衣 / 通勤', '黑色', '通勤', '春季', '', '', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '衣物上下文会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我收藏这件衣服', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '上下文衣物',
          favorite: 0,
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_FAVORITE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'toggle_favorite')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can read current cloth details from contextual state', async () => {
  const now = Date.now()
  const username = `unified_cloth_detail_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '白色鞋子', '鞋类 / 运动鞋', '白色', '休闲', '夏季', '帆布', 'data:image/png;base64,c2hvZQ==', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '衣物详情会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '查看刚刚添加的这个白色鞋子的具体信息', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '白色鞋子',
          type: '鞋类 / 运动鞋',
          color: '白色',
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_CLOTH_DETAIL')
      },
    })

    assert.equal(sent.latest_task.taskType, 'cloth_detail')
    assert.equal(sent.latest_task.result.selectedCloth.cloth_id, clothId)
    assert.match(sent.latest_task.summary, /白色鞋子/)
    assert.match(sent.latest_task.summary, /类型：鞋类/)
    assert.doesNotMatch(sent.latest_task.summary, /查询到 .* 件衣物/)
    assert.deepEqual(sent.message.attachments, [
      {
        type: 'image',
        name: '白色鞋子',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,c2hvZQ==',
        source: 'wardrobe',
        variant: 'original',
        objectType: 'cloth',
        objectId: clothId,
      },
    ])
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update low-risk confirmation preference from natural language', async () => {
  const now = Date.now()
  const username = `unified_pref_ctx_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '偏好设置会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '帮我开启低风险操作免确认', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONFIRMATION_PREFERENCE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_confirmation_preferences')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update current cloth fields from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_cloth_update_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '可修改衣物', '上衣 / 通勤', '黑色', '通勤', '春季', '', '', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '衣物编辑会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这件衣服颜色改成蓝色', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '可修改衣物',
          type: '上衣 / 通勤',
          color: '黑色',
          style: '通勤',
          season: '春季',
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_CLOTH_UPDATE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_cloth_fields')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.latest_task.relatedObjectType, 'cloth')

    const rows = await query('SELECT color FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, clothId])
    assert.equal(rows[0].color, '蓝色')
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update current cloth material from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_cloth_material_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '可改材质衣物', '上衣 / 通勤', '灰色', '通勤', '秋季', '棉', '', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '衣物材质编辑会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这件衣服材质改成羊毛', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '可改材质衣物',
          type: '上衣 / 通勤',
          color: '灰色',
          style: '通勤',
          season: '秋季',
          material: '棉',
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_CLOTH_MATERIAL_UPDATE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_cloth_fields')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    const rows = await query('SELECT material FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, clothId])
    assert.equal(rows[0].material, '羊毛')
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update current cloth image from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_cloth_image_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '可改图片衣物', '上衣 / 通勤', '黑色', '通勤', '春季', '', 'data:image/jpeg;base64,b2xk', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '衣物图片编辑会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这张图替换成这件衣服的图片', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '可改图片衣物',
          type: '上衣 / 通勤',
          color: '黑色',
          style: '通勤',
          season: '春季',
        },
      },
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'new-cloth.jpg',
          dataUrl: 'data:image/jpeg;base64,bmV3',
        },
      ],
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_CLOTH_IMAGE_UPDATE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_cloth_image')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const confirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.latest_task.relatedObjectType, 'cloth')
    const rows = await query('SELECT image FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, clothId])
    assert.equal(rows[0].image, 'data:image/jpeg;base64,bmV3')
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update current cloth type from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_cloth_type_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '可改类型衣物', '上衣 / 通勤', '蓝色', '通勤', '春季', '', '', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '衣物类型编辑会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这件衣服类型改成上衣 / 休闲', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '可改类型衣物',
          type: '上衣 / 通勤',
          color: '蓝色',
          style: '通勤',
          season: '春季',
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_CLOTH_TYPE_UPDATE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_cloth_fields')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    const rows = await query('SELECT type FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, clothId])
    assert.equal(rows[0].type, '上衣/休闲')
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can delete current cloth from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_cloth_delete_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
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
      [userId, '待删除衣物', '上衣 / 通勤', '白色', '通勤', '春季', '', '', now, now]
    )
    clothId = clothRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '衣物删除会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '删除这件衣服', {
      latestTask: {
        selectedCloth: {
          cloth_id: clothId,
          name: '待删除衣物',
          type: '上衣 / 通勤',
          color: '白色',
          style: '通勤',
          season: '春季',
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_CLOTH_DELETE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'delete_cloth')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.latest_task.relatedObjectType, 'cloth')

    const rows = await query('SELECT cloth_id FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, clothId])
    assert.equal(rows.length, 0)
    clothId = null
  } finally {
    if (userId) {
      if (clothId) {
        await query('DELETE FROM clothes WHERE cloth_id = ?', [clothId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can delete current suit from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_suit_delete_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let suitId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['待删套装上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['待删套装下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
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
      [userId, '待删除套装', '通勤', '', '', 'manual', clothIds.slice().sort((a, b) => a - b).join('-'), now, now]
    )
    suitId = suitRes.insertId
    await query('INSERT INTO suit_items (suit_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [suitId, clothId, index]),
    ])

    const created = await createAgentSession(userId, { firstMessage: '套装删除会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '删除这套搭配', {
      latestTask: {
        selectedSuit: {
          suit_id: suitId,
          name: '待删除套装',
          scene: '通勤',
          item_count: 2,
          items: clothIds.map((clothId) => ({ cloth_id: clothId })),
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_SUIT_DELETE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'delete_suit')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.latest_task.relatedObjectType, 'suit')

    const rows = await query('SELECT suit_id FROM suits WHERE user_id = ? AND suit_id = ?', [userId, suitId])
    assert.equal(rows.length, 0)
    suitId = null
  } finally {
    if (userId) {
      if (suitId) {
        await query('DELETE FROM suit_items WHERE suit_id = ?', [suitId])
        await query('DELETE FROM suits WHERE suit_id = ?', [suitId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can read current suit details from contextual state', async () => {
  const now = Date.now()
  const username = `unified_suit_detail_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let suitId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['套装详情上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['套装详情下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
    ]) {
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', `data:image/png;base64,${Buffer.from(row[0]).toString('base64')}`, now, now]
      )
      clothIds.push(res.insertId)
    }

    const suitRes = await query(
      'INSERT INTO suits (user_id, name, scene, description, cover, source, signature, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, '通勤套装详情', '通勤', '测试详情', '', 'manual', clothIds.slice().sort((a, b) => a - b).join('-'), now, now]
    )
    suitId = suitRes.insertId
    await query('INSERT INTO suit_items (suit_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [suitId, clothId, index]),
    ])

    const created = await createAgentSession(userId, { firstMessage: '套装详情会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '看看当前这套搭配的详情', {
      latestTask: {
        selectedSuit: {
          suit_id: suitId,
          name: '通勤套装详情',
          scene: '通勤',
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_SUIT_DETAIL')
      },
    })

    assert.equal(sent.latest_task.taskType, 'suit_detail')
    assert.equal(sent.latest_task.result.selectedSuit.suit_id, suitId)
    assert.match(sent.latest_task.summary, /通勤套装详情/)
    assert.ok(Array.isArray(sent.message.attachments))
    assert.equal(sent.message.attachments[0].objectType, 'suit')
    assert.equal(sent.message.attachments[0].variant, 'composite')
  } finally {
    if (userId) {
      if (suitId) {
        await query('DELETE FROM suit_items WHERE suit_id = ?', [suitId])
        await query('DELETE FROM suits WHERE suit_id = ?', [suitId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can delete current outfit log from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_outfit_log_delete_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let outfitLogId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['待删记录上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['待删记录下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
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
      [userId, null, null, '2026-04-25', '通勤', '', 4, 'manual', '待删除穿搭记录', now, now]
    )
    outfitLogId = logRes.insertId
    await query('INSERT INTO outfit_log_items (outfit_log_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [outfitLogId, clothId, index]),
    ])

    const created = await createAgentSession(userId, { firstMessage: '穿搭记录删除会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '删除这条穿搭记录', {
      latestTask: {
        selectedOutfitLog: {
          id: outfitLogId,
          log_date: '2026-04-25',
          scene: '通勤',
          items: clothIds.map((clothId) => ({ cloth_id: clothId })),
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_OUTFIT_LOG_DELETE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'delete_outfit_log')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.latest_task.relatedObjectType, 'outfit_log')

    const rows = await query('SELECT id FROM outfit_logs WHERE user_id = ? AND id = ?', [userId, outfitLogId])
    assert.equal(rows.length, 0)
    outfitLogId = null
  } finally {
    if (userId) {
      if (outfitLogId) {
        await query('DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [outfitLogId])
        await query('DELETE FROM outfit_logs WHERE id = ?', [outfitLogId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can read current outfit log details from contextual state', async () => {
  const now = Date.now()
  const username = `unified_outfit_log_detail_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let outfitLogId = null
  let clothIds = []

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const row of [
      ['记录详情上衣', '上衣 / 通勤', '黑色', '通勤', '春季'],
      ['记录详情下衣', '下衣 / 通勤', '白色', '通勤', '春季'],
    ]) {
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row[0], row[1], row[2], row[3], row[4], '', `data:image/png;base64,${Buffer.from(row[0]).toString('base64')}`, now, now]
      )
      clothIds.push(res.insertId)
    }

    const logRes = await query(
      `INSERT INTO outfit_logs (
        user_id, recommendation_id, suit_id, log_date, scene, weather_summary,
        satisfaction, source, note, create_time, update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, null, null, '2026-04-25', '通勤', '', 4, 'manual', '详情记录', now, now]
    )
    outfitLogId = logRes.insertId
    await query('INSERT INTO outfit_log_items (outfit_log_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [outfitLogId, clothId, index]),
    ])

    const created = await createAgentSession(userId, { firstMessage: '穿搭记录详情会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '看看当前这条穿搭记录的详情', {
      latestTask: {
        selectedOutfitLog: {
          id: outfitLogId,
          log_date: '2026-04-25',
          scene: '通勤',
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CONTEXTUAL_OUTFIT_LOG_DETAIL')
      },
    })

    assert.equal(sent.latest_task.taskType, 'outfit_log_detail')
    assert.equal(sent.latest_task.result.selectedOutfitLog.id, outfitLogId)
    assert.match(sent.latest_task.summary, /2026-04-25/)
    assert.ok(Array.isArray(sent.message.attachments))
    assert.equal(sent.message.attachments[0].objectType, 'outfit_log')
    assert.equal(sent.message.attachments[0].variant, 'composite')
  } finally {
    if (userId) {
      if (outfitLogId) {
        await query('DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [outfitLogId])
        await query('DELETE FROM outfit_logs WHERE id = ?', [outfitLogId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update current outfit log from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_update_outfit_log_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let clothIds = []
  let outfitLogId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    for (const [name, type] of [['记录上衣', '上衣 / 通勤'], ['记录下衣', '下衣 / 通勤']]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, type, '黑色', '通勤', '春季', '', '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const logRes = await query(
      `INSERT INTO outfit_logs (user_id, recommendation_id, suit_id, log_date, scene, weather_summary, satisfaction, source, note, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, null, null, '2026-04-26', '日常', '', 3, 'manual', '', now, now]
    )
    outfitLogId = logRes.insertId
    await query('INSERT INTO outfit_log_items (outfit_log_id, cloth_id, sort_order) VALUES ?', [
      clothIds.map((clothId, index) => [outfitLogId, clothId, index]),
    ])

    const created = await createAgentSession(userId, { firstMessage: '穿搭记录更新会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这条穿搭记录改成通勤并补一句备注今天太热了', {
      latestTask: {
        selectedOutfitLog: {
          id: outfitLogId,
          log_date: '2026-04-26',
          scene: '日常',
          weather_summary: '',
          satisfaction: 3,
          note: '',
          items: clothIds.map((cloth_id) => ({ cloth_id })),
        },
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_OUTFIT_LOG_UPDATE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_outfit_log')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const confirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    const rows = await query('SELECT scene, note FROM outfit_logs WHERE user_id = ? AND id = ?', [userId, outfitLogId])
    assert.equal(rows[0].scene, '通勤')
    assert.equal(rows[0].note, '今天太热了')
  } finally {
    if (userId) {
      if (outfitLogId) {
        await query('DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [outfitLogId])
        await query('DELETE FROM outfit_logs WHERE id = ?', [outfitLogId])
      }
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update user sex from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_update_sex_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, sex, create_time, update_time) VALUES (?, ?, ?, ?, ?)',
      [username, 'test-password', 'man', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '资料修改会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把我的性别改成女', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_USER_SEX_UPDATE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_user_sex')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const { confirmUnifiedAgentAction } = require('../controllers/unifiedAgentRuntime')
    const confirmed = await confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.latest_task.relatedObjectType, 'profile')

    const rows = await query('SELECT sex FROM user WHERE id = ?', [userId])
    assert.equal(rows[0].sex, 'woman')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update user name from natural language with confirmation', async () => {
  const now = Date.now()
  const username = `unified_update_name_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, name, create_time, update_time) VALUES (?, ?, ?, ?, ?)',
      [username, 'test-password', '旧昵称', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '昵称修改会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把我的昵称改成新的名字', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_USER_NAME_UPDATE')
      },
    })

    assert.equal(sent.latest_task.taskType, 'update_user_name')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const confirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    const rows = await query('SELECT name FROM user WHERE id = ?', [userId])
    assert.equal(rows[0].name, '新的名字')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can update avatar from autonomous tool call with confirmation', async () => {
  const now = Date.now()
  const username = `unified_avatar_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '头像更新会话' })
    sessionId = created.session.id

    const sent = await sendUnifiedAgentMessage(userId, sessionId, '把这张图片设为我的头像', {
      enableAutonomousTools: true,
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tool-avatar-1',
            type: 'function',
            function: {
              name: 'upload_user_avatar',
              arguments: JSON.stringify({ image: 'data:image/jpeg;base64,YXZhdGFy' }),
            },
          },
        ],
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_FOR_AVATAR_UPLOAD')
      },
    })

    assert.equal(sent.latest_task.taskType, 'upload_user_avatar')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)

    const confirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      sent.latest_task.confirmation.confirmId
    )

    assert.equal(confirmed.latest_task.status, 'success')
    const rows = await query('SELECT avatar FROM user WHERE id = ?', [userId])
    assert.equal(rows[0].avatar, 'data:image/jpeg;base64,YXZhdGFy')
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test('unified agent can upload and delete character model with confirmation', async () => {
  const now = Date.now()
  const username = `unified_model_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '模特更新会话' })
    sessionId = created.session.id

    const uploaded = await sendUnifiedAgentMessage(userId, sessionId, '把这张图片设为我的人物模特', {
      enableAutonomousTools: true,
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tool-model-upload-1',
            type: 'function',
            function: {
              name: 'upload_character_model',
              arguments: JSON.stringify({ image: 'data:image/jpeg;base64,bW9kZWw=' }),
            },
          },
        ],
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_GENERATE_REPLY_FOR_CHARACTER_MODEL_UPLOAD')
      },
    })

    assert.equal(uploaded.latest_task.taskType, 'upload_character_model')
    const uploadConfirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      uploaded.latest_task.confirmation.confirmId
    )
    assert.equal(uploadConfirmed.latest_task.status, 'success')

    let rows = await query('SELECT characterModel FROM user WHERE id = ?', [userId])
    assert.equal(rows[0].characterModel, 'data:image/jpeg;base64,bW9kZWw=')

    const deleted = await sendUnifiedAgentMessage(userId, sessionId, '删除我的人物模特', {
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_LLM_FOR_CHARACTER_MODEL_DELETE')
      },
    })

    assert.equal(deleted.latest_task.taskType, 'delete_character_model')
    const deleteConfirmed = await require('../controllers/unifiedAgentRuntime').confirmUnifiedAgentAction(
      userId,
      sessionId,
      deleted.latest_task.confirmation.confirmId
    )
    assert.equal(deleteConfirmed.latest_task.status, 'success')

    rows = await query('SELECT characterModel FROM user WHERE id = ?', [userId])
    assert.equal(rows[0].characterModel, null)
  } finally {
    if (userId) {
      if (sessionId) {
        await query('DELETE FROM agent_session_memory WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_messages WHERE session_id = ?', [sessionId])
        await query('DELETE FROM agent_sessions WHERE id = ?', [sessionId])
      }
      await query('DELETE FROM agent_task_history WHERE user_id = ?', [userId])
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
