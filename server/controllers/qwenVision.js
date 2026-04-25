require('../config')

const axios = require('axios')
const { createCircuitBreaker } = require('../utils/circuitBreaker')
const { normalizeLlmError } = require('../utils/llmError')

let sharp = null
try {
  sharp = require('sharp')
} catch {
  sharp = null
}

const VISION_TOOL_ERROR_MESSAGES = {
  unavailable: '暂时无法分析图片',
  config: '图片分析服务异常',
  quota: '图片分析额度不足',
  rateLimit: '图片分析过于频繁，请稍后再试',
  failed: '图片分析失败',
}

const getVisionToolConfig = () => ({
  apiKey: process.env.SILICONFLOW_API_KEY,
  baseUrl: (process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
  model: process.env.SILICONFLOW_VISION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct',
  timeoutMs: Number(process.env.SILICONFLOW_TIMEOUT_MS) || 30000,
})

const toPreviewText = (value, maxLength = 300) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

const visionToolBreaker = createCircuitBreaker({
  name: 'siliconflow-vision-tool',
  failureThreshold: Number(process.env.SILICONFLOW_BREAKER_FAILURE_THRESHOLD) || 3,
  cooldownMs: Number(process.env.SILICONFLOW_BREAKER_COOLDOWN_MS) || 60 * 1000,
})

const ensureVisionToolConfig = () => {
  const { apiKey } = getVisionToolConfig()
  if (!apiKey || apiKey === 'your_siliconflow_api_key') {
    console.error('[VisionTool] 配置缺失: SILICONFLOW_API_KEY 未配置')
    const error = new Error('SILICONFLOW_API_KEY 未配置')
    error.status = 503
    throw error
  }
}

const normalizeVisionImage = async (imageBuffer, mimeType) => {
  if (!sharp) return { buffer: imageBuffer, mimeType }

  try {
    const output = await sharp(imageBuffer)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()

    return { buffer: output, mimeType: 'image/jpeg' }
  } catch (error) {
    console.warn('[VisionTool] 图片标准化失败，回退原图:', error.message)
    return { buffer: imageBuffer, mimeType }
  }
}

const extractJson = (text) => {
  try { return JSON.parse(text) } catch {}
  const blockMatch = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()) } catch {}
  }
  const braceMatch = String(text || '').match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]) } catch {}
  }
  return null
}

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  const raw = String(value || '').trim()
  if (!raw) return []
  return raw.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean)
}

const normalizeScalarField = (value, fallback = '') => {
  const normalized = normalizeStringArray(value)
  return String(normalized[0] || fallback || '').trim()
}

