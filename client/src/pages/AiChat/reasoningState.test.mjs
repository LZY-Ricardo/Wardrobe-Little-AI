import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeReasoningSeconds,
  formatReasoningSummary,
  migrateExpandedMessageId,
} from './reasoningState.js'

test('computeReasoningSeconds prefers explicit duration when present', () => {
  const seconds = computeReasoningSeconds({
    reasoningContent: 'abcdef',
    reasoningDurationMs: 2400,
    reasoningStartTime: 1000,
  }, 9000)

  assert.equal(seconds, 2)
})

test('computeReasoningSeconds falls back to live elapsed time', () => {
  const seconds = computeReasoningSeconds({
    reasoningContent: 'abcdef',
    reasoningStartTime: 1000,
  }, 4200)

  assert.equal(seconds, 3)
})

test('formatReasoningSummary formats display text', () => {
  const summary = formatReasoningSummary({
    reasoningContent: 'abcdef',
    reasoningDurationMs: 1000,
  }, 9000)

  assert.equal(summary, '思考了 1 秒')
})

test('migrateExpandedMessageId carries expanded state to persisted id', () => {
  const result = migrateExpandedMessageId(new Set(['stream-1']), 'stream-1', 88)

  assert.equal(result.has('stream-1'), false)
  assert.equal(result.has(88), true)
})

test('migrateExpandedMessageId leaves state unchanged when source is absent', () => {
  const source = new Set(['other'])
  const result = migrateExpandedMessageId(source, 'stream-1', 88)

  assert.deepEqual([...result], ['other'])
})
