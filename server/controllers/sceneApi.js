const axios = require('axios')
const { getAllClothes } = require('./clothes')
const { isProbablyBase64Image } = require('../utils/validate')
const { createCircuitBreaker } = require('../utils/circuitBreaker')

const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
const DEEPSEEK_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const LLM_TIMEOUT_MS =
  Number(process.env.DEEPSEEK_SCENE_TIMEOUT_MS || process.env.LLM_SCENE_TIMEOUT_MS || process.env.DEEPSEEK_TIMEOUT_MS) ||
  8000
const MAX_SUITS = 5
const SCENE_LLM_BREAKER = createCircuitBreaker({
  name: 'deepseek-scene',
  failureThreshold: Number(process.env.DEEPSEEK_SCENE_BREAKER_FAILURE_THRESHOLD) || 3,
  cooldownMs: Number(process.env.DEEPSEEK_SCENE_BREAKER_COOLDOWN_MS) || 60 * 1000,
})

const sceneRules = [
  {
    keywords: ['商务', '办公', '会议'],
    name: '商务',
    preferredTypes: ['西装', '西装外套', '衬衫', '长裤', '西裤', '马甲'],
    styles: ['商务', '通勤', '正式'],
    colors: ['黑', '灰', '藏青', '蓝', '白', '卡其'],
  },
  {
    keywords: ['通勤', '日常'],
    name: '通勤',
    preferredTypes: ['衬衫', '针织', '毛衣', 'T恤', 'POLO', '外套', '长裤', '牛仔裤'],
    styles: ['通勤', '休闲'],
    colors: ['白', '蓝', '灰', '藏青', '卡其'],
  },
  {
    keywords: ['约会', '聚会', '晚餐'],
    name: '约会',
    preferredTypes: ['衬衫', '针织', '连衣裙', '半身裙', '长裤', '外套'],
    styles: ['休闲', '时尚', '通勤'],
    colors: ['白', '粉', '蓝', '黑', '红'],
  },
  {
    keywords: ['运动', '健身', '跑步'],
    name: '运动',
    preferredTypes: ['运动', '卫衣', 'T恤', '运动裤', '短裤'],
    styles: ['运动'],
    colors: ['黑', '灰', '白'],
  },
  {
    keywords: ['旅行', '出行'],
    name: '旅行',
    preferredTypes: ['外套', '风衣', 'T恤', '牛仔裤', '休闲裤', '运动鞋'],
    styles: ['休闲'],
    colors: ['蓝', '黑', '白', '卡其'],
  },
]

const pickRule = (scene = '') => {
  const hit = sceneRules.find((rule) => rule.keywords.some((k) => scene.includes(k)))
  return hit || {
    name: '通用',
    preferredTypes: [],
    styles: [],
    colors: [],
  }
}

const projectCloth = (cloth) => ({
  cloth_id: cloth.cloth_id,
  name: cloth.name,
  type: cloth.type,
  color: cloth.color,
  style: cloth.style,
  season: cloth.season,
  material: cloth.material,
  image: cloth.image,
  favorite: cloth.favorite,
})

const scoreCloth = (cloth, rule) => {
  let score = 1
  const { preferredTypes, styles, colors } = rule
  const type = cloth.type || ''
  const style = cloth.style || ''
  const color = cloth.color || ''
  if (preferredTypes?.some((t) => type.includes(t))) score += 3
  if (styles?.some((s) => style.includes(s))) score += 2
  if (colors?.some((c) => color.includes(c))) score += 1
  if (cloth.favorite) score += 1
  return score
}

const categorize = (clothes = [], rule) => {
  const scored = clothes.map((item) => ({
    item,
    score: scoreCloth(item, rule),
  }))
  const isTop = (type = '') =>
    ['上衣', '衬衫', '针织', '毛衣', '外套', '夹克', '西装', '卫衣', 'T恤', 'POLO'].some((k) =>
      type.includes(k)
    )
  const isBottom = (type = '') =>
    ['裤', '裙', '短裤', '长裤', '牛仔裤', '半身裙'].some((k) => type.includes(k))
  const isDress = (type = '') => type.includes('连衣裙')
  const isOuter = (type = '') => ['外套', '夹克', '西装', '风衣'].some((k) => type.includes(k))
  const isShoes = (type = '') => type.includes('鞋')

  return {
    tops: scored.filter(({ item }) => isTop(item.type)).sort((a, b) => b.score - a.score),
    bottoms: scored.filter(({ item }) => isBottom(item.type)).sort((a, b) => b.score - a.score),
    dresses: scored.filter(({ item }) => isDress(item.type)).sort((a, b) => b.score - a.score),
    outers: scored.filter(({ item }) => isOuter(item.type)).sort((a, b) => b.score - a.score),
    shoes: scored.filter(({ item }) => isShoes(item.type)).sort((a, b) => b.score - a.score),
  }
}

