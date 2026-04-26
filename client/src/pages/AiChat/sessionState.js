import { normalizeRestoredMessages } from './viewModels.js'
import {
  resolveLatestTaskFromAgentState,
  resolvePendingImagesFromAgentState,
} from '../../utils/agentContext.js'

export const shouldRestorePrefillInput = ({
  prefillText = '',
  status = '',
  input = '',
  displayedMessageCount = 0,
} = {}) => {
  if (!String(prefillText || '').trim()) return false
  if (status !== 'success') return false
  if (String(input || '').trim()) return false
  if (Number(displayedMessageCount || 0) > 0) return false
  return true
}

export const resolveSessionBootstrapState = ({
  sessionId = Number.NaN,
  hasSessionIdQuery = false,
  initialLatestTask = null,
} = {}) => {
  if (Number.isFinite(sessionId)) {
    return { mode: 'existing-session' }
  }

  if (hasSessionIdQuery) {
    return {
      mode: 'invalid-session',
      error: '会话不存在',
    }
  }

  return {
    mode: 'blank-session',
    session: null,
    messages: [],
    pendingConfirmation: null,
    latestTask: initialLatestTask,
  }
}

export const resolveInitialLatestTask = (locationState = null) => {
  return resolveLatestTaskFromAgentState(locationState)
}

export const resolveInitialPendingImages = (locationState = null) => resolvePendingImagesFromAgentState(locationState)

export const resolveLoadedSessionState = ({
  payload = {},
  fallbackSession = null,
  initialLatestTask = null,
} = {}) => {
  const restoredMessages = normalizeRestoredMessages(payload?.recent_messages)
  const restoredPending = [...restoredMessages].reverse().find((message) => message.pendingConfirmation)?.pendingConfirmation || null
  const restoredLatestTask = [...restoredMessages].reverse().find((message) => message.latestTask)?.latestTask || null

  return {
    session: payload?.session || fallbackSession,
    messages: restoredMessages,
    pendingConfirmation: restoredPending,
    latestTask: restoredPending ? null : (restoredLatestTask || initialLatestTask),
  }
}

export const resolveConfirmedSessionState = ({
  payload = {},
  fallbackSession = null,
} = {}) => {
  const restored = payload?.restored || {}
  return {
    session: restored.session || fallbackSession,
    messages: normalizeRestoredMessages(restored.recent_messages),
    latestTask: payload?.latest_task || null,
    pendingConfirmation: null,
  }
}
