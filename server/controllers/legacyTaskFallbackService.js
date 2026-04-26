const { executeTool } = require('../utils/toolRegistry')
const { resolveFocusFromLatestTask, resolveInsightFromLatestTask } = require('../agent/context/agentContextProtocol')
const {
  getProfileInsight,
  gatherSourceData,
  buildWardrobeAnalytics,
} = require('./profileInsights')
const { createRecommendationHistory } = require('./recommendations')
const {
  classifyAgentTask,
  summarizeAgentResult,
  buildAgentExecutionPreview,
} = require('./agent.helpers')
const {
  LOW_RISK_ACTIONS,
  buildConfirmationPayload,
  executeConfirmedAgentTask,
  stageAgentConfirmation,
} = require('./confirmationService')
const { isProbablyBase64Image } = require('../utils/validate')

const formatResultPayload = ({ taskType, input, result }) => ({
  taskType,
  input,
  result,
  summary: summarizeAgentResult({ taskType, result }),
})

const pickRuntimeImageAttachments = (runtimeContext = {}) =>
  (Array.isArray(runtimeContext?.multimodal?.attachments) ? runtimeContext.multimodal.attachments : [])
    .map((item) => String(item?.dataUrl || '').trim())
    .filter((value) => isProbablyBase64Image(value))

const normalizeDraftClothWithRuntimeImage = (draftCloth = {}, imageDataUrl = '') => {
  const next = { ...(draftCloth && typeof draftCloth === 'object' ? draftCloth : {}) }
  const currentImage = String(next.image || '').trim()

  if (isProbablyBase64Image(currentImage)) return next
  if (imageDataUrl) {
    next.image = imageDataUrl
    return next
  }

  delete next.image
  return next
}

const resolveSelectedCloth = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  if (focus?.type === 'cloth') return focus.entity
  if (latestTask?.selectedCloth) return latestTask.selectedCloth
  if (latestTask?.result?.selectedCloth) return latestTask.result.selectedCloth
  if (latestTask?.result && Number.parseInt(latestTask.result?.cloth_id, 10) > 0) return latestTask.result
  return null
}

const resolveSelectedSuit = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  return focus?.type === 'suit' ? focus.entity : latestTask?.selectedSuit || latestTask?.result?.selectedSuit || null
}

const resolveSelectedOutfitLog = (latestTask = null) => {
  const focus = resolveFocusFromLatestTask(latestTask)
  return focus?.type === 'outfitLog' ? focus.entity : latestTask?.selectedOutfitLog || latestTask?.result?.selectedOutfitLog || null
}

