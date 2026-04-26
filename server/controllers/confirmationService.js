const crypto = require('crypto')

const { executeTool } = require('../utils/toolRegistry')
const { buildConfirmationViewModel } = require('../agent/tools/runtime/confirmationDescriptorResolver')
const {
  resolveDraftFromLatestTask,
  resolveFocusFromLatestTask,
} = require('../agent/context/agentContextProtocol')
const { isProbablyBase64Image } = require('../utils/validate')
const { getProfileInsight } = require('./profileInsights')
const { updateRecommendationAdoption } = require('./recommendations')
const { getTodayInChina } = require('../utils/date')

const AGENT_CONFIRM_TTL_MS = 5 * 60 * 1000
const LOW_RISK_ACTIONS = new Set(['toggle_favorite'])
const CONFIRMABLE_AGENT_ACTIONS = new Set([
  'create_cloth',
  'create_clothes_batch',
  'save_suit',
  'create_outfit_log',
  'update_outfit_log',
  'delete_cloth',
  'delete_suit',
  'delete_outfit_log',
  'update_cloth_fields',
  'update_cloth_image',
  'import_closet_data',
  'update_user_sex',
  'update_user_name',
  'upload_user_avatar',
  'upload_character_model',
  'delete_character_model',
  'update_confirmation_preferences',
  'toggle_favorite',
])

const pendingAgentOps = new Map()

const resolveSelectedCloth = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  if (focus?.type === 'cloth') return focus.entity
  if (latestTask?.result?.selectedCloth) return latestTask.result.selectedCloth
  if (latestTask?.result && Number.parseInt(latestTask.result?.cloth_id, 10) > 0) return latestTask.result
  return null
}

const resolveSelectedSuit = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  return focus?.type === 'suit' ? focus.entity : latestTask?.result?.selectedSuit || null
}

const resolveSelectedOutfitLog = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  return focus?.type === 'outfitLog' ? focus.entity : latestTask?.result?.selectedOutfitLog || null
}

const resolveManualSuitDraft = (latestTask = null) => {
  const draft = resolveDraftFromLatestTask(latestTask)
  return draft?.type === 'suit' ? draft.entity : latestTask?.result?.manualSuitDraft || null
}

const resolveManualOutfitLogDraft = (latestTask = null) => {
  const draft = resolveDraftFromLatestTask(latestTask)
  return draft?.type === 'outfitLog' ? draft.entity : latestTask?.result?.manualOutfitLogDraft || null
}

const makeConfirmId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10)

const OMITTED_IMAGE_PLACEHOLDER = '[omitted]'

