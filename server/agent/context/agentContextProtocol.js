const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeNode = (node = null) => {
  if (!isRecord(node)) return null
  const type = String(node.type || '').trim()
  const entity = isRecord(node.entity) ? node.entity : null
  if (!type || !entity) return null
  return { type, entity }
}

const resolveFocusFromLatestTask = (latestTask = null) => {
  if (!isRecord(latestTask)) return null
  const raw = isRecord(latestTask.agentContext) ? latestTask.agentContext : {}
  const normalized = normalizeNode(raw.focus)
  if (normalized) return normalized
  if (isRecord(latestTask.selectedCloth)) return { type: 'cloth', entity: latestTask.selectedCloth }
  if (isRecord(latestTask.result?.selectedCloth)) return { type: 'cloth', entity: latestTask.result.selectedCloth }
  if (isRecord(latestTask.result) && Number.parseInt(latestTask.result?.cloth_id, 10) > 0) return { type: 'cloth', entity: latestTask.result }
  if (isRecord(latestTask.selectedSuit)) return { type: 'suit', entity: latestTask.selectedSuit }
  if (isRecord(latestTask.result?.selectedSuit)) return { type: 'suit', entity: latestTask.result.selectedSuit }
  if (isRecord(latestTask.result?.suit)) return { type: 'suit', entity: latestTask.result.suit }
  if (isRecord(latestTask.selectedOutfitLog)) return { type: 'outfitLog', entity: latestTask.selectedOutfitLog }
  if (isRecord(latestTask.result?.selectedOutfitLog)) return { type: 'outfitLog', entity: latestTask.result.selectedOutfitLog }
  if (isRecord(latestTask.recommendationHistory)) return { type: 'recommendationHistory', entity: latestTask.recommendationHistory }
  if (isRecord(latestTask.result?.recommendationHistory)) return { type: 'recommendationHistory', entity: latestTask.result.recommendationHistory }
  return null
}

const resolveDraftFromLatestTask = (latestTask = null) => {
  if (!isRecord(latestTask)) return null
  const raw = isRecord(latestTask.agentContext) ? latestTask.agentContext : {}
  const normalized = normalizeNode(raw.draft)
  if (normalized) return normalized
  if (isRecord(latestTask.manualSuitDraft)) return { type: 'suit', entity: latestTask.manualSuitDraft }
  if (isRecord(latestTask.result?.manualSuitDraft)) return { type: 'suit', entity: latestTask.result.manualSuitDraft }
  if (isRecord(latestTask.manualOutfitLogDraft)) return { type: 'outfitLog', entity: latestTask.manualOutfitLogDraft }
  if (isRecord(latestTask.result?.manualOutfitLogDraft)) return { type: 'outfitLog', entity: latestTask.result.manualOutfitLogDraft }
  return null
}

const resolveInsightFromLatestTask = (latestTask = null) => {
  if (!isRecord(latestTask)) return null
  const raw = isRecord(latestTask.agentContext) ? latestTask.agentContext : {}
  const normalized = normalizeNode(raw.insight)
  if (normalized) return normalized
  if (isRecord(latestTask.latestProfile)) return { type: 'profile', entity: latestTask.latestProfile }
  if (isRecord(latestTask.result?.latestProfile)) return { type: 'profile', entity: latestTask.result.latestProfile }
  if (isRecord(latestTask.latestAnalytics)) return { type: 'analytics', entity: latestTask.latestAnalytics }
  if (isRecord(latestTask.result?.latestAnalytics)) return { type: 'analytics', entity: latestTask.result.latestAnalytics }
  if (isRecord(latestTask.latestWeather)) return { type: 'weather', entity: latestTask.latestWeather }
  if (isRecord(latestTask.result?.latestWeather)) return { type: 'weather', entity: latestTask.result.latestWeather }
  if (isRecord(latestTask.styleProfile)) return { type: 'styleProfile', entity: latestTask.styleProfile }
  if (isRecord(latestTask.result?.styleProfile)) return { type: 'styleProfile', entity: latestTask.result.styleProfile }
  return null
}

const resolveAttachmentsFromLatestTask = (latestTask = null) => {
  if (!isRecord(latestTask)) return []
  const raw = isRecord(latestTask.agentContext) ? latestTask.agentContext : {}
  return Array.isArray(raw.attachments) ? raw.attachments : []
}

const buildAgentContextState = ({
  latestTask = null,
  focus = null,
  draft = null,
  insight = null,
  attachments = [],
  extras = null,
} = {}) => {
  const state = isRecord(extras) ? { ...extras } : {}
  const agentContext = {}
  if (isRecord(latestTask)) agentContext.latestTask = latestTask
  if (normalizeNode(focus)) agentContext.focus = normalizeNode(focus)
  if (normalizeNode(draft)) agentContext.draft = normalizeNode(draft)
  if (normalizeNode(insight)) agentContext.insight = normalizeNode(insight)
  if (Array.isArray(attachments) && attachments.length) agentContext.attachments = attachments
  if (Object.keys(agentContext).length) state.agentContext = agentContext
  return state
}

module.exports = {
  buildAgentContextState,
  resolveAttachmentsFromLatestTask,
  resolveDraftFromLatestTask,
  resolveFocusFromLatestTask,
  resolveInsightFromLatestTask,
}
