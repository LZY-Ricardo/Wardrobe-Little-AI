import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveVisibleMatchMaterials } from '../src/pages/Match/compatibility.js'

test('male profile hides skirt bottom items from visible materials', () => {
  const visible = resolveVisibleMatchMaterials({
    activeTab: 'bottom',
    sex: 'man',
    topItems: [],
    bottomItems: [
      { cloth_id: 1, type: '下衣 / 半身裙' },
      { cloth_id: 2, type: '下衣 / 长裤' },
    ],
  })

  assert.deepEqual(
    visible.map((item) => item.cloth_id),
    [2],
  )
})

test('top tab keeps original top items regardless of sex', () => {
  const visible = resolveVisibleMatchMaterials({
    activeTab: 'top',
    sex: 'man',
    topItems: [{ cloth_id: 10, type: '上衣 / 衬衫' }],
    bottomItems: [{ cloth_id: 2, type: '下衣 / 半身裙' }],
  })

  assert.deepEqual(
    visible.map((item) => item.cloth_id),
    [10],
  )
})