const resolveWriteActionOptions = (input, latestTask) => {
  const text = String(input || '')
  const normalized = text.replace(/\s+/g, '')

  const normalizedSex = (() => {
    if (!normalized.includes('性别')) return ''
    if (['woman', 'female', '女'].some((token) => normalized.toLowerCase().includes(token) || normalized.includes(token))) {
      return 'woman'
    }
    if (['man', 'male', '男'].some((token) => normalized.toLowerCase().includes(token) || normalized.includes(token))) {
      return 'man'
    }
    return ''
  })()

  if (
    normalizedSex &&
    (normalized.includes('改成') ||
      normalized.includes('改为') ||
      normalized.includes('设为') ||
      normalized.includes('设置为') ||
      normalized.includes('切换') ||
      normalized.includes('修改'))
  ) {
    return {
      action: 'update_user_sex',
      latestResult: {
        latestProfile: resolveInsightFromLatestTask(latestTask)?.type === 'profile'
          ? resolveInsightFromLatestTask(latestTask).entity
          : latestTask?.latestProfile || latestTask?.result?.latestProfile || null,
        sex: normalizedSex,
      },
    }
  }

  if (
    normalized.includes('低风险') &&
    normalized.includes('免确认') &&
    (normalized.includes('开启') || normalized.includes('打开') || normalized.includes('关闭') || normalized.includes('关掉'))
  ) {
    return {
      action: 'update_confirmation_preferences',
      latestResult: {
        nextLowRiskNoConfirm: normalized.includes('开启') || normalized.includes('打开'),
      },
    }
  }

  const selectedCloth = resolveSelectedCloth(latestTask)
  const selectedSuit = resolveSelectedSuit(latestTask)
  const selectedOutfitLog = resolveSelectedOutfitLog(latestTask)

  if (selectedCloth) {
    const clothDetailIntent =
      (normalized.includes('查看') ||
        normalized.includes('看看') ||
        normalized.includes('显示') ||
        normalized.includes('展示') ||
        normalized.includes('详情') ||
        normalized.includes('具体信息') ||
        normalized.includes('信息')) &&
      (normalized.includes('这件') ||
        normalized.includes('当前') ||
        normalized.includes('这个') ||
        normalized.includes('刚刚') ||
        normalized.includes('鞋子') ||
        normalized.includes('衣服') ||
        normalized.includes('衣物'))

    if (clothDetailIntent) {
      return {
        action: 'view_cloth_details',
        latestResult: {
          selectedCloth,
        },
      }
    }

    const updateRules = [
      { field: 'color', labels: ['颜色', '色', '配色'] },
      { field: 'style', labels: ['风格', '款式'] },
      { field: 'season', labels: ['季节', '适合季节', '适用季节'] },
      { field: 'name', labels: ['名字', '名称', '名'] },
      { field: 'material', labels: ['材质', '面料'] },
      { field: 'type', labels: ['类型', '类别'] },
    ]

    const captureUpdatedValue = (labels = []) => {
      for (const label of labels) {
        const patterns = [
          new RegExp(`${label}(?:改成|改为|改做|换成|换为|设为|设置为)([^，。！？,.!？；;]+)`),
          new RegExp(`把${label}(?:改成|改为|改做|换成|换为|设为|设置为)([^，。！？,.!？；;]+)`),
          new RegExp(`${label}是([^，。！？,.!？；;]+)`),
        ]
        for (const pattern of patterns) {
          const matched = normalized.match(pattern)
          const value = String(matched?.[1] || '').trim()
          if (value) return value
        }
      }
      return ''
    }

    const patch = {}
    for (const rule of updateRules) {
      const value = captureUpdatedValue(rule.labels)
      if (value) {
        patch[rule.field] = value
        break
      }
    }

    if (
      Object.keys(patch).length &&
      (normalized.includes('这件') ||
        normalized.includes('当前') ||
        normalized.includes('这个') ||
        normalized.includes('衣服') ||
        normalized.includes('衣物'))
    ) {
      return {
        action: 'update_cloth_fields',
        latestResult: {
          selectedCloth,
          patch,
        },
      }
    }
  }

  if (selectedSuit) {
    const suitDetailIntent =
      (normalized.includes('查看') ||
        normalized.includes('看看') ||
        normalized.includes('显示') ||
        normalized.includes('展示') ||
        normalized.includes('详情') ||
        normalized.includes('具体信息') ||
        normalized.includes('信息')) &&
      (normalized.includes('这套') ||
        normalized.includes('当前') ||
        normalized.includes('这个') ||
        normalized.includes('套装') ||
        normalized.includes('搭配'))

    if (suitDetailIntent) {
      return {
        action: 'view_suit_details',
        latestResult: {
          selectedSuit,
        },
      }
    }
  }

  if (selectedOutfitLog) {
    const outfitLogDetailIntent =
      (normalized.includes('查看') ||
        normalized.includes('看看') ||
        normalized.includes('显示') ||
        normalized.includes('展示') ||
        normalized.includes('详情') ||
        normalized.includes('具体信息') ||
        normalized.includes('信息')) &&
      (normalized.includes('这条') ||
        normalized.includes('当前') ||
        normalized.includes('这个') ||
        normalized.includes('记录') ||
        normalized.includes('穿搭'))

    if (outfitLogDetailIntent) {
      return {
        action: 'view_outfit_log_details',
        latestResult: {
          selectedOutfitLog,
        },
      }
    }
  }

  if (
    selectedCloth &&
    (normalized.includes('删除') || normalized.includes('删掉') || normalized.includes('删了') || normalized.includes('移除')) &&
    (normalized.includes('这件') || normalized.includes('当前') || normalized.includes('这个') || normalized.includes('衣服') || normalized.includes('衣物'))
  ) {
    return {
      action: 'delete_cloth',
      latestResult: { selectedCloth },
    }
  }

  if (
    selectedSuit &&
    (normalized.includes('删除') || normalized.includes('删掉') || normalized.includes('删了') || normalized.includes('移除')) &&
    (normalized.includes('这套') || normalized.includes('当前') || normalized.includes('这个') || normalized.includes('套装') || normalized.includes('搭配'))
  ) {
    return {
      action: 'delete_suit',
      latestResult: { selectedSuit },
    }
  }

  if (
    selectedOutfitLog &&
    (normalized.includes('删除') || normalized.includes('删掉') || normalized.includes('删了') || normalized.includes('移除')) &&
    (normalized.includes('这条') ||
      normalized.includes('当前') ||
      normalized.includes('这个') ||
      normalized.includes('记录') ||
      normalized.includes('穿搭'))
  ) {
    return {
      action: 'delete_outfit_log',
      latestResult: { selectedOutfitLog },
    }
  }

  if (
    selectedCloth &&
    (normalized.includes('收藏') || normalized.includes('取消收藏')) &&
    (normalized.includes('这件') || normalized.includes('当前') || normalized.includes('这个'))
  ) {
    return {
      action: 'toggle_favorite',
      latestResult: { selectedCloth },
    }
  }

  if (!latestTask) return null

  if (text.includes('保存') && text.includes('套装')) {
    return {
      action: 'save_suit',
      latestResult: latestTask,
      suitIndex: 0,
    }
  }

  if ((text.includes('记录') || text.includes('加入') || text.includes('记成') || text.includes('记为')) && text.includes('穿搭')) {
    return {
      action: 'create_outfit_log',
      latestResult: latestTask,
      suitIndex: 0,
    }
  }

  return null
}

