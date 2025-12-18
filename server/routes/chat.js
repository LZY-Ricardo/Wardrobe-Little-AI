const Router = require('@koa/router')
const router = new Router()
const crypto = require('crypto')
const { verify } = require('../utils/jwt')
const { buildHelpMessage, buildSystemPrompt, isProjectIntent } = require('../utils/aichatPrompt')
const { TOOL_DEFINITIONS, executeTool } = require('../utils/toolRegistry')
const { createChatCompletion, ensureApiKey } = require('../utils/deepseekClient')
const { isProbablyBase64Image } = require('../utils/validate')

router.prefix('/chat')

const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat'
const DEEPSEEK_PLANNER_MODEL = process.env.DEEPSEEK_PLANNER_MODEL || DEEPSEEK_CHAT_MODEL
const DEEPSEEK_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS) || 120000
const DEEPSEEK_PLANNER_TIMEOUT_MS = Number(process.env.DEEPSEEK_PLANNER_TIMEOUT_MS) || 15000
const MAX_HISTORY_MESSAGES =
  Number(process.env.DEEPSEEK_MAX_HISTORY_MESSAGES || process.env.OLLAMA_MAX_HISTORY_MESSAGES) || 20
const CHAT_TOOL_CALLING_ENABLED = String(process.env.CHAT_TOOL_CALLING_ENABLED || '1') !== '0'
const CHAT_TOOL_PLANNER_TIMEOUT_MS = Number(process.env.CHAT_TOOL_PLANNER_TIMEOUT_MS) || 15000
const CHAT_TOOL_EXEC_TIMEOUT_MS = Number(process.env.CHAT_TOOL_EXEC_TIMEOUT_MS) || 5000
const CHAT_WRITE_CONFIRM_TTL_MS = Number(process.env.CHAT_WRITE_CONFIRM_TTL_MS) || 5 * 60 * 1000
const CHAT_WRITE_TOOL_ENABLED = String(process.env.CHAT_WRITE_TOOL_ENABLED || '1') !== '0'
const CHAT_LIST_PAGINATION_TTL_MS = Number(process.env.CHAT_LIST_PAGINATION_TTL_MS) || 5 * 60 * 1000
const CHAT_MAX_INPUT_MESSAGES = Number(process.env.CHAT_MAX_INPUT_MESSAGES) || 30
const CHAT_MAX_INPUT_CHARS = Number(process.env.CHAT_MAX_INPUT_CHARS) || 12000
const CHAT_MAX_SINGLE_MESSAGE_CHARS = Number(process.env.CHAT_MAX_SINGLE_MESSAGE_CHARS) || 4000

const PLANNER_TOOL_DEFINITIONS = TOOL_DEFINITIONS.filter((tool) => !tool.dangerous)
const PLANNER_TOOL_NAME_SET = new Set(PLANNER_TOOL_DEFINITIONS.map((tool) => tool.name))

const pendingWriteOps = new Map()
const pendingListOps = new Map()

const TOOL_TRIGGER_KEYWORDS = [
  '我的衣橱',
  '衣橱',
  '衣柜',
  '衣橱里有什么',
  '衣柜里有什么',
  '有哪些衣服',
  '有哪些衣物',
  '衣服列表',
  '衣物列表',
  '我的衣服',
  '场景',
  '场景推荐',
  '穿搭推荐',
  '搭配推荐',
  '给我推荐',
  '推荐一下',
  '商务',
  '通勤',
  '约会',
  '聚会',
  '面试',
  '会议',
  '运动',
  '健身',
  '跑步',
  '旅行',
  '出行',
  '收藏',
  '喜欢',
  'favorite',
  '上衣',
  '下衣',
  '性别',
  'sex',
  '模特',
  '人物模特',
  '全身照',
  'characterModel',
  '/person',
  '/match',
]

const normalizeRole = (role = '') => {
  if (role === 'bot') return 'assistant'
  if (role === 'assistant') return 'assistant'
  if (role === 'user') return 'user'
  return null
}

