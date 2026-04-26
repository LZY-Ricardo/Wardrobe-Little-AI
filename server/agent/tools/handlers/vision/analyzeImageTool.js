const { analyzeImageWithVisionTool } = require('../../../../controllers/qwenVision')
const { buildToolCompletedEventMeta } = require('../../runtime/toolEventAdapter')

const IMAGE_TOOL_NAME = 'analyze_image'

const buildImageToolMeta = (toolResult = {}, status = 'success') =>
  buildToolCompletedEventMeta({
    toolName: IMAGE_TOOL_NAME,
    ok: status === 'success',
    summary:
      typeof toolResult?.summary === 'string'
        ? toolResult.summary
        : String(toolResult?.error || '').trim(),
  })

const normalizeImageToolFailure = ({ emit, result }) => {
  emit?.({
    type: 'tool_call_completed',
    tool: IMAGE_TOOL_NAME,
    ok: false,
    summary: result.summary || result.error || '图片分析失败',
    message: result.error || '图片分析失败',
  })
  return {
    kind: 'tool_result',
    toolName: IMAGE_TOOL_NAME,
    content: JSON.stringify(result),
    meta: buildImageToolMeta(result, 'failed'),
  }
}

const analyzeImageTool = async (userId, args = {}, ctx = {}) => {
  const attachmentIndex = Number.isInteger(args.attachmentIndex) ? args.attachmentIndex : 0
  const attachment = ctx?.multimodal?.attachments?.[attachmentIndex]
  if (!attachment?.dataUrl) {
    return { error: 'IMAGE_ATTACHMENT_NOT_FOUND', summary: '未找到可分析的图片附件。' }
  }

  try {
    const analyzeImage = ctx?.analyzeImage || analyzeImageWithVisionTool
    const question = String(args.question || ctx?.multimodal?.text || '').trim()
    return ctx?.analyzeImage
      ? analyzeImage(attachment.dataUrl, { question })
      : analyzeImage({
          dataUrl: attachment.dataUrl,
          question,
        })
  } catch (error) {
    console.error('[UnifiedAgent] 图片分析工具执行失败', {
      tool: IMAGE_TOOL_NAME,
      message: error?.message || '图片分析失败',
      status: error?.status || null,
      providerMessage: error?.providerMessage || '',
      attachmentName: attachment?.name || '',
      attachmentType: attachment?.mimeType || attachment?.type || '',
      hasDataUrl: Boolean(attachment?.dataUrl),
      question: String(args.question || ctx?.multimodal?.text || '').trim(),
    })
    return {
      error: error.message || '图片分析失败',
      summary: '图片分析失败，请结合用户文字继续给出保守回答。',
    }
  }
}

const executeAnalyzeImageTool = async ({
  args = {},
  multimodal,
  deps = {},
  emit,
} = {}) => {
  const result = await analyzeImageTool(null, args, {
    multimodal,
    analyzeImage: deps.analyzeImage,
  })

  if (result?.error) {
    return normalizeImageToolFailure({ emit, result })
  }

  emit?.({
    type: 'tool_call_completed',
    tool: IMAGE_TOOL_NAME,
    ok: true,
    summary: result.summary || '',
    message: '图片分析完成',
  })
  return {
    kind: 'tool_result',
    toolName: IMAGE_TOOL_NAME,
    content: JSON.stringify(result),
    result,
    meta: buildImageToolMeta(result, 'success'),
  }
}

module.exports = {
  IMAGE_TOOL_NAME,
  analyzeImageTool,
  buildImageToolMeta,
  executeAnalyzeImageTool,
}
