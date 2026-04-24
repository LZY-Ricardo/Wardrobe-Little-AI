const Router = require('@koa/router')
const router = new Router()
const { verify } = require('../utils/jwt')
const {
  executeAgentTask,
  listAgentTaskHistoryForUser,
  confirmAgentTask,
  cancelAgentTask,
} = require('../controllers/agent')

router.prefix('/agent')
router.use(verify())

router.post('/execute', async (ctx) => {
  const body = ctx.request.body || {}
  const input = String(body.input || '').trim()
  const sourceEntry = String(body.sourceEntry || 'agent-page').trim() || 'agent-page'
  if (!input) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '任务输入不能为空' }
    return
  }
  const data = await executeAgentTask(ctx.userId, input, sourceEntry, body.options || {})
  ctx.body = { code: 1, data, msg: '执行成功' }
})

router.get('/history', async (ctx) => {
  const limit = Number.parseInt(String(ctx.query?.limit || '20'), 10)
  const data = await listAgentTaskHistoryForUser(ctx.userId, limit)
  ctx.body = { code: 1, data, msg: '获取成功' }
})

router.post('/confirm', async (ctx) => {
  try {
    const confirmId = String(ctx.request.body?.confirmId || '').trim()
    if (!confirmId) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '确认码不能为空' }
      return
    }
    const data = await confirmAgentTask(ctx.userId, confirmId)
    ctx.body = { code: 1, data, msg: '确认成功' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '确认失败' }
  }
})

router.post('/cancel', async (ctx) => {
  try {
    const confirmId = String(ctx.request.body?.confirmId || '').trim()
    if (!confirmId) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '确认码不能为空' }
      return
    }
    const data = await cancelAgentTask(ctx.userId, confirmId)
    ctx.body = { code: 1, data, msg: '已取消' }
  } catch (error) {
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '取消失败' }
  }
})

module.exports = router
