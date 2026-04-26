const test = require('node:test')
const assert = require('node:assert/strict')

const { pool, query } = require('../models/db')
const {
  createAgentSession,
  restoreAgentSession,
  sendUnifiedAgentMessage,
  confirmUnifiedAgentAction,
} = require('../controllers/unifiedAgentRuntime')

test('unified agent can ingest cloth from image with confirmation flow', async () => {
  const now = Date.now()
  const username = `agent_ingest_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let createdClothId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '录入衣物' })
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
      analyzeImage: async () => ({
        type: '上衣',
        color: '黑色',
        style: '通勤',
        season: '春秋',
        material: '棉',
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_CHAT_REPLY_FOR_INGEST_WORKFLOW')
      },
    })

    assert.equal(sent.latest_task.taskType, 'create_cloth')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.match(sent.latest_task.summary, /衣橱/)
    assert.ok(sent.latest_task.confirmation?.confirmId)
    assert.deepEqual(sent.latest_task.confirmation?.details, {
      name: '黑色上衣',
      type: '上衣',
      color: '黑色',
      style: '通勤',
      season: '春秋',
      material: '棉',
    })
    assert.equal(sent.latest_task.confirmation?.previewImages?.length, 1)

    const confirmed = await confirmUnifiedAgentAction(userId, sessionId, sent.latest_task.confirmation.confirmId)
    createdClothId = confirmed.latest_task.relatedObjectId

    assert.equal(confirmed.latest_task.status, 'success')
    assert.equal(confirmed.latest_task.relatedObjectType, 'cloth')
    assert.equal(confirmed.latest_task.summary, '已将“黑色上衣”保存到衣橱')
    assert.equal(confirmed.latest_task.selectedCloth?.cloth_id, createdClothId)
    assert.equal(confirmed.latest_task.result?.selectedCloth?.cloth_id, createdClothId)

    const rows = await query('SELECT * FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, createdClothId])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].type.includes('上衣'), true)
    assert.equal(rows[0].color, '黑色')

    const restoredAfterConfirm = await restoreAgentSession(userId, sessionId)
    const latestMessage = restoredAfterConfirm.recent_messages.slice(-1)[0]
    assert.equal(latestMessage.message_type, 'confirm_result')
    assert.equal(latestMessage.content, '已将“黑色上衣”保存到衣橱')
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

test('unified agent restore keeps pending cloth confirmation payload', async () => {
  const now = Date.now()
  const username = `agent_ingest_restore_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '录入衣物' })
    sessionId = created.session.id

    await sendUnifiedAgentMessage(userId, sessionId, '把这张图片存入我的衣橱', {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'coat.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
      analyzeImage: async () => ({
        type: '上衣',
        color: '黑色',
        style: '通勤',
        season: '春秋',
        material: '棉',
      }),
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_CHAT_REPLY_FOR_INGEST_WORKFLOW')
      },
    })

    const restored = await restoreAgentSession(userId, sessionId)
    const lastMessage = restored.recent_messages.slice(-1)[0]

    assert.equal(lastMessage.message_type, 'confirm_request')
    assert.ok(lastMessage.meta?.pendingConfirmation?.confirmId)
    assert.match(lastMessage.meta.pendingConfirmation.scope, /上衣/)
    assert.equal(lastMessage.meta.pendingConfirmation.details?.color, '黑色')
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

test('unified agent can ingest cloth from image through autonomous tool loop', async () => {
  const now = Date.now()
  const username = `agent_ingest_autonomous_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let sessionId = null
  let createdClothId = null
  let turn = 0

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const created = await createAgentSession(userId, { firstMessage: '自主录入衣物' })
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
      analyzeImage: async (payload, options = {}) => {
        const dataUrl = typeof payload === 'string' ? payload : payload?.dataUrl
        const question = typeof payload === 'string' ? options.question : payload?.question
        assert.match(dataUrl, /^data:image\/jpeg;base64,/)
        assert.match(question, /存入我的衣橱/)
        return {
          type: '上衣',
          color: '黑色',
          style: '通勤',
          season: '春秋',
          material: '棉',
          summary: '识别到一件黑色通勤上衣',
        }
      },
      requestAssistantTurn: async (messages) => {
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
                  arguments: JSON.stringify({
                    attachmentIndex: 0,
                    question: '把这张图片存入我的衣橱',
                  }),
                },
              },
            ],
          }
        }
        assert.equal(messages[messages.length - 1].role, 'tool')
        return {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tool-image-2',
              type: 'function',
              function: {
                name: 'create_cloth',
                arguments: JSON.stringify({
                  name: '黑色上衣',
                  type: '上衣',
                  color: '黑色',
                  style: '通勤',
                  season: '春秋',
                  material: '棉',
                  image: 'data:image/jpeg;base64,ZmFrZQ==',
                }),
              },
            },
          ],
        }
      },
      generateReply: async () => {
        throw new Error('SHOULD_NOT_USE_CHAT_REPLY_FOR_AUTONOMOUS_INGEST_WORKFLOW')
      },
    })

    assert.equal(turn, 2)
    assert.equal(sent.latest_task.taskType, 'create_cloth')
    assert.equal(sent.latest_task.requiresConfirmation, true)
    assert.ok(sent.latest_task.confirmation?.confirmId)
    assert.equal(sent.latest_task.confirmation?.details?.name, '黑色上衣')
    assert.equal(sent.latest_task.confirmation?.previewImages?.length, 1)
    assert.ok(sent.message.meta?.toolCalls?.length >= 2)
    assert.equal(typeof sent.message.meta?.reasoningContent, 'string')

    const confirmed = await confirmUnifiedAgentAction(userId, sessionId, sent.latest_task.confirmation.confirmId)
    createdClothId = confirmed.latest_task.relatedObjectId

    assert.equal(confirmed.latest_task.status, 'success')
    const rows = await query('SELECT color, type FROM clothes WHERE user_id = ? AND cloth_id = ?', [userId, createdClothId])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].color, '黑色')
    assert.equal(rows[0].type.includes('上衣'), true)
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

test.after(async () => {
  try {
    await pool.promise().end()
  } catch {}
})
