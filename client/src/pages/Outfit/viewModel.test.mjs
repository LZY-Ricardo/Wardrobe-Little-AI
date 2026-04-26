import test from 'node:test'
import assert from 'node:assert/strict'

import { buildOutfitViewModel } from './viewModel.js'

test('buildOutfitViewModel summarizes wardrobe stats and active secondary filters', () => {
  const model = buildOutfitViewModel({
    items: [
      { cloth_id: 1, name: '白衬衫', favorite: 1, type: '上衣', style: '通勤', season: '春季', color: '白色' },
      { cloth_id: 2, name: '黑色帆布鞋', favorite: 0, type: '鞋子', style: '休闲', season: '秋季', color: '黑色' },
      { cloth_id: 3, name: '绿色长裤', favorite: true, type: '下衣', style: '通勤', season: '夏季', color: '绿色' },
    ],
    filters: {
      type: '全部',
      color: '全部',
      season: '夏季',
      style: '通勤',
    },
  })

  assert.equal(model.totalCount, 3)
  assert.equal(model.favoriteCount, 2)
  assert.equal(model.heroMeta, '3 件单品 · 2 件常穿收藏')
  assert.equal(model.hasAdvancedFilters, true)
  assert.deepEqual(
    model.activeSecondaryFilters.map((item) => item.value),
    ['夏季', '通勤']
  )
  assert.equal(model.filterSummaryText, '已筛选 2 项')
})

test('buildOutfitViewModel derives compact display tags for a cloth card', () => {
  const model = buildOutfitViewModel({
    items: [],
    filters: {},
  })

  const card = model.buildCardModel({
    cloth_id: 11,
    name: '黑色帆布鞋',
    type: '鞋子',
    style: '运动休闲',
    season: '春季, 秋季',
    color: '黑白',
    favorite: '1',
  })

  assert.equal(card.title, '黑色帆布鞋')
  assert.equal(card.meta, '鞋子 · 运动休闲')
  assert.deepEqual(card.tags, ['黑白', '春季, 秋季'])
  assert.equal(card.isFavorited, true)
})
