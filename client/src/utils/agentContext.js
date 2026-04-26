const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

const normalizeNode = (node = null) => {
  if (!isRecord(node)) return null
  const type = String(node.type || '').trim()
  const entity = isRecord(node.entity) ? node.entity : null
  if (!type || !entity) return null
  return { type, entity }
}

const resolveLegacyFocus = (state = {}) => {
  if (isRecord(state.selectedCloth)) return { type: 'cloth', entity: state.selectedCloth }
  if (isRecord(state.selectedSuit)) return { type: 'suit', entity: state.selectedSuit }
  if (isRecord(state.selectedOutfitLog)) return { type: 'outfitLog', entity: state.selectedOutfitLog }
  if (isRecord(state.recommendationHistory)) return { type: 'recommendationHistory', entity: state.recommendationHistory }
  return null
}

const resolveLegacyDraft = (state = {}) => {
  if (isRecord(state.manualSuitDraft)) return { type: 'suit', entity: state.manualSuitDraft }
  if (isRecord(state.manualOutfitLogDraft)) return { type: 'outfitLog', entity: state.manualOutfitLogDraft }
  return null
}

const resolveLegacyInsight = (state = {}) => {
  if (isRecord(state.latestProfile)) return { type: 'profile', entity: state.latestProfile }
  if (isRecord(state.latestAnalytics)) return { type: 'analytics', entity: state.latestAnalytics }
  if (isRecord(state.latestWeather)) return { type: 'weather', entity: state.latestWeather }
  if (isRecord(state.styleProfile)) return { type: 'styleProfile', entity: state.styleProfile }
  return null
}

const mapFocusToLatestTask = (focus = null) => {
  if (!focus?.entity) return null
  if (focus.type === 'cloth') return { selectedCloth: focus.entity }
  if (focus.type === 'suit') return { selectedSuit: focus.entity }
  if (focus.type === 'outfitLog') return { selectedOutfitLog: focus.entity }
  if (focus.type === 'recommendationHistory') return { recommendationHistory: focus.entity }
  return null
}

const mapDraftToLatestTask = (draft = null) => {
  if (!draft?.entity) return null
  if (draft.type === 'suit') return { manualSuitDraft: draft.entity }
  if (draft.type === 'outfitLog') return { manualOutfitLogDraft: draft.entity }
  return null
}

const mapInsightToLatestTask = (insight = null) => {
  if (!insight?.entity) return null
  if (insight.type === 'profile') return { latestProfile: insight.entity }
  if (insight.type === 'analytics') return { latestAnalytics: insight.entity }
  if (insight.type === 'weather') return { latestWeather: insight.entity }
  if (insight.type === 'styleProfile') return { styleProfile: insight.entity }
  return null
}

export const normalizeAgentContext = (locationState = null) => {
  if (!isRecord(locationState)) {
    return {
      latestTask: null,
      focus: null,
      draft: null,
      insight: null,
      attachments: [],
    }
  }

  const raw = isRecord(locationState.agentContext) ? locationState.agentContext : {}
  return {
    latestTask: isRecord(raw.latestTask) ? raw.latestTask : isRecord(locationState.latestResult) ? locationState.latestResult : null,
    focus: normalizeNode(raw.focus) || resolveLegacyFocus(locationState),
    draft: normalizeNode(raw.draft) || resolveLegacyDraft(locationState),
    insight: normalizeNode(raw.insight) || resolveLegacyInsight(locationState),
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments
      : Array.isArray(locationState.prefillImages)
        ? locationState.prefillImages
        : [],
  }
}

export const buildAgentContextState = ({
  presetTask = '',
  latestTask = null,
  focus = null,
  draft = null,
  insight = null,
  attachments = [],
  session = null,
  extras = null,
} = {}) => {
  const state = {}
  if (presetTask) state.presetTask = presetTask
  if (session) state.session = session
  if (isRecord(extras)) Object.assign(state, extras)

  const agentContext = {}
  if (isRecord(latestTask)) agentContext.latestTask = latestTask
  if (normalizeNode(focus)) agentContext.focus = normalizeNode(focus)
  if (normalizeNode(draft)) agentContext.draft = normalizeNode(draft)
  if (normalizeNode(insight)) agentContext.insight = normalizeNode(insight)
  if (Array.isArray(attachments) && attachments.length) agentContext.attachments = attachments

  if (Object.keys(agentContext).length) {
    state.agentContext = agentContext
  }

  return state
}

export const resolveLatestTaskFromAgentState = (locationState = null) => {
  const normalized = normalizeAgentContext(locationState)
  if (normalized.latestTask) return normalized.latestTask
  return mapFocusToLatestTask(normalized.focus) || mapDraftToLatestTask(normalized.draft) || mapInsightToLatestTask(normalized.insight) || null
}

export const resolvePendingImagesFromAgentState = (locationState = null) => {
  const normalized = normalizeAgentContext(locationState)
  return normalized.attachments.filter(
    (item) =>
      item &&
      item.type === 'image' &&
      typeof item.dataUrl === 'string' &&
      item.dataUrl.startsWith('data:image/')
  )
}

export const createFocusReader = (...types) => (locationState = null) => {
  const focus = normalizeAgentContext(locationState).focus
  if (!focus?.entity) return null
  if (!types.length || types.includes(focus.type)) return focus.entity
  return null
}

export const createDraftReader = (...types) => (locationState = null) => {
  const draft = normalizeAgentContext(locationState).draft
  if (!draft?.entity) return null
  if (!types.length || types.includes(draft.type)) return draft.entity
  return null
}

export const createInsightReader = (...types) => (locationState = null) => {
  const insight = normalizeAgentContext(locationState).insight
  if (!insight?.entity) return null
  if (!types.length || types.includes(insight.type)) return insight.entity
  return null
}
