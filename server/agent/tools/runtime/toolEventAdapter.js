const { getToolByName } = require('../registry')

const resolveToolLabel = (toolName = '') => {
  const tool = getToolByName(toolName)
  return String(tool?.uiLabel || toolName || '工具执行').trim()
}

const buildToolStartedEventMeta = ({ toolName = '', at = Date.now() } = {}) => ({
  toolCalls: [
    {
      name: toolName,
      label: resolveToolLabel(toolName),
      status: 'running',
      at,
    },
  ],
  toolResultsSummary: [],
})

const buildToolCompletedEventMeta = ({
  toolName = '',
  ok = true,
  summary = '',
  at = Date.now(),
} = {}) => ({
  toolCalls: [
    {
      name: toolName,
      label: resolveToolLabel(toolName),
      status: ok ? 'success' : 'failed',
      at,
    },
  ],
  toolResultsSummary: [String(summary || '').trim()].filter(Boolean),
})

const mergeToolMeta = (toolMetaList = []) => {
  const flattened = (Array.isArray(toolMetaList) ? toolMetaList : []).filter(Boolean)
  const toolCalls = flattened.flatMap((item) => item.toolCalls || [])
  const toolResultsSummary = flattened.flatMap((item) => item.toolResultsSummary || [])
  if (!toolCalls.length && !toolResultsSummary.length) return null
  return {
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(toolResultsSummary.length ? { toolResultsSummary } : {}),
  }
}

module.exports = {
  buildToolStartedEventMeta,
  buildToolCompletedEventMeta,
  mergeToolMeta,
}
