import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSelectionViewModel } from './selectionViewModel.js'

const clothes = [
  { cloth_id: 1, name: '白衬衫', type: '上衣', color: '白色', style: '通勤', favorite: 1 },
  { cloth_id: 2, name: '灰西裤', type: '下衣', color: '灰色', style: '通勤' },
  { cloth_id: 3, name: '小白鞋', type: '鞋子', color: '白色', style: '休闲' },
  { cloth_id: 4, name: '托特包', type: '包包', color: '棕色', style: '通勤' },
  { cloth_id: 5, name: '黑色高领', type: '上装', color: '黑色', style: '极简' },
  { cloth_id: 6, name: '牛仔裤', type: '裤子', color: '蓝色', style: '休闲' },
  { cloth_id: 7, name: '乐福鞋', type: '鞋靴', color: '黑色', style: '通勤' },
]

test('buildSelectionViewModel groups items into mobile friendly categories', () => {
  const model = buildSelectionViewModel({
    clothes,
    selectedIds: [4, 1],
    activeCategory: 'tops',
    visibleCount: 2,
  })

  assert.deepEqual(
    model.categories.map((item) => item.key),
    ['all', 'tops', 'bottoms', 'shoes', 'accessories']
  )
  assert.equal(model.totalCount, 2)
  assert.equal(model.visibleItems[0].label, '白衬衫')
  assert.deepEqual(
    model.selectedItems.map((item) => item.label),
    ['白衬衫', '托特包']
  )
})

test('buildSelectionViewModel applies keyword search and exposes remaining state', () => {
  const model = buildSelectionViewModel({
    clothes,
    selectedIds: [],
    activeCategory: 'all',
    keyword: '通勤',
    visibleCount: 2,
  })

  assert.equal(model.totalCount, 4)
  assert.equal(model.visibleItems.length, 2)
  assert.equal(model.hasMore, true)
})

test('buildSelectionViewModel returns empty state text for no results', () => {
  const model = buildSelectionViewModel({
    clothes,
    activeCategory: 'bottoms',
    keyword: '红色',
  })

  assert.equal(model.totalCount, 0)
  assert.equal(model.emptyText, '没有匹配到单品')
})