const sanitizePersistedResultValue = (value, key = '', depth = 0) => {
  if (value == null) return value
  if (depth > 6) return null
  if (typeof value === 'string') {
    if (isProbablyBase64Image(value)) {
      return ['cover', 'image', 'dataUrl'].includes(key) ? null : OMITTED_IMAGE_PLACEHOLDER
    }
    return value.length > 4000 ? `${value.slice(0, 4000)}...[truncated]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePersistedResultValue(item, key, depth + 1))
      .filter((item) => item != null)
      .slice(0, 20)
  }
  if (typeof value !== 'object') return null

  const next = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === 'previewImages') continue
    const normalized = sanitizePersistedResultValue(entryValue, entryKey, depth + 1)
    if (normalized == null) continue
    next[entryKey] = normalized
  }
  return next
}

const buildPersistedConfirmedResultSummary = (pending = {}, confirmedSummary = '', result = null) => ({
  confirmed: true,
  summary: confirmedSummary,
  result: sanitizePersistedResultValue(result),
})

const sanitizePersistedExecutePayload = (action = '', executePayload = null) => {
  if (!executePayload || typeof executePayload !== 'object') return executePayload || null

  if (action === 'create_cloth') {
    const next = { ...executePayload }
    delete next.image
    return next
  }

  if (action === 'create_clothes_batch') {
    return Array.isArray(executePayload)
      ? executePayload.map((item) => {
          if (!item || typeof item !== 'object') return item
          const next = { ...item }
          delete next.image
          return next
        })
      : []
  }

  if (action === 'update_cloth_image') {
    const next = { ...executePayload }
    delete next.image
    return next
  }

  if (action === 'import_closet_data') {
    const items = Array.isArray(executePayload?.items)
      ? executePayload.items.map((item) => {
          if (!item || typeof item !== 'object') return item
          const next = { ...item }
          delete next.image
          return next
        })
      : []
    return { items }
  }

  if (action === 'upload_user_avatar' || action === 'upload_character_model') {
    const next = { ...executePayload }
    delete next.image
    return next
  }

  return executePayload
}

const summarizeConfirmedAction = (pending = {}, executed = {}) => {
  if (pending.action === 'create_cloth') {
    const name = String(
      executed?.result?.name ||
      pending?.executePayload?.name ||
      pending?.executePayload?.color ||
      ''
    ).trim()
    return name ? `已将“${name}”保存到衣橱` : '已保存衣物到衣橱'
  }

  if (pending.action === 'create_clothes_batch') {
    const createdCount = Number(
      executed?.result?.totalCreated ||
      (Array.isArray(executed?.result?.items) ? executed.result.items.length : 0)
    )
    if (createdCount > 0) {
      return `已将 ${createdCount} 件识别衣物保存到衣橱`
    }
    return '已批量保存衣物到衣橱'
  }

  if (pending.action === 'save_suit') {
    const name = String(executed?.result?.suit?.name || pending?.executePayload?.name || '').trim()
    return name ? `已保存套装“${name}”` : '已保存套装'
  }

  if (pending.action === 'create_outfit_log') {
    const logDate = String(executed?.result?.log_date || pending?.executePayload?.logDate || '').trim()
    return logDate ? `已记录 ${logDate} 的穿搭` : '已记录穿搭'
  }
  if (pending.action === 'update_outfit_log') {
    const logDate = String(executed?.result?.log_date || pending?.executePayload?.logDate || '').trim()
    return logDate ? `已更新 ${logDate} 的穿搭记录` : '已更新穿搭记录'
  }

  if (pending.action === 'delete_cloth') return '已删除衣物'
  if (pending.action === 'delete_suit') return '已删除套装'
  if (pending.action === 'delete_outfit_log') return '已删除穿搭记录'
  if (pending.action === 'update_cloth_fields') return '已更新衣物信息'
  if (pending.action === 'update_cloth_image') return '已更新衣物图片'
  if (pending.action === 'import_closet_data') {
    const inserted = Number(executed?.result?.inserted || 0)
    const total = Number(executed?.result?.total || 0)
    return total > 0 ? `已导入 ${inserted}/${total} 件衣物` : '已导入衣橱数据'
  }

  if (pending.action === 'update_user_sex') {
    const sex = String(pending?.executePayload?.sex || '').trim()
    return sex === 'man' ? '已将性别修改为男' : sex === 'woman' ? '已将性别修改为女' : '已更新性别设置'
  }

  if (pending.action === 'update_user_name') {
    const name = String(pending?.executePayload?.name || '').trim()
    return name ? `已将昵称修改为“${name}”` : '已更新昵称'
  }

  if (pending.action === 'upload_user_avatar') return '已更新头像'
  if (pending.action === 'upload_character_model') return '已更新人物模特'
  if (pending.action === 'delete_character_model') return '已删除人物模特'

  if (pending.action === 'update_confirmation_preferences') {
    return pending?.executePayload?.lowRiskNoConfirm ? '已开启低风险操作免确认' : '已关闭低风险操作免确认'
  }

  if (pending.action === 'toggle_favorite') {
    const favorite = Boolean(pending?.executePayload?.favorite)
    return favorite ? '已收藏衣物' : '已取消收藏衣物'
  }

  return String(pending.summary || '已执行操作').trim() || '已执行操作'
}

const buildPersistedConfirmationPayload = (confirmId, confirmation, createdAt) => ({
  confirmId,
  createdAt,
  action: confirmation.action,
  summary: confirmation.summary,
  scope: confirmation.scope,
  risk: confirmation.risk,
  details: confirmation.details || null,
  executePayload: sanitizePersistedExecutePayload(confirmation.action, confirmation.executePayload),
  recommendationHistoryId: confirmation.recommendationHistoryId || null,
})

const normalizeRecoveredPendingTask = (row, confirmation = {}) => ({
  confirmId: confirmation.confirmId,
  userId: row.user_id,
  historyId: row.id,
  createdAt: Number(confirmation.createdAt) || Number(row.create_time) || Date.now(),
  action: confirmation.action,
  summary: confirmation.summary || row.task_summary || '',
  scope: confirmation.scope || '',
  risk: confirmation.risk || '',
  details: confirmation.details || null,
  previewImages: Array.isArray(confirmation.previewImages) ? confirmation.previewImages : [],
  executePayload: confirmation.executePayload || {},
  recommendationHistoryId: confirmation.recommendationHistoryId || null,
})

const rehydratePendingTaskImages = async (pendingTask, deps = {}) => {
  if (!pendingTask || !['create_cloth', 'create_clothes_batch'].includes(pendingTask.action)) return pendingTask
  const getPendingConfirmationMessageMetaByConfirmId = deps.getPendingConfirmationMessageMetaByConfirmId
  if (typeof getPendingConfirmationMessageMetaByConfirmId !== 'function') return pendingTask

  const confirmationMeta = await getPendingConfirmationMessageMetaByConfirmId(pendingTask.userId, pendingTask.confirmId)
  const previewImages = Array.isArray(confirmationMeta?.previewImages) ? confirmationMeta.previewImages : []
  if (!previewImages.length) return pendingTask

  if (pendingTask.action === 'create_cloth') {
    if (pendingTask.executePayload?.image) return pendingTask
    const firstImage = String(previewImages[0]?.dataUrl || '').trim()
    if (!firstImage) return pendingTask
    return {
      ...pendingTask,
      executePayload: {
        ...(pendingTask.executePayload || {}),
        image: firstImage,
      },
    }
  }

  const items = Array.isArray(pendingTask.executePayload) ? pendingTask.executePayload : []
  if (!items.length) return pendingTask
  return {
    ...pendingTask,
    executePayload: items.map((item, index) => {
      if (!item || typeof item !== 'object' || item.image) return item
      const dataUrl = String(previewImages[index]?.dataUrl || '').trim()
      return dataUrl ? { ...item, image: dataUrl } : item
    }),
  }
}

const buildConfirmationPayload = ({ action, latestResult, suitIndex = 0 }) => {
  if (action === 'update_user_sex') {
    const sex = String(latestResult?.sex || latestResult?.result?.sex || '').trim()
    if (!['man', 'woman'].includes(sex)) {
      const error = new Error('当前没有可执行的性别设置')
      error.status = 400
      throw error
    }

    return {
      action,
      summary: `将性别修改为${sex === 'man' ? '男' : '女'}`,
      scope: `sex=${sex}`,
      risk: '会修改当前账号的性别设置，并影响依赖性别的搭配与人物模型流程。',
      executePayload: { sex },
    }
  }

  if (action === 'update_user_name') {
    const name = String(latestResult?.name || latestResult?.result?.name || '').trim()
    if (!name) {
      const error = new Error('当前没有可执行的昵称修改')
      error.status = 400
      throw error
    }
    return {
      action,
      summary: `将昵称修改为“${name}”`,
      scope: `name=${name}`,
      risk: '会修改当前账号昵称，并影响个人中心显示。',
      executePayload: { name },
    }
  }

  if (action === 'upload_user_avatar') {
    const image = String(latestResult?.image || latestResult?.result?.image || '').trim()
    if (!isProbablyBase64Image(image)) {
      const error = new Error('当前没有可更新的头像图片')
      error.status = 400
      throw error
    }
    return {
      action,
      summary: '更新当前头像',
      scope: 'avatar',
      risk: '会替换当前账号头像。',
      previewImages: [{
        type: 'image',
        name: 'avatar',
        mimeType: image.match(/^data:(image\/[a-zA-Z0-9.+-]+)(?:;[^,]+)?,/)?.[1] || 'image/jpeg',
        dataUrl: image,
      }],
      executePayload: { image },
    }
  }

  if (action === 'upload_character_model') {
    const image = String(latestResult?.image || latestResult?.result?.image || '').trim()
    if (!isProbablyBase64Image(image)) {
      const error = new Error('当前没有可更新的人物模特图片')
      error.status = 400
      throw error
    }
    return {
      action,
      summary: '更新当前人物模特',
      scope: 'characterModel',
      risk: '会替换当前人物模特，并影响搭配预览图生成。',
      previewImages: [{
        type: 'image',
        name: 'character-model',
        mimeType: image.match(/^data:(image\/[a-zA-Z0-9.+-]+)(?:;[^,]+)?,/)?.[1] || 'image/jpeg',
        dataUrl: image,
      }],
      executePayload: { image },
    }
  }

  if (action === 'delete_character_model') {
    return {
      action,
      summary: '删除当前人物模特',
      scope: 'characterModel',
      risk: '会删除当前人物模特，之后将无法生成搭配预览图，直到重新上传。',
      executePayload: {},
    }
  }

  if (action === 'delete_outfit_log') {
    const selectedOutfitLog = resolveSelectedOutfitLog(latestResult)
    const outfitLogId = Number.parseInt(selectedOutfitLog?.id, 10)
    if (!outfitLogId) {
      const error = new Error('当前没有可执行的穿搭记录对象')
      error.status = 400
      throw error
    }

    const itemCount = Number(selectedOutfitLog?.items?.length || selectedOutfitLog?.item_count || 0)
    return {
      action,
      summary: `删除穿搭记录“${selectedOutfitLog?.log_date || outfitLogId}”`,
      scope: `outfit_log_id=${outfitLogId}${itemCount ? ` / ${itemCount} 件单品` : ''}`,
      risk: '会永久删除当前穿搭记录，并回写关联推荐的采纳状态。',
      executePayload: { outfit_log_id: outfitLogId },
    }
  }

  if (action === 'update_outfit_log') {
    const selectedOutfitLog = resolveSelectedOutfitLog(latestResult)
    const outfitLogId = Number.parseInt(selectedOutfitLog?.id || latestResult?.id, 10)
    const patch = latestResult?.patch || latestResult?.result?.patch || {}
    if (!outfitLogId) {
      const error = new Error('当前没有可执行的穿搭记录对象')
      error.status = 400
      throw error
    }
    if (!Object.keys(patch).length) {
      const error = new Error('当前没有可更新的穿搭记录字段')
      error.status = 400
      throw error
    }
    return {
      action,
      summary: `更新穿搭记录“${selectedOutfitLog?.log_date || outfitLogId}”`,
      scope: `outfit_log_id=${outfitLogId}`,
      risk: '会修改当前穿搭记录的内容。',
      details: {
        logDate: patch.logDate || '',
        scene: patch.scene || '',
      },
      executePayload: {
        outfit_log_id: outfitLogId,
        ...patch,
      },
    }
  }

  if (action === 'delete_suit') {
    const selectedSuit = resolveSelectedSuit(latestResult)
    const suitId = Number.parseInt(selectedSuit?.suit_id, 10)
    if (!suitId) {
      const error = new Error('当前没有可执行的套装对象')
      error.status = 400
      throw error
    }

    const itemCount = Number(selectedSuit?.item_count || (Array.isArray(selectedSuit?.items) ? selectedSuit.items.length : 0) || 0)
    return {
      action,
      summary: `删除套装“${selectedSuit?.name || suitId}”`,
      scope: `suit_id=${suitId}${itemCount ? ` / ${itemCount} 件单品` : ''}`,
      risk: '会永久删除当前套装记录，但不会删除套装中的单品。',
      executePayload: { suit_id: suitId },
    }
  }

  if (action === 'delete_cloth') {
    const selectedCloth = resolveSelectedCloth(latestResult)
    const clothId = Number.parseInt(selectedCloth?.cloth_id, 10)
    if (!clothId) {
      const error = new Error('当前没有可执行的衣物对象')
      error.status = 400
      throw error
    }

    return {
      action,
      summary: `删除衣物“${selectedCloth?.name || clothId}”`,
      scope: `cloth_id=${clothId}`,
      risk: '会永久删除当前衣物记录，并影响衣橱展示及后续推荐。',
      executePayload: { cloth_id: clothId },
    }
  }

  if (action === 'update_cloth_fields') {
    const selectedCloth = resolveSelectedCloth(latestResult)
    const patch = latestResult?.patch || latestResult?.result?.patch || {}
    const clothId = Number.parseInt(selectedCloth?.cloth_id, 10)
    if (!clothId) {
      const error = new Error('当前没有可执行的衣物对象')
      error.status = 400
      throw error
    }

    const entries = Object.entries(patch).filter(([, value]) => String(value || '').trim())
    if (!entries.length) {
      const error = new Error('当前没有可更新的衣物字段')
      error.status = 400
      throw error
    }

    const fieldLabels = {
      name: '名称',
      type: '类型',
      color: '颜色',
      style: '风格',
      season: '季节',
      material: '材质',
    }
    const changeSummary = entries.map(([key, value]) => `${fieldLabels[key] || key}改为${String(value).trim()}`).join('，')

    return {
      action,
      summary: `将衣物“${selectedCloth?.name || clothId}”的${changeSummary}`,
      scope: `cloth_id=${clothId}`,
      risk: '会修改当前衣物的基础信息，并影响衣橱展示与后续推荐。',
      executePayload: {
        cloth_id: clothId,
        ...patch,
      },
    }
  }

  if (action === 'update_cloth_image') {
    const selectedCloth = resolveSelectedCloth(latestResult)
    const clothId = Number.parseInt(selectedCloth?.cloth_id, 10)
    const image = String(latestResult?.image || latestResult?.result?.image || '').trim()
    if (!clothId) {
      const error = new Error('当前没有可执行的衣物对象')
      error.status = 400
      throw error
    }
    if (!isProbablyBase64Image(image)) {
      const error = new Error('当前没有可更新的衣物图片')
      error.status = 400
      throw error
    }
    return {
      action,
      summary: `替换衣物“${selectedCloth?.name || clothId}”的图片`,
      scope: `cloth_id=${clothId}`,
      risk: '会替换当前衣物的展示图片，并影响衣橱展示与后续推荐。',
      previewImages: [
        {
          type: 'image',
          name: selectedCloth?.name || `cloth-${clothId}`,
          mimeType: image.match(/^data:(image\/[a-zA-Z0-9.+-]+)(?:;[^,]+)?,/)?.[1] || 'image/jpeg',
          dataUrl: image,
        },
      ],
      executePayload: {
        cloth_id: clothId,
        image,
      },
    }
  }

  if (action === 'import_closet_data') {
    const items = Array.isArray(latestResult?.items) ? latestResult.items : Array.isArray(latestResult?.result?.items) ? latestResult.result.items : []
    if (!items.length) {
      const error = new Error('当前没有可导入的衣橱数据')
      error.status = 400
      throw error
    }
    return {
      action,
      summary: `导入 ${items.length} 件衣物到衣橱`,
      scope: `${items.length} 件衣物`,
      risk: '会向当前账号的衣橱新增多条衣物记录。',
      details: {
        count: String(items.length),
        items: items.slice(0, 5).map((item, index) => ({
          index: String(index + 1),
          name: item?.name || `衣物 ${index + 1}`,
          type: item?.type || '',
          color: item?.color || '',
          style: item?.style || '',
          season: item?.season || '',
          material: item?.material || '',
        })),
      },
      executePayload: { items },
    }
  }

  if (action === 'toggle_favorite') {
    const selectedCloth = resolveSelectedCloth(latestResult)
    const clothId = Number.parseInt(selectedCloth?.cloth_id, 10)
    if (!clothId) {
      const error = new Error('当前没有可执行的衣物对象')
      error.status = 400
      throw error
    }
    const favorite = !(selectedCloth?.favorite === 1 || selectedCloth?.favorite === true)
    return {
      action,
      summary: `${favorite ? '收藏' : '取消收藏'}衣物 ${selectedCloth?.name || clothId}`,
      scope: `cloth_id=${clothId}`,
      risk: '会修改当前衣物的收藏状态，并影响后续推荐排序。',
      executePayload: { cloth_id: clothId, favorite },
    }
  }

  if (action === 'update_confirmation_preferences') {
    const nextValue = Boolean(latestResult?.nextLowRiskNoConfirm)
    return {
      action,
      summary: `${nextValue ? '开启' : '关闭'}低风险操作免确认`,
      scope: `lowRiskNoConfirm=${nextValue}`,
      risk: '会改变 Agent 执行低风险写操作时是否需要确认。',
      executePayload: { lowRiskNoConfirm: nextValue },
    }
  }

  if (action === 'create_cloth') {
    const draftCloth = latestResult?.draftCloth || latestResult?.result?.draftCloth
    if (!draftCloth?.type) {
      const error = new Error('当前没有可保存的衣物草稿')
      error.status = 400
      throw error
    }
    if (!isProbablyBase64Image(draftCloth?.image || '')) {
      const error = new Error('当前待保存衣物缺少合法图片，请重新上传图片后再试')
      error.status = 400
      throw error
    }
    const safeName = draftCloth?.name || `${draftCloth?.color || ''}${draftCloth?.type || '衣物'}`
    return {
      action,
      summary: `将“${safeName}”保存到衣橱`,
      scope: `${draftCloth?.type || '未知类型'} / ${draftCloth?.color || '未知颜色'}`,
      risk: '会新增一条衣物记录到当前账号的衣橱中。',
      details: {
        name: safeName,
        type: draftCloth?.type || '',
        color: draftCloth?.color || '',
        style: draftCloth?.style || '',
        season: draftCloth?.season || '',
        material: draftCloth?.material || '',
      },
      previewImages: draftCloth?.image
        ? [
            {
              type: 'image',
              name: safeName,
              mimeType: String(draftCloth.image).match(/^data:(image\/[a-zA-Z0-9.+-]+)(?:;[^,]+)?,/)?.[1] || 'image/jpeg',
              dataUrl: draftCloth.image,
            },
          ]
        : [],
      executePayload: draftCloth,
    }
  }

  if (action === 'create_clothes_batch') {
    const rawDrafts = latestResult?.draftClothes || latestResult?.result?.draftClothes
    const draftClothes = Array.isArray(rawDrafts)
      ? rawDrafts.filter((item) => item && typeof item === 'object' && item.type)
      : []

    if (!draftClothes.length) {
      const error = new Error('当前没有可批量保存的衣物草稿')
      error.status = 400
      throw error
    }
    if (draftClothes.some((item) => !isProbablyBase64Image(item?.image || ''))) {
      const error = new Error('当前批量待保存衣物存在缺少合法图片的项，请重新上传图片后再试')
      error.status = 400
      throw error
    }

    const compactItems = draftClothes.slice(0, 5).map((item, index) => ({
      index: String(index + 1),
      name: item.name || `${item.color || ''}${item.type || '衣物'}`,
      type: item.type || '',
      color: item.color || '',
      style: item.style || '',
      season: item.season || '',
      material: item.material || '',
    }))

    return {
      action,
      summary: `将识别出的 ${draftClothes.length} 件衣物保存到衣橱`,
      scope: `${draftClothes.length} 件衣物 / 批量新增`,
      risk: '会新增多条衣物记录到当前账号的衣橱中。',
      details: {
        count: String(draftClothes.length),
        items: compactItems,
      },
      previewImages: draftClothes
        .map((item, index) => {
          const dataUrl = String(item?.image || '').trim()
          if (!dataUrl) return null
          return {
            type: 'image',
            name: item.name || `衣物 ${index + 1}`,
            mimeType: dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+)(?:;[^,]+)?,/)?.[1] || 'image/jpeg',
            dataUrl,
          }
        })
        .filter(Boolean)
        .slice(0, 4),
      executePayload: draftClothes,
    }
  }

  if (action === 'save_suit') {
    const manualSuitDraft = resolveManualSuitDraft(latestResult)
    if (manualSuitDraft && typeof manualSuitDraft === 'object') {
      const clothIds = (Array.isArray(manualSuitDraft.items) ? manualSuitDraft.items : [])
        .map((item) => Number.parseInt(item, 10))
        .filter((id) => Number.isFinite(id) && id > 0)

      if (clothIds.length < 2) {
        const error = new Error('手动创建套装至少需要 2 件单品')
        error.status = 400
        throw error
      }

      const suitName = String(manualSuitDraft.name || manualSuitDraft.scene || '我的套装').trim() || '我的套装'
      return {
        action,
        summary: `将“${suitName}”保存为套装`,
        scope: `${manualSuitDraft.scene || '通用场景'} / ${clothIds.length} 件单品`,
        risk: '会新增一条套装记录到当前账号。',
        details: {
          name: suitName,
          scene: manualSuitDraft.scene || '',
          count: String(clothIds.length),
        },
        executePayload: {
          name: suitName,
          scene: String(manualSuitDraft.scene || '').trim(),
          description: String(manualSuitDraft.description || '').trim(),
          source: String(manualSuitDraft.source || 'agent').trim() || 'agent',
          items: clothIds,
        },
      }
    }
  }

  if (action === 'create_outfit_log') {
    const manualOutfitLogDraft = resolveManualOutfitLogDraft(latestResult)
    if (manualOutfitLogDraft && typeof manualOutfitLogDraft === 'object') {
      const clothIds = (Array.isArray(manualOutfitLogDraft.items) ? manualOutfitLogDraft.items : [])
        .map((item) => Number.parseInt(item, 10))
        .filter((id) => Number.isFinite(id) && id > 0)

      if (!clothIds.length) {
        const error = new Error('手动创建穿搭记录至少需要 1 件单品')
        error.status = 400
        throw error
      }

      const logDate = String(manualOutfitLogDraft.logDate || getTodayInChina()).trim() || getTodayInChina()
      return {
        action,
        summary: `记录 ${logDate} 的穿搭`,
        scope: `${manualOutfitLogDraft.scene || '通用场景'} / ${clothIds.length} 件单品`,
        risk: '会新增一条穿搭记录。',
        details: {
          logDate,
          scene: manualOutfitLogDraft.scene || '',
          count: String(clothIds.length),
        },
        executePayload: {
          recommendationId: manualOutfitLogDraft.recommendationId || null,
          suitId: manualOutfitLogDraft.suitId || null,
          logDate,
          scene: String(manualOutfitLogDraft.scene || '').trim(),
          weatherSummary: String(manualOutfitLogDraft.weatherSummary || '').trim(),
          satisfaction: Number(manualOutfitLogDraft.satisfaction || 0),
          source: String(manualOutfitLogDraft.source || 'agent').trim() || 'agent',
          note: String(manualOutfitLogDraft.note || '').trim(),
          items: clothIds,
        },
      }
    }
  }

  const safeIndex = Math.max(0, Number(suitIndex) || 0)
  const suits = Array.isArray(latestResult?.result?.suits) ? latestResult.result.suits : []
  const selectedSuit = suits[safeIndex]
  if (!selectedSuit) {
    const error = new Error('当前没有可执行的推荐结果')
    error.status = 400
    throw error
  }
  const clothIds = (selectedSuit.items || [])
    .map((item) => Number.parseInt(item?.cloth_id, 10))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (!clothIds.length) {
    const error = new Error('推荐结果缺少有效单品')
    error.status = 400
    throw error
  }

  if (action === 'save_suit') {
    return {
      action,
      summary: `将第 ${safeIndex + 1} 套推荐保存为套装`,
      scope: `${selectedSuit.scene || '通用场景'} / ${clothIds.length} 件单品`,
      risk: '会新增一条套装记录到当前账号。',
      executePayload: {
        name: `${selectedSuit.scene || '推荐'}套装`,
        scene: selectedSuit.scene || '',
        description: selectedSuit.reason || selectedSuit.description || '',
        source: 'agent',
        items: clothIds,
      },
      recommendationHistoryId: latestResult?.result?.recommendationHistoryId || null,
    }
  }

  if (action === 'create_outfit_log') {
    return {
      action,
      summary: `将第 ${safeIndex + 1} 套推荐记录为穿搭`,
      scope: `${selectedSuit.scene || '通用场景'} / ${clothIds.length} 件单品`,
      risk: '会新增一条穿搭记录，并回写推荐采纳状态。',
      executePayload: {
        recommendationId: latestResult?.result?.recommendationHistoryId || null,
        logDate: getTodayInChina(),
        scene: selectedSuit.scene || '',
        source: 'agent',
        note: selectedSuit.reason || selectedSuit.description || '',
        items: clothIds,
      },
    }
  }

  const error = new Error('不支持的 Agent 写操作')
  error.status = 400
  throw error
}

const stageAgentConfirmation = async (userId, input, sourceEntry, options = {}, deps = {}) => {
  const confirmation = buildConfirmationPayload(options)
  const confirmationViewModel = buildConfirmationViewModel({
    action: confirmation.action,
    confirmation,
  })
  const confirmId = makeConfirmId()
  const createdAt = Date.now()
  const persistedConfirmation = buildPersistedConfirmationPayload(confirmId, confirmation, createdAt)
  const historyId = await deps.insertAgentTaskHistory(userId, {
    sourceEntry,
    taskType: confirmation.action,
    taskSummary: input,
    status: 'pending',
    requiresConfirmation: true,
    confirmationStatus: 'pending',
    relatedObjectType:
      confirmation.action === 'save_suit'
        ? 'suit'
        : confirmation.action === 'update_user_sex'
          ? 'profile'
        : confirmation.action === 'update_user_name'
          ? 'profile'
        : confirmation.action === 'upload_user_avatar'
          ? 'profile'
        : confirmation.action === 'upload_character_model'
          ? 'profile'
        : confirmation.action === 'delete_character_model'
          ? 'profile'
        : confirmation.action === 'delete_outfit_log'
          ? 'outfit_log'
        : confirmation.action === 'update_outfit_log'
          ? 'outfit_log'
        : confirmation.action === 'delete_suit'
          ? 'suit'
        : confirmation.action === 'update_cloth_fields'
          ? 'cloth'
        : confirmation.action === 'update_cloth_image'
          ? 'cloth'
        : confirmation.action === 'delete_cloth'
          ? 'cloth'
        : confirmation.action === 'create_cloth'
          ? 'cloth'
          : confirmation.action === 'create_clothes_batch'
            ? 'cloth'
          : confirmation.action === 'import_closet_data'
            ? 'wardrobe'
          : 'outfit_log',
    result: {
      pending: true,
      confirmation: persistedConfirmation,
    },
  })

  pendingAgentOps.set(confirmId, {
    confirmId,
    userId,
    historyId,
    createdAt,
    ...confirmation,
  })

  return {
    taskType: confirmation.action,
    summary: confirmation.summary,
    status: 'pending',
    requiresConfirmation: true,
    confirmation: {
      confirmId,
      ...confirmationViewModel,
    },
    historyId,
  }
}

const executeConfirmedAgentTask = async (pending) => {
  if (pending.action === 'update_user_sex') {
    const result = await executeTool('update_user_sex', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'profile', relatedObjectId: pending.userId, result }
  }
  if (pending.action === 'update_user_name') {
    const result = await executeTool('update_user_name', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'profile', relatedObjectId: pending.userId, result }
  }
  if (pending.action === 'upload_user_avatar') {
    const result = await executeTool('upload_user_avatar', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'profile', relatedObjectId: pending.userId, result }
  }
  if (pending.action === 'upload_character_model') {
    const result = await executeTool('upload_character_model', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'profile', relatedObjectId: pending.userId, result }
  }
  if (pending.action === 'delete_character_model') {
    const result = await executeTool('delete_character_model', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'profile', relatedObjectId: pending.userId, result }
  }
  if (pending.action === 'delete_outfit_log') {
    const result = await executeTool('delete_outfit_log', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'outfit_log', relatedObjectId: pending.executePayload.outfit_log_id, result }
  }
  if (pending.action === 'update_outfit_log') {
    const result = await executeTool('update_outfit_log', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'outfit_log', relatedObjectId: pending.executePayload.outfit_log_id, result }
  }
  if (pending.action === 'delete_suit') {
    const result = await executeTool('delete_suit', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'suit', relatedObjectId: pending.executePayload.suit_id, result }
  }
  if (pending.action === 'delete_cloth') {
    const result = await executeTool('delete_cloth', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'cloth', relatedObjectId: pending.executePayload.cloth_id, result }
  }
  if (pending.action === 'update_cloth_fields') {
    const result = await executeTool('update_cloth_fields', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'cloth', relatedObjectId: pending.executePayload.cloth_id, result }
  }
  if (pending.action === 'update_cloth_image') {
    const result = await executeTool('update_cloth_image', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'cloth', relatedObjectId: pending.executePayload.cloth_id, result }
  }
  if (pending.action === 'toggle_favorite') {
    const result = await executeTool('set_cloth_favorite', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'cloth', relatedObjectId: pending.executePayload.cloth_id, result }
  }
  if (pending.action === 'create_cloth') {
    const result = await executeTool('create_cloth', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'cloth', relatedObjectId: result?.cloth_id || null, result }
  }
  if (pending.action === 'create_clothes_batch') {
    const result = await executeTool('create_clothes_batch', { items: pending.executePayload }, { userId: pending.userId })
    return {
      relatedObjectType: 'cloth',
      relatedObjectId: Array.isArray(result?.items) ? result.items[0]?.cloth_id || null : null,
      result,
    }
  }
  if (pending.action === 'update_confirmation_preferences') {
    const result = await executeTool('update_confirmation_preferences', pending.executePayload, {
      userId: pending.userId,
    })
    return { relatedObjectType: 'profile_preference', relatedObjectId: null, result }
  }
  if (pending.action === 'import_closet_data') {
    const result = await executeTool('import_closet_data', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'wardrobe', relatedObjectId: null, result }
  }
  if (pending.action === 'save_suit') {
    const result = await executeTool('save_suit', pending.executePayload, { userId: pending.userId })
    if (pending.recommendationHistoryId) {
      await updateRecommendationAdoption(pending.userId, pending.recommendationHistoryId, {
        saved_as_suit: 1,
      })
    }
    return { relatedObjectType: 'suit', relatedObjectId: result?.suit?.suit_id || null, result }
  }
  if (pending.action === 'create_outfit_log') {
    const result = await executeTool('create_outfit_log', pending.executePayload, { userId: pending.userId })
    return { relatedObjectType: 'outfit_log', relatedObjectId: result?.id || null, result }
  }
  throw new Error('UNKNOWN_AGENT_CONFIRM_ACTION')
}

const confirmAgentTask = async (userId, confirmId, deps = {}) => {
  const pending = pendingAgentOps.get(confirmId) || await deps.getPendingAgentTaskByConfirmId(userId, confirmId)
  if (!pending || pending.userId !== userId) {
    const error = new Error('确认操作不存在或已失效')
    error.status = 404
    throw error
  }
  if (Date.now() - pending.createdAt > AGENT_CONFIRM_TTL_MS) {
    pendingAgentOps.delete(confirmId)
    await deps.updateAgentTaskHistory(pending.historyId, {
      status: 'expired',
      confirmation_status: 'expired',
      result_summary: { expired: true },
    })
    const error = new Error('确认已过期，请重新发起任务')
    error.status = 400
    throw error
  }

  pendingAgentOps.delete(confirmId)
  const executed = await executeConfirmedAgentTask(pending)
  const confirmedSummary = summarizeConfirmedAction(pending, executed)
  const resultPayload = buildPersistedConfirmedResultSummary(pending, confirmedSummary, executed.result)
  await deps.updateAgentTaskHistory(pending.historyId, {
    status: 'success',
    confirmation_status: 'confirmed',
    related_object_type: executed.relatedObjectType,
    related_object_id: executed.relatedObjectId,
    result_summary: resultPayload,
  })
  return {
    taskType: pending.action,
    status: 'success',
    summary: confirmedSummary,
    relatedObjectType: executed.relatedObjectType,
    relatedObjectId: executed.relatedObjectId,
    result:
      pending.action === 'create_cloth'
        ? { selectedCloth: executed.result }
        : pending.action === 'create_clothes_batch'
          ? {
              createdClothes: Array.isArray(executed.result?.items) ? executed.result.items : [],
            }
          : pending.action === 'update_cloth_image' && executed.result
            ? { selectedCloth: executed.result }
          : executed.result,
    ...((pending.action === 'create_cloth' || pending.action === 'update_cloth_image') && executed.result
      ? { selectedCloth: executed.result }
      : {}),
    historyId: pending.historyId,
  }
}

const cancelAgentTask = async (userId, confirmId, deps = {}) => {
  const pending = pendingAgentOps.get(confirmId) || await deps.getPendingAgentTaskByConfirmId(userId, confirmId)
  if (!pending || pending.userId !== userId) {
    const error = new Error('待确认任务不存在')
    error.status = 404
    throw error
  }
  pendingAgentOps.delete(confirmId)
  await deps.updateAgentTaskHistory(pending.historyId, {
    status: 'cancelled',
    confirmation_status: 'cancelled',
    result_summary: { cancelled: true, summary: pending.summary },
  })
  return { cancelled: true, historyId: pending.historyId }
}

module.exports = {
  AGENT_CONFIRM_TTL_MS,
  CONFIRMABLE_AGENT_ACTIONS,
  LOW_RISK_ACTIONS,
  __clearPendingAgentOpsForTest: () => pendingAgentOps.clear(),
  buildConfirmationPayload,
  buildPersistedConfirmedResultSummary,
  buildPersistedConfirmationPayload,
  cancelAgentTask,
  confirmAgentTask,
  executeConfirmedAgentTask,
  getPendingAgentTaskByConfirmId: async (userId, confirmId, deps = {}) => {
    const record = await deps.getPendingAgentTaskRecordByConfirmId(userId, confirmId, CONFIRMABLE_AGENT_ACTIONS)
    if (!record) return null
    return rehydratePendingTaskImages(normalizeRecoveredPendingTask(record.row, record.confirmation), deps)
  },
  stageAgentConfirmation,
}
