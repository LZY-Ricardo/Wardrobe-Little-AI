const { TOOL_CATALOG } = require('./catalog')
const { isToolVisibleForLlm } = require('../policies/toolVisibilityPolicy')

const TOOL_MAP = new Map(TOOL_CATALOG.map((tool) => [tool.name, tool]))

const listTools = () => TOOL_CATALOG.slice()

const getToolByName = (name) => TOOL_MAP.get(String(name || '').trim()) || null

const listToolsForLlm = (context = {}) => {
  return TOOL_CATALOG.filter((tool) => isToolVisibleForLlm(tool, context))
}

module.exports = {
  listTools,
  getToolByName,
  listToolsForLlm,
}
