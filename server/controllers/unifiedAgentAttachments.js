const { query } = require('../models/db')
const { getSuitDetailForUser } = require('./suits')
const { getOutfitLogDetailForUser } = require('./outfitLogs')

const MAX_ATTACHMENTS = 4
const INTERNAL_IMAGE_REQUEST_PATTERN = /(图片|图|照片|看看|看下|展示|发我|发下|给我看)/

const isImageDataUrl = (value = '') => /^data:image\/[a-zA-Z0-9.+-]+(?:;[^,]+)?,/.test(String(value || '').trim())

const inferMimeType = (dataUrl = '') => {
  const matched = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+)(?:;[^,]+)?,/)
  return matched?.[1] || 'image/png'
}

const listClothesByIds = async (userId, clothIds = []) => {
  const ids = Array.from(
    new Set((Array.isArray(clothIds) ? clothIds : []).map((item) => Number.parseInt(item, 10)).filter((item) => item > 0))
  )
  if (!ids.length) return []

  const rows = await query(
    `SELECT cloth_id, name, image
       FROM clothes
      WHERE user_id = ? AND cloth_id IN (?)`,
    [userId, ids]
  )

  return Array.isArray(rows) ? rows : []
}

const escapeXml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const createCompositeAttachmentDataUrl = (images = [], title = '组合图片') => {
  const safeImages = (Array.isArray(images) ? images : []).filter((item) => isImageDataUrl(item)).slice(0, 3)
  if (!safeImages.length) return ''

  const layout = safeImages.length === 1
    ? [{ x: 24, y: 24, width: 552, height: 552 }]
    : safeImages.length === 2
      ? [
          { x: 24, y: 24, width: 552, height: 300 },
          { x: 24, y: 340, width: 552, height: 236 },
        ]
      : [
          { x: 24, y: 24, width: 552, height: 300 },
          { x: 24, y: 340, width: 264, height: 236 },
          { x: 312, y: 340, width: 264, height: 236 },
        ]

  const cards = safeImages
    .map((image, index) => {
      const frame = layout[index]
      return [
        `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="24" fill="#ffffff"/>`,
        `<clipPath id="clip-${index}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="24"/></clipPath>`,
        `<image href="${escapeXml(image)}" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${index})"/>`,
      ].join('')
    })
    .join('')

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">',
    '<rect width="600" height="600" rx="36" fill="#f5f7fb"/>',
    '<rect x="12" y="12" width="576" height="576" rx="30" fill="none" stroke="#e2e8f0" stroke-width="1"/>',
    '<defs>',
    safeImages.map((_, index) => {
      const frame = layout[index]
      return `<clipPath id="clip-${index}"><rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="24"/></clipPath>`
    }).join(''),
    '</defs>',
    cards.replace(/<clipPath[\s\S]*?<\/clipPath>/g, ''),
    `<text x="300" y="566" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif" font-size="24">${escapeXml(title)}</text>`,
    '</svg>',
  ].join('')

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const buildImageAttachment = ({
  dataUrl = '',
  name = '',
  source = '',
  variant = 'original',
  objectType = '',
  objectId = null,
}) => {
  if (!isImageDataUrl(dataUrl)) return null
  const normalizedObjectId = Number.parseInt(objectId, 10)
  return {
    type: 'image',
    ...(name ? { name: String(name).trim().slice(0, 120) } : {}),
    mimeType: inferMimeType(dataUrl),
    dataUrl,
    ...(source ? { source } : {}),
    ...(variant ? { variant } : {}),
    ...(objectType ? { objectType } : {}),
    ...(Number.isFinite(normalizedObjectId) && normalizedObjectId > 0 ? { objectId: normalizedObjectId } : {}),
  }
}

