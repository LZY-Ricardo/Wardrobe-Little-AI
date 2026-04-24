const { query } = require('../models/db')
const crypto = require('crypto')
const { executeTool } = require('../utils/toolRegistry')
const {
  getProfileInsight,
  gatherSourceData,
  buildWardrobeAnalytics,
  updateConfirmationPreferences,
} = require('./profileInsights')
const { insertSuit } = require('./suits')
const { createOutfitLog } = require('./outfitLogs')
const { createRecommendationHistory, updateRecommendationAdoption } = require('./recommendations')
const {
  classifyAgentTask,
  summarizeAgentResult,
  buildAgentTaskSummary,
  buildAgentExecutionPreview,
  summarizeAgentHistoryItem,
} = require('./agent.helpers')

const pendingAgentOps = new Map()
const AGENT_CONFIRM_TTL_MS = 5 * 60 * 1000
const makeConfirmId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10)
const LOW_RISK_ACTIONS = new Set(['toggle_favorite'])

const formatResultPayload = ({ taskType, input, result }) => ({
  taskType,
  input,
  result,
  summary: summarizeAgentResult({ taskType, result }),
})

const insertAgentTaskHistory = async (userId, payload = {}) => {
  const now = Date.now()
  const resultSummary = JSON.stringify(payload.result || {})
  const res = await query(
    `INSERT INTO agent_task_history (
      user_id, source_entry, task_type, task_summary, status, requires_confirmation,
      confirmation_status, related_object_type, related_object_id, result_summary, create_time, update_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      payload.sourceEntry || 'agent-page',
      payload.taskType || 'unknown',
      buildAgentTaskSummary(payload.taskSummary || ''),
      payload.status || 'success',
      0,
      'not_required',
      payload.relatedObjectType || '',
      payload.relatedObjectId || null,
      resultSummary,
      now,
      now,
    ]
  )
  return res.insertId
}

const updateAgentTaskHistory = async (historyId, patch = {}) => {
  const fields = []
  const params = []
  ;['status', 'confirmation_status', 'related_object_type', 'related_object_id', 'result_summary'].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) return
    fields.push(`${key} = ?`)
    if (key === 'result_summary') {
      params.push(JSON.stringify(patch[key] || {}))
    } else {
      params.push(patch[key])
    }
  })
  if (!fields.length) return
  fields.push('update_time = ?')
  params.push(Date.now(), historyId)
  await query(`UPDATE agent_task_history SET ${fields.join(', ')} WHERE id = ?`, params)
}

const listAgentTaskHistoryForUser = async (userId, limit = 20) => {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20))
  const rows = await query(
    `SELECT * FROM agent_task_history WHERE user_id = ? ORDER BY create_time DESC LIMIT ?`,
    [userId, safeLimit]
  )
  return Array.isArray(rows)
    ? rows.map((row) => ({
        ...row,
        ...summarizeAgentHistoryItem(row),
        result_summary: (() => {
          try {
            return JSON.parse(row.result_summary || '{}')
          } catch {
            return {}
          }
        })(),
      }))
    : []
}

const buildConfirmationPayload = ({ action, latestResult, suitIndex = 0 }) => {
  if (action === 'toggle_favorite') {
    const selectedCloth = latestResult?.selectedCloth || latestResult?.result?.selectedCloth
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
      executePayload: {
        cloth_id: clothId,
        favorite,
      },
    }
  }

  if (action === 'update_confirmation_preferences') {
    const nextValue = Boolean(latestResult?.nextLowRiskNoConfirm)
    return {
      action,
      summary: `${nextValue ? '开启' : '关闭'}低风险操作免确认`,
      scope: `lowRiskNoConfirm=${nextValue}`,
      risk: '会改变 Agent 执行低风险写操作时是否需要确认。',
      executePayload: {
        lowRiskNoConfirm: nextValue,
      },
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
        logDate: require('../utils/date').getTodayInChina(),
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

const stageAgentConfirmation = async (userId, input, sourceEntry, options = {}) => {
  const confirmation = buildConfirmationPayload(options)
  const confirmId = makeConfirmId()
  const historyId = await insertAgentTaskHistory(userId, {
    sourceEntry,
    taskType: confirmation.action,
    taskSummary: input,
    status: 'pending',
    relatedObjectType: confirmation.action === 'save_suit' ? 'suit' : 'outfit_log',
    result: {
      pending: true,
      confirmation,
    },
  })

  pendingAgentOps.set(confirmId, {
    confirmId,
    userId,
    historyId,
    createdAt: Date.now(),
    ...confirmation,
  })

  return {
    taskType: confirmation.action,
    summary: confirmation.summary,
    status: 'pending',
    requiresConfirmation: true,
    executionPreview: buildAgentExecutionPreview({
      input,
      classification: { taskType: confirmation.action },
      requiresConfirmation: true,
    }),
    confirmation: {
      confirmId,
      scope: confirmation.scope,
      risk: confirmation.risk,
    },
    historyId,
  }
}

const executeConfirmedAgentTask = async (pending) => {
  if (pending.action === 'toggle_favorite') {
    const result = await executeTool('set_cloth_favorite', pending.executePayload, { userId: pending.userId })
    return {
      relatedObjectType: 'cloth',
      relatedObjectId: pending.executePayload.cloth_id,
      result,
    }
  }
  if (pending.action === 'update_confirmation_preferences') {
    const result = await updateConfirmationPreferences(pending.userId, pending.executePayload)
    return {
      relatedObjectType: 'profile_preference',
      relatedObjectId: null,
      result,
    }
  }
  if (pending.action === 'save_suit') {
    const result = await insertSuit(pending.userId, pending.executePayload)
    if (pending.recommendationHistoryId) {
      await updateRecommendationAdoption(pending.userId, pending.recommendationHistoryId, {
        saved_as_suit: 1,
      })
    }
    return {
      relatedObjectType: 'suit',
      relatedObjectId: result?.suit?.suit_id || null,
      result,
    }
  }
  if (pending.action === 'create_outfit_log') {
    const result = await createOutfitLog(pending.userId, pending.executePayload)
    return {
      relatedObjectType: 'outfit_log',
      relatedObjectId: result?.id || null,
      result,
    }
  }
  throw new Error('UNKNOWN_AGENT_CONFIRM_ACTION')
}

const confirmAgentTask = async (userId, confirmId) => {
  const pending = pendingAgentOps.get(confirmId)
  if (!pending || pending.userId !== userId) {
    const error = new Error('确认操作不存在或已失效')
    error.status = 404
    throw error
  }
  if (Date.now() - pending.createdAt > AGENT_CONFIRM_TTL_MS) {
    pendingAgentOps.delete(confirmId)
    await updateAgentTaskHistory(pending.historyId, {
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
  const resultPayload = {
    confirmed: true,
    summary: pending.summary,
    result: executed.result,
  }
  await updateAgentTaskHistory(pending.historyId, {
    status: 'success',
    confirmation_status: 'confirmed',
    related_object_type: executed.relatedObjectType,
    related_object_id: executed.relatedObjectId,
    result_summary: resultPayload,
  })
  return {
    taskType: pending.action,
    status: 'success',
    summary: pending.summary,
    relatedObjectType: executed.relatedObjectType,
    relatedObjectId: executed.relatedObjectId,
    result: executed.result,
    historyId: pending.historyId,
  }
}

const cancelAgentTask = async (userId, confirmId) => {
  const pending = pendingAgentOps.get(confirmId)
  if (!pending || pending.userId !== userId) {
    const error = new Error('待确认任务不存在')
    error.status = 404
    throw error
  }
  pendingAgentOps.delete(confirmId)
  await updateAgentTaskHistory(pending.historyId, {
    status: 'cancelled',
    confirmation_status: 'cancelled',
    result_summary: { cancelled: true, summary: pending.summary },
  })
  return { cancelled: true, historyId: pending.historyId }
}

const executeAgentTask = async (userId, input, sourceEntry = 'agent-page', options = {}) => {
  if (
    options?.action === 'save_suit' ||
    options?.action === 'create_outfit_log' ||
    options?.action === 'toggle_favorite' ||
    options?.action === 'update_confirmation_preferences'
  ) {
    if (LOW_RISK_ACTIONS.has(options.action)) {
      const profile = await getProfileInsight(userId, {})
      if (profile?.confirmationPreferences?.lowRiskNoConfirm) {
        const confirmation = buildConfirmationPayload(options)
        const executed = await executeConfirmedAgentTask({
          ...confirmation,
          userId,
          historyId: await insertAgentTaskHistory(userId, {
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
    return stageAgentConfirmation(userId, input, sourceEntry, options)
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

  const historyId = await insertAgentTaskHistory(userId, {
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
  cancelAgentTask,
  confirmAgentTask,
  executeAgentTask,
  listAgentTaskHistoryForUser,
}
