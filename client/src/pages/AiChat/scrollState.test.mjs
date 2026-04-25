import test from 'node:test'
import assert from 'node:assert/strict'

import { AUTO_SCROLL_THRESHOLD_PX, isScrollNearBottom } from './scrollState.js'

test('isScrollNearBottom returns true when viewport is already at bottom', () => {
  assert.equal(
    isScrollNearBottom({ scrollTop: 320, clientHeight: 480, scrollHeight: 800 }),
    true
  )
})

test('isScrollNearBottom returns true when distance is within threshold', () => {
  assert.equal(
    isScrollNearBottom({
      scrollTop: 800 - 480 - AUTO_SCROLL_THRESHOLD_PX + 8,
      clientHeight: 480,
      scrollHeight: 800,
    }),
    true
  )
})

test('isScrollNearBottom returns false when user has scrolled away from bottom', () => {
  assert.equal(
    isScrollNearBottom({
      scrollTop: 800 - 480 - AUTO_SCROLL_THRESHOLD_PX - 24,
      clientHeight: 480,
      scrollHeight: 800,
    }),
    false
  )
})