const normalizeMessages = (messages = []) =>
  messages
    .filter(Boolean)
    .map((item) => ({
      role: normalizeRole(item.role),
      content: typeof item.content === 'string' ? item.content : String(item.content ?? ''),
    }))
    .filter((item) => item.role && item.content && item.content.trim())

const trimHistory = (messages = [], max = MAX_HISTORY_MESSAGES) => {
  if (!Array.isArray(messages)) return []
  const safeMax = Number.isFinite(max) ? Math.max(2, max) : 20
  if (messages.length <= safeMax) return messages
  return messages.slice(-safeMax)
}

const shouldAttemptToolCalling = (text = '') => {
  const input = String(text || '').trim()
  if (!input) return false
  return TOOL_TRIGGER_KEYWORDS.some((keyword) => input.includes(keyword))
}

const extractJsonObject = (text) => {
  if (!text) return null
  if (typeof text === 'object') return text
  const raw = String(text)
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

const withTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })

const buildToolsForPlannerPrompt = () =>
  PLANNER_TOOL_DEFINITIONS.map((tool) => {
    const schema = JSON.stringify(tool.parameters || {})
    return `- ${tool.name}: ${tool.description}\n  parameters: ${schema}`
  }).join('\n')

const buildPlannerSystemPrompt = () => `你是一个“工具调用规划器”。你只能输出 JSON，禁止输出任何额外文本。\n\n可用工具：\n${buildToolsForPlannerPrompt()}\n\n规则：\n- 仅当需要“读取当前登录用户的真实数据”（衣橱/用户画像）时，才选择 action=tool。\n- 只能选择一个工具；arguments 必须是对象且尽量最小化。\n- tool 必须是可用工具之一。\n\n输出（二选一）：\n1) {\"action\":\"tool\",\"tool\":\"...\",\"arguments\":{...},\"reason\":\"...\"}\n2) {\"action\":\"none\",\"reason\":\"...\"}`

const planToolCall = async (userText) => {
  const plannerMessages = [
    { role: 'system', content: buildPlannerSystemPrompt() },
    { role: 'user', content: String(userText || '').slice(0, 2000) },
  ]

  const res = await createChatCompletion(
    {
      model: DEEPSEEK_PLANNER_MODEL,
      messages: plannerMessages,
      stream: false,
      temperature: 0,
    },
    { timeout: DEEPSEEK_PLANNER_TIMEOUT_MS || CHAT_TOOL_PLANNER_TIMEOUT_MS }
  )

  const content = res?.data?.choices?.[0]?.message?.content || ''
  const parsed = extractJsonObject(content)
  if (!parsed || typeof parsed !== 'object') return { action: 'none', reason: 'planner_parse_failed' }

  const action = parsed.action
  if (action !== 'tool') return { action: 'none', reason: parsed.reason || 'no_tool' }

  const tool = parsed.tool
  const args = parsed.arguments
  if (!tool || typeof tool !== 'string' || !PLANNER_TOOL_NAME_SET.has(tool)) {
    return { action: 'none', reason: 'unknown_tool' }
  }
  if (args != null && typeof args !== 'object') {
    return { action: 'none', reason: 'invalid_arguments' }
  }

  return { action: 'tool', tool, arguments: args || {}, reason: parsed.reason || '' }
}

const buildToolResultBlock = (toolName, result) =>
  `【TOOL_RESULT name=${toolName}】\n${JSON.stringify(result)}\n【/TOOL_RESULT】`

const writeSseMessage = (ctx, message) => {
  ctx.res.write(`data: ${JSON.stringify(String(message ?? ''))}\n\n`)
}

const endSse = (ctx) => {
  ctx.res.write('data: [DONE]\n\n')
  ctx.res.end()
}

const makeConfirmId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10)