const buildRuleRecommendations = (scene, clothes) => {
  const rule = pickRule(scene)
  const { tops, bottoms, dresses, outers, shoes } = categorize(clothes, rule)
  const recommendations = []

  // 连衣裙组合
  dresses.slice(0, 3).forEach((dress, idx) => {
    const shoe = shoes[idx] || shoes[0]
    const combo = [dress.item]
    if (shoe) combo.push(shoe.item)
    recommendations.push({
      scene: scene || rule.name || '通用场景',
      source: 'rule',
      reason: `${rule.name}规则推荐：突出${dress.item?.style || '场景'}风格`,
      items: combo.map(projectCloth),
    })
  })

  // 上下装组合
  tops.slice(0, 3).forEach((top) => {
    bottoms.slice(0, 3).forEach((bottom) => {
      if (recommendations.length >= MAX_SUITS) return
      const combo = [top.item, bottom.item]
      const outer = outers.find(() => true)
      if (outer) combo.push(outer.item)
      const shoe = shoes.find(() => true)
      if (shoe) combo.push(shoe.item)
      recommendations.push({
        scene: scene || rule.name || '通用场景',
        source: 'rule',
        reason: `${rule.name}规则推荐：平衡上/下装与配色`,
        items: combo.map(projectCloth),
      })
    })
  })

  // 若仍不足，退化为单品推荐
  if (recommendations.length === 0 && clothes.length) {
    const sorted = [...clothes]
      .map((item) => ({ item, score: scoreCloth(item, rule) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ item }) => item)
    recommendations.push({
      scene: scene || rule.name || '通用场景',
      source: 'rule',
      reason: `${rule.name}规则推荐：暂缺完整搭配，推荐优先单品`,
      items: sorted.map(projectCloth),
    })
  }

  return recommendations.slice(0, MAX_SUITS)
}

const buildPrompt = (scene, clothes, options = {}) => {
  const { sex, season } = options
  const head = `你是专业造型师，只能使用我提供的衣柜 cloth_id 组合穿搭，禁止虚构不存在的衣物。输出 JSON 数组。`
  const sceneLine = `场景: ${scene || '通用场景'}${sex ? `，性别:${sex}` : ''}${season ? `，季节:${season}` : ''}`
  const items = clothes.slice(0, 40).map((c) => {
    const base = `${c.cloth_id}: ${c.name || c.type || '衣物'}`
    const meta = [c.type && `type=${c.type}`, c.color && `color=${c.color}`, c.style && `style=${c.style}`, c.season && `season=${c.season}`]
      .filter(Boolean)
      .join('; ')
    return `- ${base}${meta ? ` | ${meta}` : ''}`
  })

  return [
    head,
    sceneLine,
    '衣柜清单 (仅可使用这些 cloth_id):',
    items.join('\n'),
    '要求：',
    '- 仅使用提供的 cloth_id，生成 3-5 套。',
    '- 每套字段：scene, reason, items:[{cloth_id, note?}].',
    '- 不要返回未提供的衣物；不要输出多余解释；确保 JSON 可解析。',
    '输出示例:',
    `[{"scene":"${scene || '通用场景'}","reason":"正式低调","items":[{"cloth_id":1},{"cloth_id":2},{"cloth_id":3}]}]`,
  ].join('\n')
}

