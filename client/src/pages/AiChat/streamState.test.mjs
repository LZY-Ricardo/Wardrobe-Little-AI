import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyStreamAbort,
  applyStreamContent,
  applyStreamFailure,
  applyToolCompletedEvent,
  applyToolStartedEvent,
  createStreamPlaceholder,
  finalizeOptimisticUserMessage,
} from './streamState.js'

test('createStreamPlaceholder initializes streaming assistant message', () => {
  const placeholder = createStreamPlaceholder({ imageCount: 2, streamMessageId: 'stream-1' })

  assert.equal(placeholder.id, 'stream-1')
  assert.equal(placeholder.deliveryStatus, 'streaming')
  assert.equal(placeholder.toolPhase, '正在准备图片消息…')
  assert.deepEqual(placeholder.toolCalls, [])
})

test('applyToolStartedEvent appends a running tool call from metadata', () => {
  const next = applyToolStartedEvent(
    createStreamPlaceholder({ streamMessageId: 'stream-1' }),
    {
      tool: 'analyze_image',
      message: '正在分析图片',
      meta: {
        toolCalls: [
          { name: 'analyze_image', label: '图片分析', status: 'running', at: 1 },
        ],
      },
    }
  )

  assert.equal(next.toolPhase, '正在分析图片')
  assert.equal(next.toolCalls.length, 1)
  assert.equal(next.toolCalls[0].label, '图片分析')
})

test('applyToolCompletedEvent updates the latest matching tool call and appends summary', () => {
  const next = applyToolCompletedEvent(
    {
      ...createStreamPlaceholder({ streamMessageId: 'stream-1' }),
      toolCalls: [
        { name: 'analyze_image', label: '图片分析', status: 'running', at: 1 },
      ],
      toolResultsSummary: [],
    },
    {
      tool: 'analyze_image',
      ok: true,
      summary: '识别到一双黑色鞋子',
      meta: {
        toolCalls: [
          { name: 'analyze_image', label: '图片分析', status: 'success', at: 2 },
        ],
      },
    }
  )

  assert.equal(next.toolCalls[0].status, 'success')
  assert.deepEqual(next.toolResultsSummary, ['识别到一双黑色鞋子'])
})

test('applyStreamContent clears tool phase and writes streamed content', () => {
  const next = applyStreamContent(
    {
      ...createStreamPlaceholder({ streamMessageId: 'stream-1' }),
      toolPhase: '正在分析图片',
    },
    {
      fullText: '这是回复正文',
      reasoningText: '这是思考',
      reasoningStartTime: 100,
      reasoningDurationMs: 300,
    }
  )

  assert.equal(next.content, '这是回复正文')
  assert.equal(next.toolPhase, '')
  assert.equal(next.reasoningContent, '这是思考')
})

test('applyStreamFailure marks stream message as failed or cancelled', () => {
  const failed = applyStreamFailure(
    createStreamPlaceholder({ streamMessageId: 'stream-1' }),
    {
      fullText: '部分回复',
      reasoningText: '部分思考',
      deliveryStatus: 'cancelled',
    }
  )

  assert.equal(failed.deliveryStatus, 'cancelled')
  assert.equal(failed.content, '部分回复')
  assert.equal(failed.reasoningContent, '部分思考')
})

test('finalizeOptimisticUserMessage removes optimistic message before persistence', () => {
  const next = finalizeOptimisticUserMessage([
    { id: 'temp-1', role: 'user', deliveryStatus: 'sending' },
    { id: 'other', role: 'assistant', deliveryStatus: 'sent' },
  ], {
    optimisticMessageId: 'temp-1',
  })

  assert.deepEqual(next, [
    { id: 'other', role: 'assistant', deliveryStatus: 'sent' },
  ])
})

test('finalizeOptimisticUserMessage marks optimistic message as sent after persistence', () => {
  const next = finalizeOptimisticUserMessage([
    { id: 'temp-1', role: 'user', deliveryStatus: 'sending' },
  ], {
    optimisticMessageId: 'temp-1',
    userMessagePersisted: true,
  })

  assert.deepEqual(next, [
    { id: 'temp-1', role: 'user', deliveryStatus: 'sent' },
  ])
})

test('applyStreamAbort keeps cancelled assistant draft when content already exists on message', () => {
  const optimistic = { id: 'temp-1', role: 'user', deliveryStatus: 'sending' }
  const stream = {
    ...createStreamPlaceholder({ streamMessageId: 'stream-1' }),
    content: '已经生成一半',
    reasoningContent: '',
  }

  const next = applyStreamAbort([optimistic, stream], {
    optimisticMessageId: 'temp-1',
    streamMessageId: 'stream-1',
    fullText: '',
    reasoningText: '',
    userMessagePersisted: true,
  })

  assert.equal(next.length, 2)
  assert.equal(next[0].deliveryStatus, 'sent')
  assert.equal(next[1].deliveryStatus, 'cancelled')
  assert.equal(next[1].content, '已经生成一半')
})

test('applyStreamAbort removes optimistic user message when request was aborted before persistence', () => {
  const optimistic = { id: 'temp-1', role: 'user', deliveryStatus: 'sending' }
  const stream = createStreamPlaceholder({ streamMessageId: 'stream-1' })

  const next = applyStreamAbort([optimistic, stream], {
    optimisticMessageId: 'temp-1',
    streamMessageId: 'stream-1',
    fullText: '',
    reasoningText: '',
  })

  assert.equal(next.length, 0)
})

test('applyStreamAbort keeps optimistic user message as sent after server persistence even when no assistant draft exists', () => {
  const optimistic = { id: 'temp-1', role: 'user', deliveryStatus: 'sending' }
  const stream = createStreamPlaceholder({ streamMessageId: 'stream-1' })

  const next = applyStreamAbort([optimistic, stream], {
    optimisticMessageId: 'temp-1',
    streamMessageId: 'stream-1',
    fullText: '',
    reasoningText: '',
    userMessagePersisted: true,
  })

  assert.equal(next.length, 1)
  assert.equal(next[0].id, 'temp-1')
  assert.equal(next[0].deliveryStatus, 'sent')
})
