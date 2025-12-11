const axios = require('axios')

const patToken = process.env.COZE_PAT_TOKEN
const workflowUrl = 'https://api.coze.cn/v1/workflow/run'
const workflow3Id = process.env.COZE_WORKFLOW3_ID

const normalizeSceneSuits = (raw, fallbackScene = '') => {
  const safeScene = fallbackScene || '通用场景'
  let parsed = raw

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = raw
    }
  }

  const output = parsed?.output ?? parsed?.data ?? parsed
  let list = []

  if (Array.isArray(output)) {
    list = output
  } else if (Array.isArray(output?.suits)) {
    list = output.suits
  } else if (Array.isArray(output?.recommendations)) {
    list = output.recommendations
  } else if (typeof output === 'string') {
    list = output
      .split(/\n+/)
      .map((line) => ({ description: line.trim(), scene: safeScene }))
      .filter((item) => item.description)
  }

  return list.map((item, index) => ({
    id: item.id ?? index,
    scene: item.scene || item.sceneName || safeScene,
    description: item.description || item.message || item.desc || `AI 推荐搭配 ${index + 1}`,
    items: item.items || item.suits || item.clothes || [],
    cover: item.image || item.cover || item.img || '',
  }))
}

// 生成场景套装
const generateSceneSuits = async (ctx) => {
  if (!patToken || !workflow3Id) {
    ctx.status = 503
    ctx.body = { code: 0, msg: '场景推荐服务未配置' }
    return
  }

  try {
    const requestBody = ctx.request.body || {}
    const scene = requestBody.scene || requestBody.sceneName || ''

    const workflowResponse = await axios.post(
      workflowUrl,
      {
        workflow_id: workflow3Id,
        parameters: {
          scene,
          clothes_data: JSON.stringify(requestBody),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${patToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (workflowResponse?.data?.code !== 0) {
      ctx.status = 502
      ctx.body = { code: 0, msg: workflowResponse?.data?.msg || '场景推荐生成失败' }
      return
    }

    const suits = normalizeSceneSuits(workflowResponse?.data?.data, scene)
    ctx.body = { code: 1, data: suits }
  } catch (error) {
    console.error('生成场景套装错误:', error?.message || error)
    ctx.status = 500
    ctx.body = {
      code: 0,
      msg: '生成场景套装失败',
    }
  }
}

module.exports = {
  generateSceneSuits,
}
