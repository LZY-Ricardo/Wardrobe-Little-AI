const Router = require('@koa/router')
const router = new Router()
const axios = require('axios')
const { verify } = require('../utils/jwt')
const { buildHelpMessage, buildSystemPrompt, isProjectIntent } = require('../utils/aichatPrompt')
const { TOOL_DEFINITIONS, executeTool } = require('../utils/toolRegistry')

router.prefix('/chat')

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:7b'
const OLLAMA_PLANNER_MODEL = process.env.OLLAMA_PLANNER_MODEL || OLLAMA_MODEL
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120000
const MAX_HISTORY_MESSAGES = Number(process.env.OLLAMA_MAX_HISTORY_MESSAGES) || 20
const CHAT_TOOL_CALLING_ENABLED = String(process.env.CHAT_TOOL_CALLING_ENABLED || '1') !== '0'
const CHAT_TOOL_PLANNER_TIMEOUT_MS = Number(process.env.CHAT_TOOL_PLANNER_TIMEOUT_MS) || 15000
const CHAT_TOOL_EXEC_TIMEOUT_MS = Number(process.env.CHAT_TOOL_EXEC_TIMEOUT_MS) || 5000

const TOOL_NAME_SET = new Set(TOOL_DEFINITIONS.map((tool) => tool.name))

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
  TOOL_DEFINITIONS.map((tool) => {
    const schema = JSON.stringify(tool.parameters || {})
    return `- ${tool.name}: ${tool.description}\n  parameters: ${schema}`
  }).join('\n')

const buildPlannerSystemPrompt = () => `你是一个“工具调用规划器”。你只能输出 JSON，禁止输出任何额外文本。\n\n可用工具：\n${buildToolsForPlannerPrompt()}\n\n规则：\n- 仅当需要“读取当前登录用户的真实数据”（衣橱/用户画像）时，才选择 action=tool。\n- 只能选择一个工具；arguments 必须是对象且尽量最小化。\n- tool 必须是可用工具之一。\n\n输出（二选一）：\n1) {\"action\":\"tool\",\"tool\":\"...\",\"arguments\":{...},\"reason\":\"...\"}\n2) {\"action\":\"none\",\"reason\":\"...\"}`

const planToolCall = async (url, userText) => {
  const plannerMessages = [
    { role: 'system', content: buildPlannerSystemPrompt() },
    { role: 'user', content: String(userText || '').slice(0, 2000) },
  ]

  const res = await axios.post(
    url,
    {
      model: OLLAMA_PLANNER_MODEL,
      messages: plannerMessages,
      stream: false,
      options: { temperature: 0 },
    },
    { timeout: CHAT_TOOL_PLANNER_TIMEOUT_MS }
  )

  const content = res?.data?.message?.content || ''
  const parsed = extractJsonObject(content)
  if (!parsed || typeof parsed !== 'object') return { action: 'none', reason: 'planner_parse_failed' }

  const action = parsed.action
  if (action !== 'tool') return { action: 'none', reason: parsed.reason || 'no_tool' }

  const tool = parsed.tool
  const args = parsed.arguments
  if (!tool || typeof tool !== 'string' || !TOOL_NAME_SET.has(tool)) {
    return { action: 'none', reason: 'unknown_tool' }
  }
  if (args != null && typeof args !== 'object') {
    return { action: 'none', reason: 'invalid_arguments' }
  }

  return { action: 'tool', tool, arguments: args || {}, reason: parsed.reason || '' }
}

const buildToolResultBlock = (toolName, result) =>
  `【TOOL_RESULT name=${toolName}】\n${JSON.stringify(result)}\n【/TOOL_RESULT】`