const uniqAttachments = (attachments = []) => {
  const seen = new Set()
  return attachments.filter((item) => {
    const key = `${item?.variant || ''}:${item?.objectType || ''}:${item?.objectId || ''}:${item?.dataUrl || ''}`
    if (!item?.dataUrl || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const attachOriginalCloths = (items = [], objectType = '', objectId = null, source = 'wardrobe') =>
  (Array.isArray(items) ? items : [])
    .map((item) =>
      buildImageAttachment({
        dataUrl: item?.image,
        name: item?.name || '',
        source,
        variant: 'original',
        objectType,
        objectId: objectType === 'cloth' ? item?.cloth_id : objectId,
      })
    )
    .filter(Boolean)

const enrichClothItemsWithImages = async (userId, items = [], deps = {}) => {
  const sourceItems = Array.isArray(items) ? items : []
  const missingIds = sourceItems
    .filter((item) => !isImageDataUrl(item?.image) && Number.parseInt(item?.cloth_id, 10) > 0)
    .map((item) => Number.parseInt(item.cloth_id, 10))

  if (!missingIds.length) return sourceItems

  const rows = await (deps.listClothesByIds || listClothesByIds)(userId, missingIds)
  const imageMap = new Map((Array.isArray(rows) ? rows : []).map((item) => [Number(item.cloth_id), item.image || '']))

  return sourceItems.map((item) => {
    if (isImageDataUrl(item?.image)) return item
    const clothId = Number.parseInt(item?.cloth_id, 10)
    if (!clothId || !imageMap.has(clothId)) return item
    return { ...item, image: imageMap.get(clothId) || '' }
  })
}

const buildRecommendationAttachments = async (userId, recommendationResult = {}, deps = {}) => {
  const suits = Array.isArray(recommendationResult?.suits) ? recommendationResult.suits : []
  if (!suits.length) return []

  const firstSuit = suits[0] || {}
  const enrichedItems = await enrichClothItemsWithImages(userId, firstSuit.items, deps)
  const originals = attachOriginalCloths(
    enrichedItems.slice(0, 3),
    'cloth',
    null,
    'wardrobe'
  )
  const composite = createCompositeAttachmentDataUrl(
    originals.map((item) => item.dataUrl),
    firstSuit.scene || '推荐搭配'
  )

  const compositeAttachment = buildImageAttachment({
    dataUrl: composite,
    name: firstSuit.scene ? `${firstSuit.scene}搭配` : '推荐搭配',
    source: 'composite',
    variant: 'composite',
    objectType: 'recommendation',
    objectId: recommendationResult?.recommendationHistoryId || null,
  })

  return uniqAttachments([compositeAttachment, ...originals].filter(Boolean)).slice(0, MAX_ATTACHMENTS)
}

const buildClothAttachments = (cloth = {}) =>
  uniqAttachments([
    buildImageAttachment({
      dataUrl: cloth?.image,
      name: cloth?.name || '',
      source: 'wardrobe',
      variant: 'original',
      objectType: 'cloth',
      objectId: cloth?.cloth_id,
    }),
  ].filter(Boolean))

const buildCollectionAttachments = async (collection = {}, options = {}) => {
  const objectType = options.objectType || ''
  const objectId = options.objectId || null
  const title = options.title || collection?.name || collection?.scene || '组合图片'
  const source = options.source || objectType
  const enrichedItems = await enrichClothItemsWithImages(options.userId, collection?.items, options.deps)
  const originals = attachOriginalCloths(enrichedItems.slice(0, 3), 'cloth', null, 'wardrobe')
  const compositeAttachment = buildImageAttachment({
    dataUrl: createCompositeAttachmentDataUrl(originals.map((item) => item.dataUrl), title),
    name: title,
    source: 'composite',
    variant: 'composite',
    objectType,
    objectId,
  })

  return uniqAttachments([compositeAttachment, ...originals].filter(Boolean)).slice(0, MAX_ATTACHMENTS)
}

const shouldAttachCurrentContextImages = (input = '') => INTERNAL_IMAGE_REQUEST_PATTERN.test(String(input || '').trim())

const buildAssistantImageAttachments = async ({
  userId,
  taskResult = null,
  latestTask = null,
  input = '',
  deps = {},
} = {}) => {
  if (!userId) return []

  const effectiveTask = taskResult || latestTask || null
  const taskType = String(effectiveTask?.taskType || '').trim()

  if (taskType === 'cloth_detail') {
    const cloth = effectiveTask?.selectedCloth || effectiveTask?.result?.selectedCloth || effectiveTask?.result || null
    if (isImageDataUrl(cloth?.image)) return buildClothAttachments(cloth)
    const clothId = Number.parseInt(cloth?.cloth_id, 10)
    if (!clothId) return []
    const rows = await (deps.listClothesByIds || listClothesByIds)(userId, [clothId])
    return buildClothAttachments({
      ...cloth,
      image: rows?.[0]?.image || '',
    })
  }

  if (taskType === 'recommendation') {
    return buildRecommendationAttachments(userId, effectiveTask?.result || {}, deps)
  }

  if (taskType === 'save_suit') {
    const selectedSuit = effectiveTask?.selectedSuit || effectiveTask?.result?.selectedSuit || effectiveTask?.result?.suit || null
    return buildCollectionAttachments(selectedSuit, {
      userId,
      deps,
      objectType: 'suit',
      objectId: selectedSuit?.suit_id,
      title: selectedSuit?.name || selectedSuit?.scene || '套装',
      source: 'suit',
    })
  }

  if (taskType === 'suit_detail') {
    const selectedSuit = effectiveTask?.selectedSuit || effectiveTask?.result?.selectedSuit || effectiveTask?.result || null
    return buildCollectionAttachments(selectedSuit, {
      userId,
      deps,
      objectType: 'suit',
      objectId: selectedSuit?.suit_id,
      title: selectedSuit?.name || selectedSuit?.scene || '套装',
      source: 'suit',
    })
  }

  if (taskType === 'create_outfit_log') {
    const selectedOutfitLog = effectiveTask?.selectedOutfitLog || effectiveTask?.result?.selectedOutfitLog || effectiveTask?.result || null
    return buildCollectionAttachments(selectedOutfitLog, {
      userId,
      deps,
      objectType: 'outfit_log',
      objectId: selectedOutfitLog?.id,
      title: selectedOutfitLog?.scene || selectedOutfitLog?.log_date || '穿搭记录',
      source: 'outfit_log',
    })
  }

  if (taskType === 'outfit_log_detail') {
    const selectedOutfitLog = effectiveTask?.selectedOutfitLog || effectiveTask?.result?.selectedOutfitLog || effectiveTask?.result || null
    return buildCollectionAttachments(selectedOutfitLog, {
      userId,
      deps,
      objectType: 'outfit_log',
      objectId: selectedOutfitLog?.id,
      title: selectedOutfitLog?.scene || selectedOutfitLog?.log_date || '穿搭记录',
      source: 'outfit_log',
    })
  }

  if (!shouldAttachCurrentContextImages(input)) return []

  const selectedCloth = latestTask?.selectedCloth || latestTask?.result?.selectedCloth || null
  if (selectedCloth?.cloth_id) {
    if (isImageDataUrl(selectedCloth?.image)) return buildClothAttachments(selectedCloth)
    const rows = await (deps.listClothesByIds || listClothesByIds)(userId, [selectedCloth.cloth_id])
    return buildClothAttachments({
      ...selectedCloth,
      image: rows?.[0]?.image || '',
    })
  }

  const selectedSuit = latestTask?.selectedSuit || latestTask?.result?.selectedSuit || null
  if (selectedSuit?.suit_id) {
    const suitDetail = selectedSuit?.items?.length
      ? selectedSuit
      : await (deps.getSuitDetailForUser || getSuitDetailForUser)(userId, selectedSuit.suit_id)
    return buildCollectionAttachments(suitDetail, {
      userId,
      deps,
      objectType: 'suit',
      objectId: selectedSuit.suit_id,
      title: suitDetail?.name || suitDetail?.scene || '套装',
      source: 'suit',
    })
  }

  const selectedOutfitLog = latestTask?.selectedOutfitLog || latestTask?.result?.selectedOutfitLog || null
  if (selectedOutfitLog?.id) {
    const logDetail = selectedOutfitLog?.items?.length
      ? selectedOutfitLog
      : await (deps.getOutfitLogDetailForUser || getOutfitLogDetailForUser)(userId, selectedOutfitLog.id)
    return buildCollectionAttachments(logDetail, {
      userId,
      deps,
      objectType: 'outfit_log',
      objectId: selectedOutfitLog.id,
      title: logDetail?.scene || logDetail?.log_date || '穿搭记录',
      source: 'outfit_log',
    })
  }

  if (latestTask?.taskType === 'recommendation' && Array.isArray(latestTask?.result?.suits)) {
    return buildRecommendationAttachments(userId, latestTask.result, deps)
  }

  return []
}

module.exports = {
  __testables: {
    createCompositeAttachmentDataUrl,
  },
  buildAssistantImageAttachments,
}
