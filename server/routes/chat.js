const Router = require('@koa/router')
const router = new Router()
const { verify } = require('../utils/jwt')
const { buildHelpMessage } = require('../utils/aichatPrompt')
const { getOrCreateLegacyChatSession, sendUnifiedAgentMessage } = require('../controllers/unifiedAgentRuntime')

router.prefix('/chat')

const normalizeMessages = (messages = []) =>
  (Array.isArray(messages) ? messages : [])
    .filter(Boolean)
    .map((item) => ({
      role: item?.role === 'bot' ? 'assistant' : item?.role,
      content: typeof item?.content === 'string' ? item.content : String(item?.content ?? ''),
    }))
    .filter((item) => item.role && item.content.trim())

const writeSseMessage = (ctx, message) => {
  ctx.res.write(`data: ${JSON.stringify(String(message ?? ''))}\n\n`)
}

const endSse = (ctx) => {
  ctx.res.write('data: [DONE]\n\n')
  ctx.res.end()
}

router.post('/', verify(), async (ctx) => {
  const { messages } = ctx.request.body || {}
  const safeMessages = normalizeMessages(messages)
  const lastUserText = [...safeMessages].reverse().find((item) => item.role === 'user')?.content || ''
  const input = String(lastUserText || '').trim()

  if (!input) {
    ctx.status = 400
    ctx.body = { code: 0, msg: 'Messages array is required and cannot be empty' }
    return
  }

  ctx.respond = false
  ctx.res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-Id',
  })

  try {
    if (input === '/help') {
      writeSseMessage(ctx, buildHelpMessage())
      endSse(ctx)
      return
    }

    const session = await getOrCreateLegacyChatSession(ctx.userId)
    const result = await sendUnifiedAgentMessage(ctx.userId, session.id, input)

    if (result?.latest_task?.requiresConfirmation) {
      const confirmation = result.latest_task.confirmation
      writeSseMessage(
        ctx,
        [
          '⚠️ 待确认操作',
          `摘要：${result.latest_task.summary}`,
          `确认码：${confirmation?.confirmId || ''}`,
          `影响范围：${confirmation?.scope || ''}`,
          `风险提示：${confirmation?.risk || ''}`,
        ].join('\n')
      )
      endSse(ctx)
      return
    }

    const assistantText = result?.message?.content || result?.latest_task?.summary || '已处理你的请求。'
    writeSseMessage(ctx, assistantText)
    endSse(ctx)
  } catch (error) {
    writeSseMessage(ctx, error.message || '聊天请求失败')
    endSse(ctx)
  }
})

module.exports = router