/**
 * AI聊天接口 - 处理流式响应
 * 接收对话历史消息数组，转发给Ollama API，并将流式响应实时转发给前端
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
    
    // 设置为不使用Koa的响应处理，直接操作原生Node.js响应对象
    // 这样可以更精确地控制流式响应的发送
    ctx.respond = false;
    
    // 设置SSE（Server-Sent Events）响应头
    ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream',    // SSE内容类型
        'Cache-Control': 'no-cache',            // 禁用缓存
        'Connection': 'keep-alive',             // 保持连接
        'Access-Control-Allow-Origin': '*',     // 允许跨域
        'Access-Control-Allow-Headers': 'Authorization, Content-Type' // 允许的请求头
    });
    
    const safeMessages = normalizeMessages(messages).filter((item) => item.role !== 'system')
    const lastUserText = [...safeMessages].reverse().find((m) => m.role === 'user')?.content || ''
    const command = String(lastUserText || '').trim()

    if (command === '/help') {
        const help = buildHelpMessage()
        ctx.res.write(`data: ${JSON.stringify(help)}\n\n`)
        ctx.res.write('data: [DONE]\n\n')
        ctx.res.end()
        return
    }

    const intent = isProjectIntent(lastUserText) ? 'project' : 'clothing'
    const systemPrompt = buildSystemPrompt({ intent })
    const url = `${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`

    let toolPlan = null
    let toolResult = null

    if (CHAT_TOOL_CALLING_ENABLED && shouldAttemptToolCalling(lastUserText)) {
        try {
            toolPlan = await planToolCall(url, lastUserText)
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

    // 构造Ollama API请求数据：system prompt + 对话历史 +（可选）工具结果
    const data = {
        model: OLLAMA_MODEL,
        messages: finalMessages,
        stream: true,
        options: { temperature: 0.4 },
    }
    
    // 流式响应状态控制变量
    let isEnded = false;
    
    try {
        // 向Ollama API发送流式请求
        const response = await axios.post(url, data, {
            responseType: 'stream',  // 设置响应类型为流
            timeout: OLLAMA_TIMEOUT_MS,
        });
        
        /**
         * 处理从Ollama接收到的流式数据
         * 直接转发AI回复内容给前端
         */
        response.data.on('data', (chunk) => {
            // 如果流已结束，忽略后续数据
            if (isEnded) return;
            
            // 将二进制数据转换为字符串，并按行分割
            const lines = chunk
              .toString()
              .split(/\r?\n/)
              .filter((line) => line.trim() !== '');
            
            // 处理每一行JSON数据
            lines.forEach(line => {
                if (isEnded) return;
                
                try {
                    // 解析JSON数据
                    const jsonData = JSON.parse(line);
                    
                    // 如果有消息内容且流未结束，直接发送给前端
                    if (jsonData.message && jsonData.message.content && !isEnded) {
                        const content = jsonData.message.content;
                        // 确保换行符被正确编码传输
                        const encodedContent = JSON.stringify(content);
                        ctx.res.write(`data: ${encodedContent}\n\n`);
                    }
                    
                    // 检查Ollama是否完成响应
                    if (jsonData.done && !isEnded) {
                        console.log('Ollama stream done, sending [DONE]');
                        isEnded = true;
                        
                        // 发送结束标记给前端
                        ctx.res.write('data: [DONE]\n\n');
                        ctx.res.end(); // 结束响应
                    }
                } catch (parseError) {
                    // 记录JSON解析错误（某些行可能不是有效JSON）
                    console.log('Parse error for line:', line);
                }
            });
        });
        
        /**
         * 处理Ollama流结束事件
         * 当Ollama完全结束数据传输时触发
         */
        response.data.on('end', () => {
            console.log('Ollama stream ended, isEnded:', isEnded, 'headersSent:', ctx.res.headersSent);
            // 如果流未正常结束，发送结束标记
            if (!isEnded) {
                console.log('Sending [DONE] from end event');
                isEnded = true;
                ctx.res.write('data: [DONE]\n\n');
                ctx.res.end();
            }
        });
        
        /**
         * 处理客户端断开连接事件
         * 当前端用户关闭页面或网络断开时触发
         */
        ctx.req.on('close', () => {
            isEnded = true;
            // 清理Ollama响应流，防止内存泄漏
            if (response.data && !response.data.destroyed) {
                response.data.destroy();
            }
        });
        
    } catch (error) {
        // 处理请求Ollama API时的错误
        console.error('Chat API Error:', error.message);
        if (!isEnded && !ctx.res.headersSent) {
            // 向前端发送错误信息
            ctx.res.write('event: error\ndata: ' + JSON.stringify({
                error: error.message
            }) + '\n\n');
            ctx.res.end();
        }
    }
})

module.exports = router