const dedupeStrings = (values = []) => {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const text = String(value || '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

const normalizeVisionItem = (raw = {}, index = 0) => {
  const type = normalizeScalarField(raw.type || raw.category)
  const color = normalizeScalarField(raw.color || raw?.attributes?.color)
  const style = normalizeScalarField(raw.style || raw?.attributes?.style)
  const season = normalizeScalarField(raw.season || raw?.attributes?.season)
  const material = normalizeScalarField(raw.material || raw?.attributes?.material, '未知')
  const name = String(raw.name || [color, type].filter(Boolean).join('') || `识别衣物${index + 1}`).trim()
  const confidenceNumber = Number(raw.confidence)

  return {
    name,
    type: type || 'unknown',
    color,
    style,
    season,
    material,
    confidence: Number.isFinite(confidenceNumber) ? confidenceNumber : null,
  }
}

const normalizeVisionResult = (raw = {}) => {
  const items = Array.isArray(raw.items) && raw.items.length
    ? raw.items.map((item, index) => normalizeVisionItem(item, index))
    : [normalizeVisionItem(raw, 0)]
  const primaryItem = items[0] || {}
  const category = String(raw.category || raw.type || primaryItem.type || '').trim()
  const summary = String(raw.summary || raw.caption || '').trim()
  const color = dedupeStrings([
    ...normalizeStringArray(raw?.attributes?.color || raw.color),
    ...items.map((item) => item.color),
  ])
  const style = dedupeStrings([
    ...normalizeStringArray(raw?.attributes?.style || raw.style),
    ...items.map((item) => item.style),
  ])
  const season = dedupeStrings([
    ...normalizeStringArray(raw?.attributes?.season || raw.season),
    ...items.map((item) => item.season),
  ])
  const material = dedupeStrings([
    ...normalizeStringArray(raw?.attributes?.material || raw.material),
    ...items.map((item) => item.material),
  ])
  const confidenceNumber = Number(raw.confidence)

  const fallbackSummary = [
    items.length > 1 ? `识别到${items.length}件衣物` : category ? `类型${category}` : '',
    color.length ? `颜色${color.join('、')}` : '',
    style.length ? `风格${style.join('、')}` : '',
    season.length ? `季节${season.join('、')}` : '',
    material.length ? `材质${material.join('、')}` : '',
  ].filter(Boolean).join('，')

  return {
    summary: summary || fallbackSummary || '图片已分析，但未提取到稳定摘要',
    category: category || 'unknown',
    attributes: {
      color,
      style,
      season,
      material,
    },
    items,
    confidence: Number.isFinite(confidenceNumber) ? confidenceNumber : null,
  }
}

const buildVisionPrompt = (question = '') => {
  const trimmedQuestion = String(question || '').trim()
  return `你是一个图片理解工具，服务于穿搭 Agent。请阅读图片，并只返回 JSON，不要输出任何额外文本或 markdown 代码块。
JSON schema:
{
  "summary": "一句简短中文摘要",
  "items": [
    {
      "name": "衣物名称，可简短生成",
      "type": "优先使用中文规范类型：上衣/下衣/鞋子/配饰；无法判断填 unknown",
      "color": "主颜色",
      "style": "主要风格",
      "season": "适合季节",
      "material": "材质",
      "confidence": 0.0
    }
  ],
  "confidence": 0.0
}
要求：
1. 严格输出 JSON
2. 如果图中有多件可独立录入的衣物，items 中逐件列出；如果只有一件，items 长度也必须为 1
3. 如果无法判断，字段填空字符串或 "unknown"
4. type 尽量贴近衣橱可保存的规范值：上衣、下衣、鞋子、配饰
5. 仅基于图片可见内容回答，不要编造
6. summary 保持 1 句中文，适合后续提供给 LLM 作为工具结果
${trimmedQuestion ? `7. 当前用户问题：${trimmedQuestion}` : ''}`
}

const analyzeImageWithVisionTool = async ({ dataUrl, question = '' } = {}) => {
  ensureVisionToolConfig()
  if (visionToolBreaker.isOpen()) {
    console.error('[VisionTool] 断路器开启，跳过图片分析请求')
    const error = new Error('暂时无法分析图片')
    error.status = 503
    throw error
  }

  const matched = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!matched) {
    console.error('[VisionTool] 图片数据格式无效', {
      hasDataUrl: Boolean(dataUrl),
      question: toPreviewText(question, 120),
    })
    const error = new Error('图片数据格式无效')
    error.status = 400
    throw error
  }

  const mimeType = matched[1]
  const buffer = Buffer.from(matched[2], 'base64')
  const normalizedImage = await normalizeVisionImage(buffer, mimeType)
  const base64 = normalizedImage.buffer.toString('base64')
  const normalizedDataUrl = `data:${normalizedImage.mimeType};base64,${base64}`

  const { apiKey, baseUrl, model, timeoutMs } = getVisionToolConfig()

  let response
  try {
    response = await visionToolBreaker.exec(() =>
      axios.post(`${baseUrl}/chat/completions`, {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: normalizedDataUrl } },
              { type: 'text', text: buildVisionPrompt(question) },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 600,
      }, {
        timeout: timeoutMs,
        proxy: false,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })
    )
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      console.error('[VisionTool] SiliconFlow 视觉请求超时', {
        timeoutMs,
        model,
        mimeType: normalizedImage.mimeType,
        question: toPreviewText(question, 120),
      })
    }
    throw normalizeLlmError(error, 'SiliconFlow 图片分析服务', VISION_TOOL_ERROR_MESSAGES)
  }

  const rawContent = response?.data?.choices?.[0]?.message?.content
  if (!rawContent) {
    console.error('[VisionTool] 图片分析服务未返回有效 content', {
      model,
      mimeType: normalizedImage.mimeType,
      question: toPreviewText(question, 120),
      responseKeys: Object.keys(response?.data || {}),
    })
    const error = new Error('图片分析服务未返回结果')
    error.status = 502
    throw error
  }

  const parsed = extractJson(rawContent)
  if (!parsed) {
    console.error('[VisionTool] 图片分析结果无法解析为 JSON', {
      model,
      mimeType: normalizedImage.mimeType,
      question: toPreviewText(question, 120),
      rawContentPreview: toPreviewText(rawContent),
    })
    const error = new Error('图片分析结果格式异常')
    error.status = 502
    throw error
  }

  return normalizeVisionResult(parsed)
}

module.exports = {
  analyzeImageWithVisionTool,
  ensureVisionToolConfig,
  getVisionToolConfig,
}
