import test from 'node:test'
import assert from 'node:assert/strict'

import { partializeClosetStore } from './closetPersist.js'

test('partializeClosetStore keeps only lightweight ui state and drops cloth payload caches', () => {
  const persisted = partializeClosetStore({
    items: [{ cloth_id: 1, image: 'data:image/png;base64,huge' }],
    allClothes: [{ cloth_id: 1, image: 'data:image/png;base64,huge' }],
    filters: {
      type: '上衣',
      color: '黑色',
      season: '春季',
      style: '通勤',
      search: '衬衫',
    },
    page: 3,
    hasMore: false,
    lastFetchedAt: 123456789,
  })

  assert.deepEqual(persisted, {
    filters: {
      type: '上衣',
      color: '黑色',
      season: '春季',
      style: '通勤',
      search: '衬衫',
    },
    page: 3,
  })
})
