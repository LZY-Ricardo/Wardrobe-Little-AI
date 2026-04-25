const { listTools, getToolByName } = require('../agent/tools/registry')
const { resolveToolHandler } = require('../agent/tools/registry/handlerResolver')

const TOOL_DEFINITIONS = listTools().map(({ name, description, parameters, dangerous }) => ({
  ...(dangerous ? { dangerous: true } : {}),
  name,
  description,
  parameters,
}))
const TOOL_NAME_SET = new Set(TOOL_DEFINITIONS.map((tool) => tool.name))

const executeTool = async (name, args, ctx) => {
  if (!TOOL_NAME_SET.has(name)) {
    return { error: 'UNKNOWN_TOOL' }
  }

  const userId = ctx?.userId
  if (!userId) {
    return { error: 'UNAUTHORIZED' }
  }

  const safeArgs = args && typeof args === 'object' ? args : {}
  const tool = getToolByName(name)
  const handler = resolveToolHandler(tool)
  return handler ? handler(userId, safeArgs, ctx) : { error: 'UNSUPPORTED_TOOL' }
}

module.exports = {
  TOOL_DEFINITIONS,
  getToolDefinition: (name) => {
    const tool = getToolByName(name)
    if (!tool) return null
    const { description, dangerous, name: toolName, parameters } = tool
    return {
      ...(dangerous ? { dangerous: true } : {}),
      name: toolName,
      description,
      parameters,
    }
  },
  executeTool,
}
