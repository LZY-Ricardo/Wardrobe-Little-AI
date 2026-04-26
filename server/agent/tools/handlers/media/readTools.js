const { query } = require('../../../../models/db')
const {
  resolveDraftFromLatestTask,
} = require('../../../context/agentContextProtocol')
const { getUserInfoById } = require('../../../../controllers/user')
const { generatePreviewFromInputs } = require('../../../../controllers/clothesApi')
const { buildAssistantImageAttachments } = require('../../../../controllers/unifiedAgentAttachments')

const isImageDataUrl = (value = '') => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(value || '').trim())
const isRemoteImageUrl = (value = '') => /^https?:\/\/\S+/i.test(String(value || '').trim())

const inferAttachmentMimeType = (value = '') => {
  const normalized = String(value || '').trim()
  const matchedDataUrl = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
  if (matchedDataUrl?.[1]) return matchedDataUrl[1]

  try {
    const pathname = new URL(normalized).pathname.toLowerCase()
    if (pathname.endsWith('.png')) return 'image/png'
    if (pathname.endsWith('.webp')) return 'image/webp'
    if (pathname.endsWith('.gif')) return 'image/gif'
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg'
  } catch {
    // ignore invalid urls
  }

  return 'image/jpeg'
}

const buildAttachment = ({
  dataUrl = '',
  name = '',
  mimeType = '',
  source = '',
  variant = '',
  objectType = '',
  objectId = null,
} = {}) => {
  if (!isImageDataUrl(dataUrl) && !isRemoteImageUrl(dataUrl)) return null
  const normalizedObjectId = Number.parseInt(objectId, 10)
  return {
    type: 'image',
    ...(mimeType || dataUrl ? { mimeType: mimeType || inferAttachmentMimeType(dataUrl) } : {}),
    ...(name ? { name } : {}),
    dataUrl,
    ...(source ? { source } : {}),
    ...(variant ? { variant } : {}),
    ...(objectType ? { objectType } : {}),
    ...(Number.isFinite(normalizedObjectId) && normalizedObjectId > 0 ? { objectId: normalizedObjectId } : {}),
  }
}

const listClothesByIds = async (userId, clothIds = []) => {
  const ids = Array.from(
    new Set((Array.isArray(clothIds) ? clothIds : []).map((item) => Number.parseInt(item, 10)).filter((item) => item > 0))
  )
  if (!ids.length) return []

  const rows = await query(
    `SELECT cloth_id, name, type, image
       FROM clothes
      WHERE user_id = ? AND cloth_id IN (?)`,
    [userId, ids]
  )

  return Array.isArray(rows) ? rows : []
}

const normalizeClothIds = (clothIds = []) =>
  Array.from(
    new Set((Array.isArray(clothIds) ? clothIds : []).map((item) => Number.parseInt(item, 10)).filter((item) => item > 0))
  )

const showClothesImages = async (userId, args = {}, ctx = {}) => {
  const clothIds = normalizeClothIds(args?.cloth_ids)
  if (!clothIds.length) {
    return {
      error: 'INVALID_CLOTH_IDS',
      summary: '请先提供要展示的衣物编号。',
    }
  }

  const rows = await (ctx?.listClothesByIds || listClothesByIds)(userId, clothIds)
  const rowMap = new Map((Array.isArray(rows) ? rows : []).map((item) => [Number(item.cloth_id), item]))
  const attachments = clothIds
    .map((clothId) => rowMap.get(clothId))
    .map((cloth) => buildAttachment({
      dataUrl: cloth?.image,
      name: cloth?.name || '',
      mimeType: inferAttachmentMimeType(cloth?.image || ''),
      source: 'wardrobe',
      variant: 'original',
      objectType: 'cloth',
      objectId: cloth?.cloth_id,
    }))
    .filter(Boolean)

  if (!attachments.length) {
    return {
      kind: 'media_result',
      summary: '这些衣物当前没有可展示的图片。',
      attachments: [],
    }
  }

  return {
    kind: 'media_result',
    summary: `已准备 ${attachments.length} 张衣物图片。`,
    attachments,
  }
}

const normalizeDraftItems = async (userId, items = [], deps = {}) => {
  const sourceItems = Array.isArray(items) ? items : []
  const normalized = sourceItems
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) return item
      const clothId = Number.parseInt(item, 10)
      return clothId > 0 ? { cloth_id: clothId } : null
    })
    .filter(Boolean)

  const missingIds = normalized
    .map((item) => Number.parseInt(item?.cloth_id, 10))
    .filter((clothId) => clothId > 0)

  if (!missingIds.length) return normalized

  const rows = await (deps.listClothesByIds || listClothesByIds)(userId, missingIds)
  const rowMap = new Map((Array.isArray(rows) ? rows : []).map((item) => [Number(item.cloth_id), item]))

  return normalized.map((item) => {
    const clothId = Number.parseInt(item?.cloth_id, 10)
    if (!clothId || !rowMap.has(clothId)) return item
    return { ...rowMap.get(clothId), ...item }
  })
}

