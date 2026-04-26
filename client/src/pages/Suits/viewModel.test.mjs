import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCollectionViewModel, buildSuitCardModel } from './viewModel.js'

test('buildSuitCardModel derives compact title, cover and thumb strip for a suit', () => {
  const model = buildSuitCardModel({
    suit_id: 18,
    name: '我的套装',
    scene: '上学',
    create_time: new Date('2026-04-26T08:00:00+08:00').getTime(),
    item_count: 3,
    items: [
      { cloth_id: 1, name: '黑色帆布鞋', image: 'shoe.png' },
      { cloth_id: 2, name: '蓝色格纹', image: 'shirt.png' },
      { cloth_id: 3, name: '绿色长裤', image: 'pants.png' },
      { cloth_id: 4, name: '多余单品', image: 'extra.png' },
    ],
  })

  assert.match(model.title, /上学/)
  assert.equal(model.sceneLabel, '上学')
  assert.equal(model.countLabel, '3 件单品')
  assert.equal(model.previewText, '黑色帆布鞋 · 蓝色格纹 · 绿色长裤')
  assert.equal(model.coverItems.length, 3)
  assert.equal(model.thumbs.length, 4)
  assert.equal(model.thumbs[0].alt, '黑色帆布鞋')
})

test('buildCollectionViewModel derives stats and hero hint from suits', () => {
  const model = buildCollectionViewModel([
    { suit_id: 1, scene: '上学' },
    { suit_id: 2, scene: '上学' },
    { suit_id: 3, scene: '夜跑' },
    { suit_id: 4, scene: '通勤' },
  ])

  assert.equal(model.totalCount, 4)
  assert.equal(model.primaryStat.label, '上学')
  assert.equal(model.primaryStat.value, '2 套')
  assert.equal(model.secondaryStat.label, '夜跑')
  assert.equal(model.secondaryStat.value, '1 套')
  assert.match(model.heroHint, /更常穿/)
})
