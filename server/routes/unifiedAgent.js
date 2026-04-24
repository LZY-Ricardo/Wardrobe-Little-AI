const Router = require('@koa/router')
const router = new Router()
const { verify } = require('../utils/jwt')
const {
  appendAgentMessage,
  cancelUnifiedAgentAction,
  confirmUnifiedAgentAction,
  createAgentSession,
  listAgentSessions,
  restoreAgentSession,
  sendUnifiedAgentMessage,
  updateAgentSessionMemory,
} = require('../controllers/unifiedAgentRuntime')

router.prefix('/unified-agent')
router.use(verify())

router.post('/sessions', async (ctx) => {
  const data = await createAgentSession(ctx.userId, ctx.request.body || {})
  ctx.body = { code: 1, data, msg: '创建成功' }
})

router.get('/sessions', async (ctx) => {
  const limit = Number.parseInt(String(ctx.query?.limit || '20'), 10)
  const data = await listAgentSessions(ctx.userId, limit)
  ctx.body = { code: 1, data, msg: '获取成功' }
})

router.get('/sessions/:id', async (ctx) => {
  try {
    const sessionId = Number.parseInt(ctx.params.id, 10)
    if (!Number.isFinite(sessionId)) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '会话 ID 无效' }
      return
    }
    const data = await restoreAgentSession(ctx.userId, sessionId)
    ctx.body = { code: 1, data, msg: '获取成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '恢复会话失败' }
  }
})

router.post('/sessions/:id/messages', async (ctx) => {
  try {
    const sessionId = Number.parseInt(ctx.params.id, 10)
    if (!Number.isFinite(sessionId)) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '会话 ID 无效' }
      return
    }
    const data = await appendAgentMessage(ctx.userId, sessionId, ctx.request.body || {})
    ctx.body = { code: 1, data, msg: '写入成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '写入消息失败' }
  }
})

router.post('/sessions/:id/chat', async (ctx) => {
  try {
    const sessionId = Number.parseInt(ctx.params.id, 10)
    if (!Number.isFinite(sessionId)) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '会话 ID 无效' }
      return
    }
    const input = String(ctx.request.body?.input || '').trim()
    if (!input) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '消息内容不能为空' }
      return
    }
    const data = await sendUnifiedAgentMessage(ctx.userId, sessionId, input, {
      latestTask: ctx.request.body?.latestTask || null,
    })
    ctx.body = { code: 1, data, msg: '发送成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '发送消息失败' }
  }
})

router.post('/sessions/:id/confirm', async (ctx) => {
  try {
    const sessionId = Number.parseInt(ctx.params.id, 10)
    const confirmId = String(ctx.request.body?.confirmId || '').trim()
    if (!Number.isFinite(sessionId) || !confirmId) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '会话 ID 或确认码无效' }
      return
    }
    const data = await confirmUnifiedAgentAction(ctx.userId, sessionId, confirmId)
    ctx.body = { code: 1, data, msg: '确认成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '确认失败' }
  }
})

router.post('/sessions/:id/cancel', async (ctx) => {
  try {
    const sessionId = Number.parseInt(ctx.params.id, 10)
    const confirmId = String(ctx.request.body?.confirmId || '').trim()
    if (!Number.isFinite(sessionId) || !confirmId) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '会话 ID 或确认码无效' }
      return
    }
    const data = await cancelUnifiedAgentAction(ctx.userId, sessionId, confirmId)
    ctx.body = { code: 1, data, msg: '取消成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '取消失败' }
  }
})

router.post('/sessions/:id/memory', async (ctx) => {
  try {
    const sessionId = Number.parseInt(ctx.params.id, 10)
    if (!Number.isFinite(sessionId)) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '会话 ID 无效' }
      return
    }
    const data = await updateAgentSessionMemory(ctx.userId, sessionId, ctx.request.body || {})
    ctx.body = { code: 1, data, msg: '更新成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '更新会话摘要失败' }
  }
})

module.exports = router