const parseLlmResult = (payload) => {
  if (!payload) return null
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'object' && payload.output) {
    const out = payload.output
    if (Array.isArray(out)) return out
    if (typeof out === 'string') {
      try {
        const parsed = JSON.parse(out)
        if (Array.isArray(parsed)) return parsed
      } catch {
        return null
      }
    }
  }
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      const start = payload.indexOf('[')
      const end = payload.lastIndexOf(']')
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(payload.slice(start, end + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const callLlm = async (scene, clothes, options = {}) => {
  if (!DEEPSEEK_API_KEY) {
    return { suits: [], error: 'DeepSeek API key 未配置' }
  }
  if (SCENE_LLM_BREAKER.isOpen()) {
    return { suits: [], error: '\u6a21\u578b\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff08\u7a33\u5b9a\u6027\u4fdd\u62a4\u4e2d\uff09' }
  }

  const prompt = buildPrompt(scene, clothes, options)
  const messages = [
    { role: 'system', content: '你是专业穿搭造型师，输出 JSON，字段 scene/reason/items。' },
    { role: 'user', content: prompt },
  ]

  const url = `${DEEPSEEK_BASE_URL}/v1/chat/completions`
  try {
    const res = await SCENE_LLM_BREAKER.exec(() =>
      axios.post(
        url,
        {
          model: DEEPSEEK_MODEL,
          messages,
          stream: false,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        },
        {
          timeout: LLM_TIMEOUT_MS,
          proxy: false,
          headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
        }
      )
    )
    const content =
      res?.data?.choices?.[0]?.message?.content ||
      res?.data?.message?.content ||
      res?.data?.content ||
      res?.data
    const parsed = parseLlmResult(content)
    if (!Array.isArray(parsed)) {
      return { suits: [], error: 'LLM 输出不可解析' }
    }
    return { suits: parsed, error: null }
  } catch (error) {
    return { suits: [], error: error?.message || 'LLM 调用失败' }
  }
}

const sanitizeSuits = (rawSuits, closetMap, scene, source) => {
  if (!Array.isArray(rawSuits)) return []
  const safeScene = scene || '通用场景'
  const seenSignatures = new Set()

  const normalized = rawSuits
    .map((suit) => {
      const items = Array.isArray(suit.items) ? suit.items : []
      const normalizedItems = items
        .map((it) => {
          const clothId = typeof it === 'object' ? it.cloth_id ?? it.id ?? it.clothId : it
          const parsedId = typeof clothId === 'string' ? parseInt(clothId, 10) : clothId
          if (!parsedId) return null
          const cloth = closetMap.get(parsedId) || closetMap.get(String(parsedId))
          if (!cloth) return null
          return projectCloth(cloth)
        })
        .filter(Boolean)

      if (!normalizedItems.length) return null

      // 组合签名用于去重（按 cloth_id 排序）
      const signature = normalizedItems
        .map((c) => c.cloth_id)
        .filter(Boolean)
        .sort()
        .join('-')
      if (seenSignatures.has(signature)) return null
      seenSignatures.add(signature)

      const reason = suit.reason || suit.description || suit.desc || suit.message || `${source === 'rule' ? '规则' : '模型'}推荐`
      const cover =
        suit.cover ||
        suit.image ||
        (Array.isArray(suit.items) ? suit.items.find((c) => c?.image)?.image : '') ||
        normalizedItems.find((c) => c.image)?.image ||
        ''

      return {
        id: suit.id ?? signature,
        scene: suit.scene || suit.sceneName || safeScene,
        source,
        reason,
        description: reason,
        items: normalizedItems,
        cover,
      }
    })
    .filter(Boolean)

  return normalized.slice(0, MAX_SUITS)
}

// 生成场景套装
const generateSceneSuits = async (ctx) => {
  const rawScene = ctx.request.body?.scene
  const scene = String(rawScene || '').trim()
  const userId = ctx.userId

  if (!userId) {
    ctx.status = 401
    ctx.body = { code: 0, msg: '未登录' }
    return
  }

  if (!scene) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '场景不能为空' }
    return
  }

  if (scene.length > 64) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '\u573a\u666f\u957f\u5ea6\u4e0d\u80fd\u8d85\u8fc764' }
    return
  }
  if (isProbablyBase64Image(scene) || scene.includes('data:image/')) {
    ctx.status = 400
    ctx.body = { code: 0, msg: '\u8bf7\u4e0d\u8981\u4f20\u5165\u56fe\u7247\u6570\u636e' }
    return
  }

  const closet = (await getAllClothes(userId)) || []
  if (!closet.length) {
    ctx.body = { code: 1, data: [], msg: '衣柜为空，请先添加衣物' }
    return
  }

  const closetMap = new Map()
  closet.forEach((item) => {
    closetMap.set(item.cloth_id, item)
    closetMap.set(String(item.cloth_id), item)
  })

  // 优先 LLM
  const { suits: llmRaw, error: llmError } = await callLlm(scene, closet)
  let suits = sanitizeSuits(llmRaw, closetMap, scene, 'llm')

  // LLM 失败或无可用结果时降级
  if (!suits.length) {
    const ruleSuits = buildRuleRecommendations(scene, closet)
    suits = sanitizeSuits(ruleSuits, closetMap, scene, 'rule')
    ctx.body = {
      code: 1,
      data: suits,
      msg: llmError ? `已切换规则推荐：${llmError}` : '已使用规则推荐',
    }
    return
  }

  ctx.body = {
    code: 1,
    data: suits,
    msg: llmError ? `部分模型异常：${llmError}` : undefined,
  }
}

module.exports = {
  generateSceneSuits,
}
