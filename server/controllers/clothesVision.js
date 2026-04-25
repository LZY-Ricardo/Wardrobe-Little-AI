require('../config')

const axios = require('axios')
const { createCircuitBreaker } = require('../utils/circuitBreaker')
const { normalizeLlmError } = require('../utils/llmError')

let sharp = null
try {
  // 可选依赖：存在时用于统一转成稳定 JPEG，缺失时走原图
  sharp = require('sharp')
} catch {
  sharp = null
}

const ANALYZE_ERROR_MESSAGES = {
  unavailable: '暂时无法分析',
  config: '分析服务异常',
  quota: '分析额度不足',
  rateLimit: '请稍后再试',
  failed: '分析失败',
}

// SiliconFlow Vision 配置
const getVisionConfig = () => ({
  apiKey: process.env.SILICONFLOW_API_KEY,
  baseUrl: (process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
  model: process.env.SILICONFLOW_VISION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct',
  timeoutMs: Number(process.env.SILICONFLOW_TIMEOUT_MS) || 30000,
})

const sfBreaker = createCircuitBreaker({
  name: 'siliconflow',
  failureThreshold: 3,
  cooldownMs: 60 * 1000,
})

const normalizeVisionImage = async (imageBuffer, mimeType) => {
  if (!sharp) {
    return { buffer: imageBuffer, mimeType }
  }

  try {
    const output = await sharp(imageBuffer)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()

    return {
      buffer: output,
      mimeType: 'image/jpeg',
    }
  } catch (error) {
    console.warn('[Vision] 图片标准化失败，回退原图:', error.message)
    return { buffer: imageBuffer, mimeType }
  }
}

const VISION_PROMPT = `你是一个专业的衣物分析助手。请分析这张衣物图片，直接返回以下 JSON 格式的结果（不要输出其他任何内容）：
{
  "type": "衣物类型（如：上衣/衬衫/T恤/外套/下衣/长裤/短裤/裙子/鞋子/配饰）",
  "color": "主要颜色（如：白色/黑色/蓝色/红色等，多种颜色用顿号分隔）",
  "style": "风格（如：休闲/通勤/运动/正式/街头/复古/简约）",
  "season": "适合季节（如：春夏/秋冬/四季）",
  "material": "材质判断（如：棉/涤纶/羊毛/牛仔/丝绸，无法判断时填"未知"）"
}
注意：只输出 JSON，不要包含 markdown 代码块标记或其他文字。`

const ensureConfig = () => {
  const { apiKey } = getVisionConfig()
  if (!apiKey || apiKey === 'your_siliconflow_api_key') {
    const error = new Error('SILICONFLOW_API_KEY 未配置')
    error.status = 503
    throw error
  }
}

const extractJson = (text) => {
  try { return JSON.parse(text) } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (m) try { return JSON.parse(m[1].trim()) } catch {}
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) try { return JSON.parse(braceMatch[0]) } catch {}
  return null
}

const analyzeImageDataUrl = async (dataUrl) => {
  ensureConfig()
  if (sfBreaker.isOpen()) {
    const error = new Error('暂时无法分析')
    error.status = 503
    throw error
  }

  const matched = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!matched) {
    const error = new Error('图片数据格式无效')
    error.status = 400
    throw error
  }

  const mimeType = matched[1]
  const buffer = Buffer.from(matched[2], 'base64')
  const normalizedImage = await normalizeVisionImage(buffer, mimeType)
  const rawResult = await sfBreaker.exec(() => analyzeWithVision(normalizedImage.buffer, normalizedImage.mimeType))
  const analysisResult = extractJson(rawResult)
  if (!analysisResult) {
    throw new Error('分析结果格式异常')
  }
  return analysisResult
}

const analyzeWithVision = async (imageBuffer, mimeType) => {
  const { apiKey, baseUrl, model, timeoutMs } = getVisionConfig()
  const base64 = imageBuffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  console.log(`[Vision] 请求模型: ${model}, base64 大小: ${(base64.length / 1024).toFixed(1)}KB`)

  let response
  try {
    response = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: VISION_PROMPT },
        ],
      }],
      temperature: 0.1,
      max_tokens: 500,
    }, {
      timeout: timeoutMs,
      proxy: false,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (err) {
    throw normalizeLlmError(err, 'SiliconFlow 分析服务', ANALYZE_ERROR_MESSAGES)
  }

  const content = response.data?.choices?.[0]?.message?.content
  if (!content) throw new Error('视觉模型未返回结果')
  return content
}

const analyzeClothesVision = async (ctx) => {
  try {
    ensureConfig()
    if (sfBreaker.isOpen()) {
      ctx.status = 503
      ctx.body = { code: 0, msg: '暂时无法分析' }
      return
    }

    const imageFile = ctx.request.file
    if (!imageFile) {
      ctx.status = 400
      ctx.body = { code: 0, msg: '请上传衣物图片' }
      return
    }

    console.log('[Vision] 开始分析, 图片:', (imageFile.size / 1024).toFixed(1), 'KB')

    const startTime = Date.now()
    const normalizedImage = await normalizeVisionImage(imageFile.buffer, imageFile.mimetype)
    const rawResult = await sfBreaker.exec(() => analyzeWithVision(normalizedImage.buffer, normalizedImage.mimeType))
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    const analysisResult = extractJson(rawResult)
    if (!analysisResult) {
      console.error('[Vision] JSON 解析失败, 原始输出:', rawResult)
      throw new Error('分析结果格式异常')
    }

    console.log(`[Vision] 完成, 耗时: ${elapsed}s, 结果:`, JSON.stringify(analysisResult))
    ctx.body = { code: 1, data: JSON.stringify(analysisResult), meta: { elapsed: `${elapsed}s`, model: getVisionConfig().model } }
  } catch (error) {
    console.error('[Vision] 分析错误:', error.message)
    ctx.status = error.status || 500
    ctx.body = { code: 0, msg: error.message || '服务器错误' }
  }
}

module.exports = { analyzeClothesVision, analyzeImageDataUrl }