const mapToolIntentToTaskOptions = (toolName = '', toolArgs = {}, runtimeContext = {}) => {
  const args = toolArgs && typeof toolArgs === 'object' ? toolArgs : {}
  const latestTask = runtimeContext?.latestTask || null
  const attachmentImages = pickRuntimeImageAttachments(runtimeContext)

  if (toolName === 'create_cloth') {
    return {
      action: 'create_cloth',
      latestResult: {
        draftCloth: normalizeDraftClothWithRuntimeImage(args, attachmentImages[0] || ''),
      },
    }
  }
  if (toolName === 'create_clothes_batch') {
    return {
      action: 'create_clothes_batch',
      latestResult: {
        draftClothes: (Array.isArray(args.items) ? args.items : []).map((item, index) =>
          normalizeDraftClothWithRuntimeImage(item, attachmentImages[index] || '')
        ),
      },
    }
  }
  if (toolName === 'update_cloth_fields') {
    const { cloth_id, ...patch } = args
    return {
      action: 'update_cloth_fields',
      latestResult: {
        selectedCloth: { cloth_id, name: args.name || '' },
        patch,
      },
    }
  }
  if (toolName === 'delete_cloth') {
    return { action: 'delete_cloth', latestResult: { selectedCloth: { cloth_id: args.cloth_id, name: args.name || '' } } }
  }
  if (toolName === 'delete_suit') {
    return { action: 'delete_suit', latestResult: { selectedSuit: { suit_id: args.suit_id, name: args.name || '' } } }
  }
  if (toolName === 'delete_outfit_log') {
    return {
      action: 'delete_outfit_log',
      latestResult: { selectedOutfitLog: { id: args.outfit_log_id, log_date: args.log_date || '' } },
    }
  }
  if (toolName === 'update_user_sex') {
    return { action: 'update_user_sex', latestResult: { sex: args.sex } }
  }
  if (toolName === 'update_confirmation_preferences') {
    return { action: 'update_confirmation_preferences', latestResult: { nextLowRiskNoConfirm: Boolean(args.lowRiskNoConfirm) } }
  }
  if (toolName === 'save_suit') {
    if (Array.isArray(args.items) && args.items.length) {
      return {
        action: 'save_suit',
        latestResult: {
          manualSuitDraft: {
            name: args.name || '',
            scene: args.scene || '',
            description: args.description || '',
            source: args.source || 'agent',
            items: args.items,
          },
        },
      }
    }
    return { action: 'save_suit', latestResult: latestTask, suitIndex: Number.isFinite(args.suitIndex) ? args.suitIndex : 0 }
  }
  if (toolName === 'create_outfit_log') {
    if (Array.isArray(args.items) && args.items.length) {
      return {
        action: 'create_outfit_log',
        latestResult: {
          manualOutfitLogDraft: {
            recommendationId: args.recommendationId || null,
            suitId: args.suitId || null,
            logDate: args.logDate || '',
            scene: args.scene || '',
            weatherSummary: args.weatherSummary || '',
            satisfaction: args.satisfaction || 0,
            source: args.source || 'agent',
            note: args.note || '',
            items: args.items,
          },
        },
      }
    }
    return {
      action: 'create_outfit_log',
      latestResult: latestTask,
      suitIndex: Number.isFinite(args.suitIndex) ? args.suitIndex : 0,
    }
  }
  if (toolName === 'set_cloth_favorite') {
    const favorite = Boolean(args.favorite)
    return {
      action: 'toggle_favorite',
      latestResult: {
        selectedCloth: {
          cloth_id: args.cloth_id,
          name: args.name || '',
          favorite: !favorite,
        },
      },
    }
  }
  return null
}

