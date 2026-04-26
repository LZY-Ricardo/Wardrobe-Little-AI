import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReturnTargetAttr,
  buildReturnTargetSelector,
  createReturnFocusReader,
  resolveReturnEntityId,
  resolveReturnObject,
} from './returnNavigation.js'

test('resolveReturnObject returns first matching object from readers', () => {
  const result = resolveReturnObject(
    {
      selectedSuit: { suit_id: 7, name: '通勤套装' },
    },
    [
      (state) => state.selectedCloth,
      (state) => state.selectedSuit,
    ],
  )

  assert.deepEqual(result, { suit_id: 7, name: '通勤套装' })
})

test('resolveReturnObject prefers standardized agentContext focus object', () => {
  const result = resolveReturnObject(
    {
      agentContext: {
        focus: {
          type: 'suit',
          entity: { suit_id: 7, name: '通勤套装' },
        },
      },
    },
    [
      createReturnFocusReader('suit'),
      (state) => state.selectedSuit,
    ],
  )

  assert.deepEqual(result, { suit_id: 7, name: '通勤套装' })
})

test('resolveReturnEntityId extracts positive entity id from matching object', () => {
  const result = resolveReturnEntityId(
    {
      selectedOutfitLog: { id: 13, scene: '通勤' },
    },
    [
      (state) => state.selectedOutfitLog,
    ],
  )

  assert.equal(result, 13)
})

test('resolveReturnEntityId extracts id from standardized agentContext focus object', () => {
  const result = resolveReturnEntityId(
    {
      agentContext: {
        focus: {
          type: 'recommendationHistory',
          entity: { id: 21, scene: '科技园' },
        },
      },
    },
    [createReturnFocusReader('recommendationHistory')],
  )

  assert.equal(result, 21)
})

test('buildReturnTargetSelector builds stable selector', () => {
  assert.equal(buildReturnTargetAttr('suit', 9), 'suit-9')
  assert.equal(buildReturnTargetSelector('recommendation', 4), '[data-return-target="recommendation-4"]')
})
