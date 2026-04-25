const buildLlmToolDefinitions = (tools = []) =>
  (Array.isArray(tools) ? tools : []).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

module.exports = {
  buildLlmToolDefinitions,
}
