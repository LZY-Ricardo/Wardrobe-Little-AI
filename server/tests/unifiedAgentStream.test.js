const test = require('node:test')
const assert = require('node:assert/strict')

const { __testables } = require('../controllers/unifiedAgentRuntime')

test('streamReplyFromMessages emits reasoning events and accumulates reasoning content', async () => {
  const emitted = []
  const stream = (async function * createStream() {
    yield Buffer.from('data: {"choices":[{"delta":{"reasoning_content":"先分析"}}]}\n')
    yield Buffer.from('data: {"choices":[{"delta":{"content":"这是"}}]}\n')
    yield Buffer.from('data: {"choices":[{"delta":{"reasoning_content":"再回答"}}]}\n')
    yield Buffer.from('data: {"choices":[{"delta":{"content":"回复"}}]}\n')
    yield Buffer.from('data: [DONE]\n')
  })()

  const result = await __testables.streamReplyFromMessages({
    messages: [{ role: 'user', content: '你好' }],
    emit: (payload) => emitted.push(payload),
    isClientGone: () => false,
    createChatCompletionImpl: async () => ({ data: stream }),
  })

  assert.deepEqual(emitted, [
    { type: 'reasoning', text: '先分析' },
    { type: 'content', text: '这是' },
    { type: 'reasoning', text: '再回答' },
    { type: 'content', text: '回复' },
  ])
  assert.equal(result.reply, '这是回复')
  assert.equal(result.reasoningContent, '先分析再回答')
})

test('resolveStreamingAutonomousMode keeps streaming when stream assistant adapter is unavailable', async () => {
  const resolvedWithDefault = __testables.resolveStreamingAutonomousMode({
    enableAutonomousTools: true,
  })
  const resolvedWithoutAdapter = __testables.resolveStreamingAutonomousMode({
    enableAutonomousTools: true,
    streamAssistantTurn: null,
  })

  assert.equal(typeof resolvedWithDefault.streamAssistantTurn, 'function')
  assert.equal(resolvedWithDefault.shouldUseStreamingAutonomous, true)
  assert.equal(resolvedWithoutAdapter.streamAssistantTurn, null)
  assert.equal(resolvedWithoutAdapter.shouldUseStreamingAutonomous, false)
})

test('buildAssistantMessageMeta merges supported runtime meta blocks', () => {
  const meta = __testables.buildAssistantMessageMeta({
    toolMeta: {
      toolCalls: [{ name: 'analyze_image', label: '图片分析', status: 'success', at: 123 }],
      toolResultsSummary: ['图片分析完成'],
    },
    attachments: [
      {
        type: 'image',
        mimeType: 'image/png',
        name: '通勤搭配',
        dataUrl: 'data:image/png;base64,cover',
        source: 'composite',
        variant: 'composite',
        objectType: 'recommendation',
        objectId: 18,
      },
    ],
    actionButton: {
      label: '打开编辑衣物',
      to: '/update',
    },
    pendingConfirmation: {
      confirmId: 'confirm-1',
      actionLabel: '保存到衣橱',
    },
    reasoningContent: '先分析后保存',
  })

  assert.deepEqual(meta, {
    toolCalls: [{ name: 'analyze_image', label: '图片分析', status: 'success', at: 123 }],
    toolResultsSummary: ['图片分析完成'],
    attachments: [
      {
        type: 'image',
        mimeType: 'image/png',
        name: '通勤搭配',
        dataUrl: 'data:image/png;base64,cover',
        source: 'composite',
        variant: 'composite',
        objectType: 'recommendation',
        objectId: 18,
      },
    ],
    actionButton: {
      label: '打开编辑衣物',
      to: '/update',
    },
    pendingConfirmation: {
      confirmId: 'confirm-1',
      actionLabel: '保存到衣橱',
    },
    reasoningContent: '先分析后保存',
  })
})

test('buildAssistantMessageMeta returns null when no supported block exists', () => {
  assert.equal(__testables.buildAssistantMessageMeta(), null)
  assert.equal(__testables.buildAssistantMessageMeta({ toolMeta: null }), null)
})
