const { analyzeImageDataUrl } = require('./clothesVision')
const { executeAgentTask } = require('./agent')
const { buildClothDraftFromAnalysis, findMissingClothFields } = require('./agentWorkflow.helpers')

const SAVE_CLOTH_KEYWORDS = ['存入', '加入', '保存', '录入', '添加', '放进', '放入']
const CLOSET_KEYWORDS = ['衣橱', '衣柜', '衣物', '衣服']

const includesAny = (text = '', keywords = []) => keywords.some((keyword) => String(text || '').includes(keyword))

const resolveAgentWorkflow = async ({ input = '', multimodal = {} } = {}) => {
  const text = String(input || multimodal?.text || '').trim()
  const hasImage = Array.isArray(multimodal?.attachments) && multimodal.attachments.length > 0
  const shouldIngestCloth =
    hasImage &&
    includesAny(text, SAVE_CLOTH_KEYWORDS) &&
    includesAny(text, CLOSET_KEYWORDS)

  if (shouldIngestCloth) {
    return {
      shouldHandle: true,
      workflowType: 'ingest_cloth_from_image',
    }
  }

  return {
    shouldHandle: false,
    workflowType: '',
  }
}

const runAgentWorkflow = async ({ userId, input = '', multimodal = {}, sourceEntry = 'unified-agent', deps = {} } = {}) => {
  const route = await resolveAgentWorkflow({ input, multimodal })
  if (!route.shouldHandle) return null

  if (route.workflowType === 'ingest_cloth_from_image') {
    const attachments = Array.isArray(multimodal.attachments) ? multimodal.attachments.filter((a) => a?.dataUrl) : []
    if (!attachments.length) {
      const error = new Error('当前没有可用于录入的图片')
      error.status = 400
      throw error
    }

    const analyzeImage = deps.analyzeImage || analyzeImageDataUrl

    if (attachments.length === 1) {
      const analysis = await analyzeImage(attachments[0].dataUrl)
      const draftCloth = buildClothDraftFromAnalysis(analysis)
      const missingFields = findMissingClothFields(draftCloth)

      if (missingFields.length) {
        return {
          taskType: 'create_cloth',
          status: 'needs_clarification',
          requiresConfirmation: false,
          summary: `识别到这是一件待录入衣物，但还缺少：${missingFields.join('、')}。请补充后我再帮你保存到衣橱。`,
          result: {
            draftCloth,
            missingFields,
          },
        }
      }

      return executeAgentTask(userId, input, sourceEntry, {
        action: 'create_cloth',
        latestResult: {
          draftCloth: {
            ...draftCloth,
            image: attachments[0].dataUrl,
          },
        },
      })
    }

    // Multiple images: analyze each and batch-create
    const analyses = await Promise.all(attachments.map((a) => analyzeImage(a.dataUrl)))
    const draftClothes = analyses.map((analysis, i) => ({
      ...buildClothDraftFromAnalysis(analysis),
      image: attachments[i].dataUrl,
    }))

    const anyMissing = draftClothes.some((draft) => findMissingClothFields(draft).length > 0)
    if (anyMissing) {
      return {
        taskType: 'create_clothes_batch',
        status: 'needs_clarification',
        requiresConfirmation: false,
        summary: `识别到 ${draftClothes.length} 件衣物，部分信息不完整，请补充后再保存。`,
        result: {
          draftClothes,
        },
      }
    }

    return executeAgentTask(userId, input, sourceEntry, {
      action: 'create_clothes_batch',
      latestResult: {
        draftClothes,
      },
    })
  }

  return null
}

module.exports = {
  resolveAgentWorkflow,
  runAgentWorkflow,
}
