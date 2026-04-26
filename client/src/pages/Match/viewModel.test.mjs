import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPreviewStageModel } from './viewModel.js'

test('buildPreviewStageModel derives hint for empty and partial selections', () => {
  const empty = buildPreviewStageModel({ topClothes: null, bottomClothes: null, showPreview: false })
  const partial = buildPreviewStageModel({
    topClothes: { name: '白色衬衫上衣', image: 'top.png' },
    bottomClothes: null,
    showPreview: false,
  })

  assert.match(empty.hint, /点击上方衣物/)
  assert.match(partial.hint, /再点选一件下衣/)
  assert.equal(empty.slots[0].label, '上衣')
  assert.equal(empty.slots[1].label, '下衣')
})

test('buildPreviewStageModel derives instant look chips and selected slots', () => {
  const model = buildPreviewStageModel({
    topClothes: { name: '白色衬衫上衣', image: 'top.png' },
    bottomClothes: { name: '黑色长裤', image: 'bottom.png' },
    showPreview: false,
  })

  assert.equal(model.hasInstantLook, true)
  assert.equal(model.slotChips.length, 2)
  assert.equal(model.slotChips[0], '白色衬衫上衣')
  assert.equal(model.slotChips[1], '黑色长裤')
  assert.equal(model.slots[0].selected, true)
  assert.equal(model.slots[1].selected, true)
})