const isTopCloth = (item = {}) => /上衣|外套|衬衫|T恤|卫衣|毛衣|针织|背心/i.test(String(item?.type || '').trim())
const isBottomCloth = (item = {}) => /下衣|裤|裙|半裙|长裤|短裤/i.test(String(item?.type || '').trim())

const resolvePreviewPairFromDraft = async (userId, latestTask = null, deps = {}) => {
  const draft = resolveDraftFromLatestTask(latestTask)
  const manualSuitDraft = draft?.type === 'suit' ? draft.entity : null
  if (!Array.isArray(manualSuitDraft?.items) || manualSuitDraft.items.length < 2) return null

  const normalizedItems = await normalizeDraftItems(userId, manualSuitDraft.items, deps)
  if (normalizedItems.length < 2) return null

  if (String(manualSuitDraft?.source || '').trim() === 'match-page') {
    return {
      top: normalizedItems[0] || null,
      bottom: normalizedItems[1] || null,
      draft: manualSuitDraft,
    }
  }

  const top = normalizedItems.find(isTopCloth) || normalizedItems[0] || null
  const bottom = normalizedItems.find((item) => item !== top && isBottomCloth(item))
    || normalizedItems.find((item) => item !== top)
    || null

  if (!top || !bottom) return null
  return { top, bottom, draft: manualSuitDraft }
}

const showContextImages = async (userId, args = {}, ctx = {}) => {
  const attachments = await buildAssistantImageAttachments({
    userId,
    latestTask: ctx?.latestTask || null,
    input: String(ctx?.input || ctx?.latestTask?.input || '展示当前图片').trim(),
    deps: {
      listClothesByIds: ctx?.listClothesByIds,
      getSuitDetailForUser: ctx?.getSuitDetailForUser,
      getOutfitLogDetailForUser: ctx?.getOutfitLogDetailForUser,
    },
  })

  if (!attachments.length) {
    return {
      kind: 'media_result',
      summary: '当前上下文里没有可展示的图片。',
      attachments: [],
    }
  }

  const first = attachments[0]
  const summary =
    first?.objectType === 'cloth'
      ? '已准备当前衣物图片。'
      : first?.objectType === 'suit'
        ? '已准备当前套装图片。'
        : first?.objectType === 'outfit_log'
          ? '已准备当前穿搭记录图片。'
          : first?.objectType === 'recommendation'
            ? '已准备当前推荐结果图片。'
            : '已准备当前图片。'

  return {
    kind: 'media_result',
    summary,
    attachments,
  }
}

const generateOutfitPreview = async (userId, args = {}, ctx = {}) => {
  const currentLook = await resolvePreviewPairFromDraft(userId, ctx?.latestTask || null, {
    listClothesByIds: ctx?.listClothesByIds,
  })

  if (!currentLook?.top?.image || !currentLook?.bottom?.image) {
    return {
      error: 'MATCH_DRAFT_PREVIEW_NOT_READY',
      summary: '当前搭配缺少可生成预览图的上衣或下衣图片。',
    }
  }

  const getUserInfo = ctx?.getUserInfoById || getUserInfoById
  const user = await getUserInfo(userId)
  const sex = String(user?.sex || '').trim()
  const characterModel = String(user?.characterModel || '').trim()

  if (!['man', 'woman'].includes(sex)) {
    return {
      error: 'USER_SEX_REQUIRED',
      summary: '请先完善性别信息后再生成预览图。',
    }
  }

  if (!isImageDataUrl(characterModel)) {
    return {
      error: 'CHARACTER_MODEL_REQUIRED',
      summary: '请先上传人物模特后再生成预览图。',
    }
  }

  const generatePreview = ctx?.generatePreviewFromInputs || generatePreviewFromInputs
  const previewDataUrl = await generatePreview({
    top: {
      dataUrl: currentLook.top.image,
      name: currentLook.top.name || 'top',
    },
    bottom: {
      dataUrl: currentLook.bottom.image,
      name: currentLook.bottom.name || 'bottom',
    },
    characterModel: {
      dataUrl: characterModel,
      name: 'character-model',
    },
    sex,
  })

  const attachment = buildAttachment({
    dataUrl: previewDataUrl,
    name: `${currentLook.draft?.name || currentLook.draft?.scene || '当前搭配'}预览图`,
    mimeType: inferAttachmentMimeType(previewDataUrl),
    source: 'preview',
    variant: 'generated',
    objectType: 'outfit_preview',
  })

  if (!attachment) {
    return {
      error: 'OUTFIT_PREVIEW_INVALID',
      summary: '预览图生成结果无效，请稍后重试。',
    }
  }

  return {
    kind: 'media_result',
    summary: '已生成当前搭配预览图。',
    attachments: [attachment],
  }
}

module.exports = {
  generateOutfitPreview,
  showClothesImages,
  showContextImages,
}
