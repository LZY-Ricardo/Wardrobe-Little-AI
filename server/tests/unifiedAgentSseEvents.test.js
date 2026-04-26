const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildContentEvent,
  buildErrorEvent,
  buildMessageSavedEvent,
  buildMetaEvent,
  buildReasoningEvent,
  buildTaskResultEvent,
  buildToolCallCompletedEvent,
  buildToolCallStartedEvent,
} = require('../utils/unifiedAgentSseEvents')

test('buildMetaEvent creates title payload', () => {
  assert.deepEqual(buildMetaEvent({ title: '测试会话' }), {
    type: 'meta',
    title: '测试会话',
  })
})

test('buildReasoningEvent and buildContentEvent create streaming payloads', () => {
  assert.deepEqual(buildReasoningEvent('先分析'), {
    type: 'reasoning',
    text: '先分析',
  })
  assert.deepEqual(buildContentEvent('再回复'), {
    type: 'content',
    text: '再回复',
  })
})

test('buildErrorEvent creates error payload', () => {
  assert.deepEqual(buildErrorEvent('发送失败'), {
    type: 'error',
    msg: '发送失败',
  })
})

test('buildErrorEvent keeps structured error fields when provided', () => {
  assert.deepEqual(buildErrorEvent({
    msg: '暂时无法对话',
    detail: '上游服务超时',
    stage: 'stream_reply',
    status: 503,
    upstreamStatus: 504,
    code: 'ETIMEDOUT',
    providerMessage: 'timeout',
    retryable: true,
  }), {
    type: 'error',
    msg: '暂时无法对话',
    detail: '上游服务超时',
    stage: 'stream_reply',
    status: 503,
    upstreamStatus: 504,
    code: 'ETIMEDOUT',
    providerMessage: 'timeout',
    retryable: true,
  })
})

test('buildToolCallStartedEvent and buildToolCallCompletedEvent include normalized tool meta', () => {
  const started = buildToolCallStartedEvent({ toolName: 'analyze_image', message: '正在分析图片' })
  assert.equal(started.type, 'tool_call_started')
  assert.equal(started.tool, 'analyze_image')
  assert.equal(started.message, '正在分析图片')
  assert.equal(started.meta.toolCalls[0].name, 'analyze_image')
  assert.equal(started.meta.toolCalls[0].label, '图片分析')
  assert.equal(started.meta.toolCalls[0].status, 'running')
  assert.equal(typeof started.meta.toolCalls[0].at, 'number')
  assert.deepEqual(started.meta.toolResultsSummary, [])

  const completed = buildToolCallCompletedEvent({
    toolName: 'analyze_image',
    ok: true,
    summary: '图片分析完成',
  })

  assert.equal(completed.type, 'tool_call_completed')
  assert.equal(completed.tool, 'analyze_image')
  assert.equal(completed.ok, true)
  assert.equal(completed.summary, '图片分析完成')
  assert.equal(completed.message, '图片分析完成')
  assert.equal(completed.meta.toolCalls[0].label, '图片分析')
  assert.equal(completed.meta.toolCalls[0].status, 'success')
  assert.equal(completed.meta.toolResultsSummary[0], '图片分析完成')
})

test('buildTaskResultEvent and buildMessageSavedEvent keep payload shape stable', () => {
  const message = { id: 1, content: '已保存' }
  const restored = { session: { id: 9 } }
  const latestTask = { taskType: 'create_cloth' }

  assert.deepEqual(buildTaskResultEvent({
    message,
    latest_task: latestTask,
    restored,
  }), {
    type: 'task_result',
    message,
    latest_task: latestTask,
    restored,
  })

  assert.deepEqual(buildMessageSavedEvent({ message, restored }), {
    type: 'message_saved',
    message,
    restored,
  })
})
