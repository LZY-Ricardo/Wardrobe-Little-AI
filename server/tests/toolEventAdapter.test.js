const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildToolStartedEventMeta,
  buildToolCompletedEventMeta,
  mergeToolMeta,
} = require('../agent/tools/runtime/toolEventAdapter')

test('toolEventAdapter returns frontend-compatible tool meta', () => {
  const meta = buildToolCompletedEventMeta({
    toolName: 'analyze_image',
    ok: true,
    summary: '图片分析完成',
  })

  assert.equal(meta.toolCalls[0].name, 'analyze_image')
  assert.equal(meta.toolCalls[0].label, '图片分析')
  assert.equal(meta.toolCalls[0].status, 'success')
  assert.equal(meta.toolResultsSummary[0], '图片分析完成')
})

test('toolEventAdapter can build running state and merge tool metadata', () => {
  const started = buildToolStartedEventMeta({ toolName: 'list_clothes' })
  const completed = buildToolCompletedEventMeta({
    toolName: 'list_clothes',
    ok: true,
    summary: 'list_clothes 执行完成',
  })
  const merged = mergeToolMeta([started, completed])

  assert.equal(started.toolCalls[0].status, 'running')
  assert.equal(started.toolCalls[0].label, '查询衣橱')
  assert.equal(merged.toolCalls.length, 2)
  assert.equal(merged.toolResultsSummary[0], 'list_clothes 执行完成')
})
