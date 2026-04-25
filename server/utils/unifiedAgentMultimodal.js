const MAX_IMAGE_ATTACHMENTS = 4
const MAX_IMAGE_DATA_URL_LENGTH = Number(process.env.AGENT_IMAGE_MAX_DATA_URL_LENGTH || 1_600_000)

const clampString = (value, max = 2000) => String(value || '').trim().slice(0, max)

const parseImageAttachment = (raw = {}) => {
  const type = String(raw.type || '').trim()
  const mimeType = String(raw.mimeType || '').trim().toLowerCase()
  const name = clampString(raw.name || 'image', 120)
  const dataUrl = String(raw.dataUrl || '').trim()

  if (type !== 'image') {
    const error = new Error('暂不支持该附件类型')
    error.status = 400
    throw error
  }

  if (!mimeType.startsWith('image/')) {
    const error = new Error('仅支持图片附件')
    error.status = 400
    throw error
  }

  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
    const error = new Error('图片数据格式无效')
    error.status = 400
    throw error
  }

  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    const error = new Error('图片过大，请换一张更小的图片')
    error.status = 400
    throw error
  }

  return { type: 'image', mimeType, name, dataUrl }
}

const normalizeAttachments = (attachments = []) => {
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : []
  if (!list.length) return []
  if (list.length > MAX_IMAGE_ATTACHMENTS) {
    const error = new Error(`最多支持发送 ${MAX_IMAGE_ATTACHMENTS} 张图片`)
    error.status = 400
    throw error
  }
  return list.map(parseImageAttachment)
}

const getUserMessageType = ({ text = '', attachments = [] }) => {
  if (attachments.length && text) return 'multimodal'
  if (attachments.length) return 'image'
  return 'chat'
}

const buildUserMessageContent = ({ text = '', attachments = [] }) => {
  const trimmed = String(text || '').trim()
  if (!attachments.length) return trimmed

  const lines = []
  lines.push(attachments.length > 1 ? `[${attachments.length} 张图片]` : '[图片消息]')
  if (trimmed) lines.push(`用户说明：${trimmed}`)
  return lines.join('\n')
}

const buildSessionPreviewText = ({ text = '', attachments = [] }) => {
  const trimmed = String(text || '').trim()
  if (trimmed) return trimmed
  if (attachments.length > 1) return `发送了${attachments.length}张图片`
  if (attachments.length) return '发送了一张图片'
  return 'chat'
}

const buildImageAnalysisSummary = (analysis = {}) => {
  const entries = [
    ['类型', analysis.type],
    ['颜色', analysis.color],
    ['风格', analysis.style],
    ['季节', analysis.season],
    ['材质', analysis.material],
  ].filter(([, value]) => String(value || '').trim())

  return entries.map(([label, value]) => `${label}：${String(value).trim()}`).join('；')
}

const buildMultimodalPrompt = ({ text = '', attachments = [] }) => {
  const count = attachments.length
  const imageLabel = count > 1 ? `${count} 张图片` : '一张图片'
  const parts = []
  if (String(text || '').trim()) {
    parts.push(`用户发送了${imageLabel}，并补充说明：${String(text).trim()}`)
    if (count > 1) {
      parts.push(`共有 ${count} 张图片，每张图片的 attachmentIndex 从 0 到 ${count - 1}。如需理解图片细节，可分别调用 analyze_image 工具（指定不同的 attachmentIndex）。`)
    } else {
      parts.push('如果回答依赖图片细节，请先调用 analyze_image 工具。')
    }
  }
  if (!parts.length) {
    if (count > 1) {
      parts.push(`用户发送了${count} 张图片。如需理解图片细节，可分别调用 analyze_image 工具（attachmentIndex 从 0 到 ${count - 1}）。`)
    } else {
      parts.push('用户发送了一张图片。如有需要，请调用 analyze_image 工具理解图片后再回答。')
    }
  }
  return parts.join('\n')
}

module.exports = {
  buildImageAnalysisSummary,
  buildMultimodalPrompt,
  buildSessionPreviewText,
  buildUserMessageContent,
  getUserMessageType,
  normalizeAttachments,
}
