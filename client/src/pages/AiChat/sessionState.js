import { normalizeRestoredMessages } from './viewModels.js'

export const resolveInitialLatestTask = (locationState = null) => {
  if (!locationState || typeof locationState !== 'object') return null

  if (locationState.latestResult && typeof locationState.latestResult === 'object') {
    return locationState.latestResult
  }

  if (locationState.selectedCloth) {
    return {
      selectedCloth: locationState.selectedCloth,
    }
  }

  if (locationState.selectedSuit) {
    return {
      selectedSuit: locationState.selectedSuit,
    }
  }

  if (locationState.selectedOutfitLog) {
    return {
      selectedOutfitLog: locationState.selectedOutfitLog,
    }
  }

  if (locationState.latestProfile) {
    return {
      latestProfile: locationState.latestProfile,
    }
  }

  if (locationState.latestAnalytics) {
    return {
      latestAnalytics: locationState.latestAnalytics,
    }
  }

  if (locationState.latestWeather) {
    return {
      latestWeather: locationState.latestWeather,
    }
  }

  if (locationState.styleProfile) {
    return {
      styleProfile: locationState.styleProfile,
    }
  }

  if (locationState.recommendationHistory) {
    return {
      recommendationHistory: locationState.recommendationHistory,
    }
  }

  if (locationState.manualSuitDraft) {
    return {
      manualSuitDraft: locationState.manualSuitDraft,
    }
  }

  if (locationState.manualOutfitLogDraft) {
    return {
      manualOutfitLogDraft: locationState.manualOutfitLogDraft,
    }
  }

  return null
}

export const resolveInitialPendingImages = (locationState = null) => {
  if (!locationState || typeof locationState !== 'object') return []
  const images = Array.isArray(locationState.prefillImages) ? locationState.prefillImages : []
  return images.filter(
    (item) =>
      item &&
      item.type === 'image' &&
      typeof item.dataUrl === 'string' &&
      item.dataUrl.startsWith('data:image/')
  )
}

export const resolveLoadedSessionState = ({
  payload = {},
  fallbackSession = null,
  initialLatestTask = null,
} = {}) => {
  const restoredMessages = normalizeRestoredMessages(payload?.recent_messages)
  const restoredPending = [...restoredMessages].reverse().find((message) => message.pendingConfirmation)?.pendingConfirmation || null

  return {
    session: payload?.session || fallbackSession,
    messages: restoredMessages,
    pendingConfirmation: restoredPending,
    latestTask: restoredPending ? null : initialLatestTask,
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
