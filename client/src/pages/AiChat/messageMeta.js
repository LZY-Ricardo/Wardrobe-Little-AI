const clampString = (value, max = 2000) => String(value || '').trim().slice(0, max)

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeJsonValue = (value, depth = 0) => {
  if (value == null) return null
  if (depth > 4) return null
  if (typeof value === 'string') return clampString(value, 4000)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeJsonValue(item, depth + 1))
      .filter((item) => item != null)
      .slice(0, 50)
  }

  if (!isPlainObject(value)) return null

  const entries = Object.entries(value)
    .map(([key, item]) => {
      const normalized = normalizeJsonValue(item, depth + 1)
      if (normalized == null) return null
      return [String(key).trim().slice(0, 120), normalized]
    })
    .filter(Boolean)
    .slice(0, 50)

  return entries.length ? Object.fromEntries(entries) : null
}

const normalizeAttachments = (attachments = []) => {
  if (!Array.isArray(attachments)) return []

  return attachments
    .map((item) => {
      if (!isPlainObject(item)) return null
      const type = clampString(item.type, 32)
      const name = clampString(item.name, 120)
      const mimeType = clampString(item.mimeType, 120)
      const dataUrl = clampString(item.dataUrl, 4_000_000)
      const source = clampString(item.source, 32)
      const variant = clampString(item.variant, 32)
      const objectType = clampString(item.objectType, 32)
      const objectId = Number.parseInt(item.objectId, 10)
      const suitIndex = Number.parseInt(item.suitIndex, 10)
      const suitLabel = clampString(item.suitLabel, 60)
      if (!type || !dataUrl) return null
      return {
        type,
        ...(mimeType ? { mimeType } : {}),
        ...(name ? { name } : {}),
        dataUrl,
        ...(source ? { source } : {}),
        ...(variant ? { variant } : {}),
        ...(objectType ? { objectType } : {}),
        ...(Number.isFinite(objectId) && objectId > 0 ? { objectId } : {}),
        ...(Number.isFinite(suitIndex) && suitIndex >= 0 ? { suitIndex } : {}),
        ...(suitLabel ? { suitLabel } : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

const normalizeTargetPage = (targetPage) => {
  if (!isPlainObject(targetPage)) return null
  const key = clampString(targetPage.key, 60)
  const label = clampString(targetPage.label, 60)
  const to = clampString(targetPage.to, 200)
  const normalized = {
    ...(key ? { key } : {}),
    ...(label ? { label } : {}),
    ...(to ? { to } : {}),
  }
  return Object.keys(normalized).length ? normalized : null
}

const normalizeActionButton = (actionButton) => {
  if (!isPlainObject(actionButton)) return null

  const label = clampString(actionButton.label, 60)
  const to = clampString(actionButton.to, 200)
  if (!label || !to) return null

  const pageKey = clampString(actionButton.pageKey, 60)
  const pageLabel = clampString(actionButton.pageLabel, 60)
  const reason = clampString(actionButton.reason, 200)
  const variant = clampString(actionButton.variant, 24)
  const state = normalizeJsonValue(actionButton.state)

  return {
    label,
    to,
    ...(state ? { state } : {}),
    ...(pageKey ? { pageKey } : {}),
    ...(pageLabel ? { pageLabel } : {}),
    ...(reason ? { reason } : {}),
    ...(variant ? { variant } : {}),
  }
}

const normalizePendingConfirmation = (pendingConfirmation) => {
  if (!isPlainObject(pendingConfirmation)) return null

  const confirmId = clampString(pendingConfirmation.confirmId, 120)
  if (!confirmId) return null

  const summary = clampString(pendingConfirmation.summary, 200)
  const scope = clampString(pendingConfirmation.scope, 200)
  const risk = clampString(pendingConfirmation.risk, 200)
  const actionLabel = clampString(pendingConfirmation.actionLabel, 80)
  const targetPage = normalizeTargetPage(pendingConfirmation.targetPage)
  const previewImages = normalizeAttachments(pendingConfirmation.previewImages)
  const details = normalizeJsonValue(pendingConfirmation.details)

  return {
    confirmId,
    ...(summary ? { summary } : {}),
    ...(scope ? { scope } : {}),
    ...(risk ? { risk } : {}),
    ...(actionLabel ? { actionLabel } : {}),
    ...(targetPage ? { targetPage } : {}),
    ...(previewImages.length ? { previewImages } : {}),
    ...(details ? { details } : {}),
  }
}

const normalizeToolCalls = (toolCalls = []) => {
  if (!Array.isArray(toolCalls)) return []

  return toolCalls
    .map((item) => {
      if (!isPlainObject(item)) return null

      const name = clampString(item.name, 120)
      const label = clampString(item.label, 120)
      const status = clampString(item.status, 32)
      const at = Number(item.at)

      if (!name && !label) return null

      return {
        ...(name ? { name } : {}),
        ...(label ? { label } : {}),
        ...(status ? { status } : {}),
        ...(Number.isFinite(at) ? { at } : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 20)
}

const normalizeToolResultsSummary = (toolResultsSummary = []) => {
  if (!Array.isArray(toolResultsSummary)) return []
  return toolResultsSummary.map((item) => clampString(item, 300)).filter(Boolean).slice(0, 20)
}

export const normalizeMessageMeta = (meta) => {
  if (!isPlainObject(meta)) return null

  const attachments = normalizeAttachments(meta.attachments)
  const reasoningContent = clampString(meta.reasoningContent, 12_000)
  const actionButton = normalizeActionButton(meta.actionButton)
  const pendingConfirmation = normalizePendingConfirmation(meta.pendingConfirmation)
  const toolCalls = normalizeToolCalls(meta.toolCalls)
  const toolResultsSummary = normalizeToolResultsSummary(meta.toolResultsSummary)
  const latestTask = normalizeJsonValue(meta.latestTask)

  const normalized = {
    ...(attachments.length ? { attachments } : {}),
    ...(reasoningContent ? { reasoningContent } : {}),
    ...(actionButton ? { actionButton } : {}),
    ...(pendingConfirmation ? { pendingConfirmation } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(toolResultsSummary.length ? { toolResultsSummary } : {}),
    ...(latestTask ? { latestTask } : {}),
  }

  return Object.keys(normalized).length ? normalized : null
}