const executeLegacyAgentTask = async (userId, input, sourceEntry = 'agent-page', options = {}, deps = {}) => {
  const historyRepo = deps.historyRepo || {}

  if (options?.action === 'view_cloth_details') {
    const selectedCloth = resolveSelectedCloth(options?.latestResult)
    const clothId = Number.parseInt(selectedCloth?.cloth_id, 10)
    if (!clothId) {
      const error = new Error('当前没有可查看的衣物对象')
      error.status = 400
      throw error
    }

    const result = await executeTool('get_cloth_detail', { cloth_id: clothId }, { userId })
    const payload = formatResultPayload({
      taskType: 'cloth_detail',
      input,
      result: { selectedCloth: result },
    })
    payload.executionPreview = buildAgentExecutionPreview({
      input,
      classification: { taskType: 'cloth_detail' },
      requiresConfirmation: false,
    })

    const historyId = await historyRepo.insertAgentTaskHistory(userId, {
      sourceEntry,
      taskType: 'cloth_detail',
      taskSummary: input,
      status: 'success',
      relatedObjectType: 'cloth',
      relatedObjectId: clothId,
      result: payload,
    })

    return {
      ...payload,
      historyId,
      classification: { taskType: 'cloth_detail', scene: '', favoriteOnly: false },
    }
  }

  if (options?.action === 'view_suit_details') {
    const selectedSuit = resolveSelectedSuit(options?.latestResult)
    const suitId = Number.parseInt(selectedSuit?.suit_id, 10)
    if (!suitId) {
      const error = new Error('当前没有可查看的套装对象')
      error.status = 400
      throw error
    }

    const result = await executeTool('get_suit_detail', { suit_id: suitId }, { userId })
    const payload = formatResultPayload({
      taskType: 'suit_detail',
      input,
      result: { selectedSuit: result },
    })
    payload.executionPreview = buildAgentExecutionPreview({
      input,
      classification: { taskType: 'suit_detail' },
      requiresConfirmation: false,
    })

    const historyId = await historyRepo.insertAgentTaskHistory(userId, {
      sourceEntry,
      taskType: 'suit_detail',
      taskSummary: input,
      status: 'success',
      relatedObjectType: 'suit',
      relatedObjectId: suitId,
      result: payload,
    })

    return {
      ...payload,
      historyId,
      classification: { taskType: 'suit_detail', scene: '', favoriteOnly: false },
    }
  }

  if (options?.action === 'view_outfit_log_details') {
    const selectedOutfitLog = resolveSelectedOutfitLog(options?.latestResult)
    const outfitLogId = Number.parseInt(selectedOutfitLog?.id, 10)
    if (!outfitLogId) {
      const error = new Error('当前没有可查看的穿搭记录对象')
      error.status = 400
      throw error
    }

    const result = await executeTool('get_outfit_log_detail', { outfit_log_id: outfitLogId }, { userId })
    const payload = formatResultPayload({
      taskType: 'outfit_log_detail',
      input,
      result: { selectedOutfitLog: result },
    })
    payload.executionPreview = buildAgentExecutionPreview({
      input,
      classification: { taskType: 'outfit_log_detail' },
      requiresConfirmation: false,
    })

    const historyId = await historyRepo.insertAgentTaskHistory(userId, {
      sourceEntry,
      taskType: 'outfit_log_detail',
      taskSummary: input,
      status: 'success',
      relatedObjectType: 'outfit_log',
      relatedObjectId: outfitLogId,
      result: payload,
    })

    return {
      ...payload,
      historyId,
      classification: { taskType: 'outfit_log_detail', scene: '', favoriteOnly: false },
    }
  }

  if (
    options?.action === 'update_user_sex' ||
    options?.action === 'delete_outfit_log' ||
    options?.action === 'delete_suit' ||
    options?.action === 'delete_cloth' ||
    options?.action === 'update_cloth_fields' ||
    options?.action === 'save_suit' ||
    options?.action === 'create_outfit_log' ||
    options?.action === 'toggle_favorite' ||
    options?.action === 'update_confirmation_preferences' ||
    options?.action === 'create_cloth' ||
    options?.action === 'create_clothes_batch'
  ) {
    if (LOW_RISK_ACTIONS.has(options.action)) {
      const profile = await getProfileInsight(userId, {})
      if (profile?.confirmationPreferences?.lowRiskNoConfirm) {
        const confirmation = buildConfirmationPayload(options)
        const executed = await executeConfirmedAgentTask({
          ...confirmation,
          userId,
          historyId: await historyRepo.insertAgentTaskHistory(userId, {
            sourceEntry,
            taskType: confirmation.action,
            taskSummary: input,
            status: 'success',
            relatedObjectType: confirmation.action === 'toggle_favorite' ? 'cloth' : 'unknown',
            result: {
              autoExecuted: true,
              summary: confirmation.summary,
            },
          }),
        })
        return {
          taskType: confirmation.action,
          status: 'success',
          requiresConfirmation: false,
          summary: confirmation.summary,
          executionPreview: buildAgentExecutionPreview({
            input,
            classification: { taskType: confirmation.action },
            requiresConfirmation: false,
          }),
          relatedObjectType: executed.relatedObjectType,
          relatedObjectId: executed.relatedObjectId,
          result: executed.result,
        }
      }
    }

    const staged = await stageAgentConfirmation(userId, input, sourceEntry, options, {
      insertAgentTaskHistory: historyRepo.insertAgentTaskHistory,
    })
    return {
      ...staged,
      executionPreview: buildAgentExecutionPreview({
        input,
        classification: { taskType: staged.taskType },
        requiresConfirmation: true,
      }),
    }
  }

  const classification = classifyAgentTask(input)
  let result
  let relatedObjectType = ''

  if (classification.taskType === 'closet_query') {
    result = await executeTool('list_clothes', { favoriteOnly: classification.favoriteOnly, limit: 20 }, { userId })
    relatedObjectType = 'clothes'
  } else if (classification.taskType === 'recommendation') {
    const scene = classification.scene || '通勤'
    result = await executeTool('generate_scene_suits', { scene, limit: 3 }, { userId })
    if (!result?.error && Array.isArray(result?.suits) && result.suits.length) {
      const savedRecommendation = await createRecommendationHistory(userId, {
        recommendationType: 'scene',
        scene,
        triggerSource: 'agent',
        suits: result.suits,
      })
      result = {
        ...result,
        recommendationHistoryId: savedRecommendation?.id || null,
      }
    }
    relatedObjectType = 'recommendation'
  } else if (classification.taskType === 'profile') {
    result = await getProfileInsight(userId, {})
    relatedObjectType = 'profile'
  } else if (classification.taskType === 'analytics') {
    const sourceData = await gatherSourceData(userId)
    result = buildWardrobeAnalytics(sourceData)
    relatedObjectType = 'analytics'
  } else {
    result = {
      message: '当前只支持衣橱查询、场景推荐、偏好画像和衣橱分析类任务。',
    }
  }

  const payload = formatResultPayload({
    taskType: classification.taskType,
    input,
    result,
  })
  payload.executionPreview = buildAgentExecutionPreview({
    input,
    classification,
    requiresConfirmation: false,
  })

  const historyId = await historyRepo.insertAgentTaskHistory(userId, {
    sourceEntry,
    taskType: classification.taskType,
    taskSummary: input,
    status: 'success',
    relatedObjectType,
    result: payload,
  })

  return {
    ...payload,
    historyId,
    classification,
  }
}

module.exports = {
  executeLegacyAgentTask,
  formatResultPayload,
  mapToolIntentToTaskOptions,
  resolveWriteActionOptions,
}
