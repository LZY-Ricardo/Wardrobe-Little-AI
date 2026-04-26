import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useAgentEntryStore } from '@/store'

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

export default function useAgentPageEntry(entry = null) {
  const location = useLocation()
  const setCurrentEntry = useAgentEntryStore((s) => s.setCurrentEntry)
  const clearCurrentEntry = useAgentEntryStore((s) => s.clearCurrentEntry)

  const owner = `${location.pathname}${location.search}`
  const normalizedEntry = useMemo(() => {
    if (!isRecord(entry)) return null
    const presetTask = String(entry.presetTask || '').trim()
    const state = isRecord(entry.state) ? entry.state : null
    const enabled = entry.enabled !== false && (presetTask || state)
    if (!enabled) return null
    return {
      owner,
      presetTask,
      state,
    }
  }, [entry, owner])

  useEffect(() => {
    if (normalizedEntry) {
      setCurrentEntry(normalizedEntry)
      return () => clearCurrentEntry(owner)
    }

    clearCurrentEntry(owner)
    return undefined
  }, [clearCurrentEntry, normalizedEntry, owner, setCurrentEntry])
}
