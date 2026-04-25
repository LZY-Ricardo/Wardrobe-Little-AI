const buildToolContext = (input = {}) => ({
  userId: input?.userId || null,
  intent: String(input?.intent || '').trim(),
  hasImage: Boolean(input?.multimodal?.attachments?.length),
  multimodal: input?.multimodal || { attachments: [] },
  latestTask: input?.latestTask || null,
  profile: input?.profile || null,
  clientContext: input?.clientContext || null,
  sessionMemory: input?.sessionMemory || null,
  preferenceSummary: input?.preferenceSummary || null,
})

module.exports = {
  buildToolContext,
}
