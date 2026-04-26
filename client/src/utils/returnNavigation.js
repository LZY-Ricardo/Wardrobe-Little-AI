import { useEffect } from 'react'
import { normalizeAgentContext } from './agentContext.js'

const toPositiveId = (value) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

export const resolveReturnObject = (locationState = null, readers = []) => {
  if (!locationState || typeof locationState !== 'object') return null
  const list = Array.isArray(readers) ? readers : []
  for (const reader of list) {
    if (typeof reader !== 'function') continue
    const value = reader(locationState)
    if (value && typeof value === 'object') return value
  }
  return null
}

export const createReturnFocusReader = (...types) => (locationState = null) => {
  const focus = normalizeAgentContext(locationState).focus
  if (!focus?.entity) return null
  if (!types.length || types.includes(focus.type)) return focus.entity
  return null
}

export const resolveReturnEntityId = (locationState = null, readers = []) => {
  const target = resolveReturnObject(locationState, readers)
  if (!target) return 0
  return (
    toPositiveId(target.id) ||
    toPositiveId(target.cloth_id) ||
    toPositiveId(target.suit_id) ||
    0
  )
}

export const buildReturnTargetAttr = (prefix = '', id = 0) => `${String(prefix || '').trim()}-${id}`

export const buildReturnTargetSelector = (prefix = '', id = 0) =>
  `[data-return-target="${buildReturnTargetAttr(prefix, id)}"]`

export const useReturnScroll = ({ prefix = '', id = 0, watch = 0, delay = 120 } = {}) => {
  useEffect(() => {
    const resolvedId = toPositiveId(id)
    if (!prefix || !resolvedId) return undefined

    const timer = window.setTimeout(() => {
      const target = document.querySelector(buildReturnTargetSelector(prefix, resolvedId))
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    }, delay)

    return () => window.clearTimeout(timer)
  }, [delay, id, prefix, watch])
}