const parsePositiveInt = (value) => {
  const n = Number.parseInt(String(value), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

const parseConfirmCode = (text = '') => {
  const input = String(text || '').trim()
  const match = input.match(/^(?:确认|继续|\/confirm)\s+([a-zA-Z0-9]{6,40})$/)
  return match ? match[1] : null
}

const buildDangerConfirmPrompt = ({ operationType, scope, risk, confirmId }) =>
  [
    '⚠️ 危险操作检测！',
    `操作类型：${operationType}`,
    `影响范围：${scope}`,
    `风险评估：${risk}`,
    '',
    `请确认是否继续？回复：确认 ${confirmId}`,
  ].join('\n')

const parseWriteCommand = (text = '') => {
  const input = String(text || '').trim()

  const delMatch = input.match(/^\/(?:delete|del)\s+(\d+)\s*$/i)
  if (delMatch) {
    const clothId = parsePositiveInt(delMatch[1])
    if (!clothId) return { error: 'INVALID_ARGS', usage: '用法：/delete <cloth_id>' }
    return {
      tool: 'delete_cloth',
      arguments: { cloth_id: clothId },
      confirm: {
        operationType: '删除衣物',
        scope: `将删除 cloth_id=${clothId}（仅当前账号）`,
        risk: '删除后不可恢复；若误删需要重新上传/重建数据。',
      },
    }
  }

  const favMatch = input.match(/^\/(?:favorite|fav)\s+(\d+)\s+(on|off|true|false|1|0)\s*$/i)
  if (favMatch) {
    const clothId = parsePositiveInt(favMatch[1])
    if (!clothId) return { error: 'INVALID_ARGS', usage: '用法：/favorite <cloth_id> on|off' }
    const value = favMatch[2].toLowerCase()
    const favorite = value === 'on' || value === 'true' || value === '1'
    return {
      tool: 'set_cloth_favorite',
      arguments: { cloth_id: clothId, favorite },
      confirm: {
        operationType: favorite ? '收藏衣物' : '取消收藏衣物',
        scope: `将设置 cloth_id=${clothId} favorite=${favorite ? 'true' : 'false'}（仅当前账号）`,
        risk: '该操作会修改衣物收藏状态，可能影响推荐与排序。',
      },
    }
  }

  const sexMatch = input.match(/^\/sex\s+(.+)\s*$/i)
  if (sexMatch) {
    const raw = sexMatch[1].trim()
    if (!raw) return { error: 'INVALID_ARGS', usage: '用法：/sex man|woman' }
    return {
      tool: 'update_user_sex',
      arguments: { sex: raw },
      confirm: {
        operationType: '更新性别设置',
        scope: `将更新当前账号 sex=${raw}`,
        risk: '该操作会影响搭配预览与推荐逻辑，可能导致生成结果变化。',
      },
    }
  }

  const updateMatch = input.match(/^\/update\s+(\d+)\s+([\s\S]+)$/i)
  if (updateMatch) {
    const clothId = parsePositiveInt(updateMatch[1])
    if (!clothId) return { error: 'INVALID_ARGS', usage: '用法：/update <cloth_id> {"name":"...","color":"..."}' }
    const payload = extractJsonObject(updateMatch[2])
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { error: 'INVALID_ARGS', usage: '用法：/update <cloth_id> {"name":"...","color":"..."}' }
    }
    return {
      tool: 'update_cloth_fields',
      arguments: { cloth_id: clothId, ...payload },
      confirm: {
        operationType: '更新衣物信息',
        scope: `将更新 cloth_id=${clothId} 的部分字段（仅当前账号）`,
        risk: '该操作会修改衣物信息，可能影响筛选、推荐与后续生成结果。',
      },
    }
  }

  return null
}

const isClosetInventoryQuestion = (text = '') => {
  const input = String(text || '').trim()
  if (!input) return false
  const hasClosetWord = ['衣橱', '衣柜', '衣服', '衣物'].some((k) => input.includes(k))
  const isAskingList = ['有哪些', '有什么', '都有', '列表', '清单', '多少'].some((k) => input.includes(k))
  const isHowTo = ['怎么', '如何', '怎样', '操作', '步骤', '哪里'].some((k) => input.includes(k))
  return hasClosetWord && isAskingList && !isHowTo
}

const buildListClothesArgsFromQuery = (text = '') => {
  const input = String(text || '').trim()
  const args = { limit: 20, offset: 0 }

  if (['收藏', '喜欢', '最爱'].some((k) => input.includes(k))) {
    args.favoriteOnly = true
  }
  if (input.includes('上衣')) args.type = '上衣'
  if (input.includes('下衣')) args.type = '下衣'

  return args
}

const formatClosetInventory = (result) => {
  if (!result || typeof result !== 'object') return '获取衣橱数据失败：返回为空。'
  if (result.error) {
    if (result.error === 'EMPTY_CLOSET') return result.message || '你的衣橱为空，请先上传衣物。'
    if (result.error === 'UNAUTHORIZED') return '未登录或登录已过期，请重新登录后再试。'
    return `获取衣橱数据失败：${result.error}`
  }

  const total = Number(result.total) || 0
  const offset = Number(result.offset) || 0
  const items = Array.isArray(result.items) ? result.items : []
  if (total <= 0 || items.length === 0) {
    return '你的衣橱目前还没有衣物。\n\n- 你可以去 `/add` 上传衣物（可选 AI 分析自动填表）\n- 或去 `/outfit` 查看/管理衣物'
  }

  const groups = new Map()
  items.forEach((item) => {
    const key = String(item.type || '未分类').trim() || '未分类'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  })

  const startNo = Math.min(total, offset + 1)
  const endNo = Math.min(total, offset + items.length)
  const lines = [`我在你的衣橱里找到了 **${total}** 件衣物（展示 ${startNo}-${endNo}）：`]

  for (const [type, list] of groups.entries()) {
    lines.push('', `### ${type}（${list.length}）`)
    list.forEach((item) => {
      const meta = [item.color, item.style, item.season].filter((v) => v && String(v).trim()).join(' / ')
      const name = String(item.name || '').trim() || '（未命名）'
      const fav = item.favorite ? ' / ❤️收藏' : ''
      lines.push(`- ${item.cloth_id}：${name}${meta ? `（${meta}${fav}）` : fav ? `（${fav.slice(3)}）` : ''}`)
    })
  }

  if (total > endNo) {
    lines.push('', `还有 **${total - endNo}** 件未展示。回复“继续”可查看更多，或告诉我你想看的类型（如“只看上衣/只看收藏”）。`)
  } else {
    lines.push('', '如果你想让我基于衣橱做“商务/通勤/约会/运动/旅行”等场景推荐，直接告诉我场景即可。')
  }

  return lines.join('\n')
}

/**
 * AI聊天接口 - 处理流式响应
 * 接收对话历史消息数组，转发给DeepSeek API，并将流式响应实时转发给前端
 */
router.post('/', verify(), async (ctx) => {
    console.log('Chat route accessed with messages:', ctx.request.body.messages);
    
    // 获取对话历史消息数组
    const { messages } = ctx.request.body;
    
    // 验证必需参数
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        ctx.status = 400;
        ctx.body = { error: 'Messages array is required and cannot be empty' };
        return;
    }

    if (messages.length > CHAT_MAX_INPUT_MESSAGES) {
        ctx.status = 400
        ctx.body = { code: 0, msg: '\u8f93\u5165\u6d88\u606f\u8fc7\u591a\uff0c\u8bf7\u7cbe\u7b80\u5bf9\u8bdd\u5386\u53f2' }
        return
    }

    const invalidItem = messages.find((m) => !m || typeof m !== 'object')
    if (invalidItem) {
        ctx.status = 400
        ctx.body = { code: 0, msg: '\u6d88\u606f\u683c\u5f0f\u65e0\u6548' }
        return
    }

    const totalChars = messages.reduce((sum, item) => {
        const content = typeof item.content === 'string' ? item.content : String(item.content ?? '')
        return sum + content.length
    }, 0)
    if (totalChars > CHAT_MAX_INPUT_CHARS) {
        ctx.status = 400
        ctx.body = { code: 0, msg: '\u8f93\u5165\u5185\u5bb9\u8fc7\u957f\uff0c\u8bf7\u7cbe\u7b80\u95ee\u9898\u6216\u6e05\u7406\u5386\u53f2' }
        return
    }

    const tooLongMessage = messages.find((item) => {
        const content = typeof item.content === 'string' ? item.content : String(item.content ?? '')
        return content.length > CHAT_MAX_SINGLE_MESSAGE_CHARS
    })
    if (tooLongMessage) {
        ctx.status = 400
        ctx.body = { code: 0, msg: '\u5355\u6761\u6d88\u606f\u8fc7\u957f\uff0c\u8bf7\u62c6\u5206\u6216\u7cbe\u7b80' }
        return
    }

    const hasBase64 = messages.some((item) => {
        const content = typeof item.content === 'string' ? item.content : String(item.content ?? '')
        return isProbablyBase64Image(content) || content.includes('data:image/')
    })
    if (hasBase64) {
        ctx.status = 400
        ctx.body = { code: 0, msg: '\u4e0d\u652f\u6301\u5728\u804a\u5929\u4e2d\u76f4\u63a5\u4f20\u5165\u56fe\u7247\u6570\u636e' }
        return
    }
    
    // 设置为不使用Koa的响应处理，直接操作原生Node.js响应对象
    // 这样可以更精确地控制流式响应的发送
    ctx.respond = false;
    
    // 设置SSE（Server-Sent Events）响应头
    ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream',    // SSE内容类型
        'Cache-Control': 'no-cache, no-transform',            // 禁用缓存
        'Connection': 'keep-alive',             // 保持连接
        'X-Accel-Buffering': 'no',              // 禁止代理缓冲（提升 Zeabur/反代下 SSE 稳定性）
        'Access-Control-Allow-Origin': '*',     // 允许跨域
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-Id', // 允许的请求头
        'x-request-id': ctx.state.requestId,
    });

    const heartbeatMs = Number(process.env.CHAT_SSE_HEARTBEAT_MS) || 15000
    let heartbeatTimer = setInterval(() => {
        try {
            ctx.res.write(': ping\n\n')
        } catch {
            // ignore
        }
    }, heartbeatMs)
    const stopHeartbeat = () => {
        if (!heartbeatTimer) return
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
    }
    
    const safeMessages = normalizeMessages(messages).filter((item) => item.role !== 'system')
    const lastUserText = [...safeMessages].reverse().find((m) => m.role === 'user')?.content || ''
    const command = String(lastUserText || '').trim()

    if (command === '/help') {
        const help = buildHelpMessage()
        ctx.res.write(`data: ${JSON.stringify(help)}\n\n`)
        stopHeartbeat()
        endSse(ctx)
        return
    }

    const userKey = String(ctx.userId)

    if (command === '取消' || command === '/cancel') {
        pendingWriteOps.delete(userKey)
        writeSseMessage(ctx, '已取消待确认操作。')
        stopHeartbeat()
        endSse(ctx)
        return
    }

    const confirmCode = parseConfirmCode(command)
    if (confirmCode) {
        const pending = pendingWriteOps.get(userKey)
        if (!pending) {
            writeSseMessage(ctx, '当前没有待确认的写操作。你可以先输入 /help 查看可用命令。')
            stopHeartbeat()
            endSse(ctx)
            return
        }
        if (pending.confirmId !== confirmCode) {
            writeSseMessage(ctx, '确认码不匹配或已过期。请重新发起写操作获取新的确认码。')
            stopHeartbeat()
            endSse(ctx)
            return
        }
        if (Date.now() - pending.createdAt > CHAT_WRITE_CONFIRM_TTL_MS) {
            pendingWriteOps.delete(userKey)
            writeSseMessage(ctx, '该确认码已过期（默认 5 分钟）。请重新发起写操作。')
            stopHeartbeat()
            endSse(ctx)
            return
        }

        pendingWriteOps.delete(userKey)
        let result = null
        try {
            result = await withTimeout(executeTool(pending.tool, pending.arguments, ctx), CHAT_TOOL_EXEC_TIMEOUT_MS)
        } catch (error) {
            result = { error: 'TOOL_EXEC_FAILED', message: error?.message || String(error) }
        }

        if (result?.error) {
            writeSseMessage(ctx, `写操作执行失败：${result.error}${result.message ? `（${result.message}）` : ''}`)
            stopHeartbeat()
            endSse(ctx)
            return
        }

        const okText =
          pending.tool === 'delete_cloth'
            ? `已删除衣物 cloth_id=${pending.arguments?.cloth_id}。你可以去 /outfit 刷新查看。`
            : pending.tool === 'set_cloth_favorite'
              ? `已更新收藏状态：cloth_id=${pending.arguments?.cloth_id} favorite=${result.favorite ? 'true' : 'false'}。`
              : pending.tool === 'update_cloth_fields'
                ? `已更新衣物信息：cloth_id=${pending.arguments?.cloth_id}（字段：${Object.keys(result.patch || {}).join(', ') || '未知'}）。你可以去 /outfit 或 /update 查看。`
                : pending.tool === 'update_user_sex'
                  ? `已更新性别设置为：${result.sex}。你可以去 /person 或 /match 验证。`
                  : '写操作已完成。'

        writeSseMessage(ctx, okText)
        stopHeartbeat()
        endSse(ctx)
        return
    }

    if (command === '继续' || command === '/more') {
        const pending = pendingListOps.get(userKey)
        if (!pending) {
            writeSseMessage(ctx, '当前没有可继续展示的衣橱列表。你可以直接问：我衣橱里有哪些衣服？')
            stopHeartbeat()
            endSse(ctx)
            return
        }
        if (Date.now() - pending.createdAt > CHAT_LIST_PAGINATION_TTL_MS) {
            pendingListOps.delete(userKey)
            writeSseMessage(ctx, '上一次衣橱列表已过期，请重新问：我衣橱里有哪些衣服？')
            stopHeartbeat()
            endSse(ctx)
            return
        }

        let result = null
        try {
            result = await withTimeout(executeTool('list_clothes', { ...pending.args, offset: pending.offset }, ctx), CHAT_TOOL_EXEC_TIMEOUT_MS)
        } catch (error) {
            result = { error: 'TOOL_EXEC_FAILED', message: error?.message || String(error) }
        }

        const total = Number(result?.total) || 0
        const offset = Number(result?.offset) || 0
        const items = Array.isArray(result?.items) ? result.items : []
        const nextOffset = offset + items.length

        if (total > nextOffset) {
            pendingListOps.set(userKey, { ...pending, offset: nextOffset, createdAt: Date.now() })
        } else {
            pendingListOps.delete(userKey)
        }

        writeSseMessage(ctx, formatClosetInventory(result))
        stopHeartbeat()
        endSse(ctx)
        return
    }

    const writeCommand = CHAT_WRITE_TOOL_ENABLED ? parseWriteCommand(command) : null
    if (writeCommand) {
        const confirmId = makeConfirmId()
        pendingWriteOps.set(userKey, {
            confirmId,
            tool: writeCommand.tool,
            arguments: writeCommand.arguments,
            createdAt: Date.now(),
        })

        const prompt = buildDangerConfirmPrompt({
            operationType: writeCommand.confirm?.operationType || '写操作',
            scope: writeCommand.confirm?.scope || '将修改当前账号的数据',
            risk: writeCommand.confirm?.risk || '该操作会修改数据，请确认后再继续。',
            confirmId,
        })
        writeSseMessage(ctx, prompt)
        stopHeartbeat()
        endSse(ctx)
        return
    }

    // 明确的“衣橱盘点”问题：直接读取衣橱并返回列表（不依赖 planner / 不走大模型）
    if (CHAT_TOOL_CALLING_ENABLED && isClosetInventoryQuestion(command)) {
        const args = buildListClothesArgsFromQuery(command)
        let result = null
        try {
            result = await withTimeout(executeTool('list_clothes', args, ctx), CHAT_TOOL_EXEC_TIMEOUT_MS)
        } catch (error) {
            result = { error: 'TOOL_EXEC_FAILED', message: error?.message || String(error) }
        }
        const total = Number(result?.total) || 0
        const offset = Number(result?.offset) || 0
        const items = Array.isArray(result?.items) ? result.items : []
        const nextOffset = offset + items.length

        if (total > nextOffset) {
            pendingListOps.set(userKey, { args, offset: nextOffset, createdAt: Date.now() })
        } else {
            pendingListOps.delete(userKey)
        }
        writeSseMessage(ctx, formatClosetInventory(result))
        stopHeartbeat()
        endSse(ctx)
        return
    }

    const intent = isProjectIntent(lastUserText) ? 'project' : 'clothing'
    const systemPrompt = buildSystemPrompt({ intent })

    let toolPlan = null
    let toolResult = null

    if (CHAT_TOOL_CALLING_ENABLED && shouldAttemptToolCalling(lastUserText)) {
        try {
            toolPlan = await planToolCall(lastUserText)
        } catch (error) {
            toolPlan = null
        }

        if (toolPlan?.action === 'tool') {
            try {
                toolResult = await withTimeout(executeTool(toolPlan.tool, toolPlan.arguments, ctx), CHAT_TOOL_EXEC_TIMEOUT_MS)
            } catch (error) {
                toolResult = { error: 'TOOL_EXEC_FAILED', message: error?.message || String(error) }
            }
        }
    }

    const finalMessages = [
      { role: 'system', content: systemPrompt },
      ...trimHistory(safeMessages),
    ]

    if (toolPlan?.action === 'tool') {
        finalMessages.push({ role: 'user', content: buildToolResultBlock(toolPlan.tool, toolResult) })
    }

    // Call DeepSeek chat API with system prompt, history, and optional tool result
    const data = {
        model: DEEPSEEK_CHAT_MODEL,
        messages: finalMessages,
        stream: true,
        temperature: 0.4,
    }

    let isEnded = false

    try {
        ensureApiKey()
        const response = await createChatCompletion(data, {
            stream: true,
            timeout: DEEPSEEK_TIMEOUT_MS,
        })

        response.data.on('data', (chunk) => {
            if (isEnded) return

            const lines = chunk
              .toString()
              .split(/\r?\n/)
              .filter((line) => line.trim() !== '')

            lines.forEach((line) => {
                if (isEnded) return
                if (!line.startsWith('data:')) return
                const payload = line.slice(5).trim()

                if (payload === '[DONE]') {
                    isEnded = true
                    stopHeartbeat()
                    ctx.res.write('data: [DONE]\n\n')
                    ctx.res.end()
                    return
                }

                try {
                    const jsonData = JSON.parse(payload)
                    const delta = jsonData?.choices?.[0]?.delta || {}
                    const textPart =
                      (typeof delta.content === 'string' && delta.content) ||
                      (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
                      ''
                    if (textPart) {
                        ctx.res.write(`data: ${JSON.stringify(textPart)}\n\n`)
                    }
                } catch (parseError) {
                    return
                }
            })
        })

        response.data.on('end', () => {
            if (!isEnded) {
                isEnded = true
                stopHeartbeat()
                ctx.res.write('data: [DONE]\n\n')
                ctx.res.end()
            }
        })

        ctx.req.on('close', () => {
            isEnded = true
            stopHeartbeat()
            if (response.data && !response.data.destroyed) {
                response.data.destroy()
            }
        })
    } catch (error) {
        console.error('Chat API Error:', error.message)
        if (!isEnded) {
            isEnded = true
            stopHeartbeat()
            try {
                ctx.res.write('event: error\ndata: ' + JSON.stringify({ error: error.message, requestId: ctx.state.requestId }) + '\n\n')
            } catch {
                // ignore
            }
            try {
                ctx.res.write('data: [DONE]\n\n')
            } catch {
                // ignore
            }
            try {
                ctx.res.end()
            } catch {
                // ignore
            }
        }
    }
})

module.exports = router
