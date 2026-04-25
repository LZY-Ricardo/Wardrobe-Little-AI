const isToolVisibleForLlm = (tool = {}, context = {}) => {
  if (!tool || !tool.llmVisible) return false
  if (tool.name === 'analyze_image') {
    return Boolean(context.hasImage)
  }
  return true
}

module.exports = {
  isToolVisibleForLlm,
}
