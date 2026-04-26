import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRecommendCardModel, buildRecommendViewModel } from './viewModel.js'

test('buildRecommendCardModel derives preview images, labels and save state', () => {
  const model = buildRecommendCardModel(
    {
      id: 7,
      scene: '约会',
      source: 'llm',
      description: '用浅色上装提亮，深色鞋履收尾。',
      items: [
        { cloth_id: 1, name: '白色海军领上衣', image: 'top.png', color: '白色', style: '轻法式', season: '春季' },
        { cloth_id: 2, name: '绿色长裤', image: 'pants.png', color: '绿色' },
        { cloth_id: 3, name: '黑色高帮帆布鞋', image: 'shoes.png', color: '黑色' },
      ],
    },
    { isSaved: true, isSaving: false }
  )

  assert.equal(model.sceneLabel, '约会')
  assert.equal(model.sourceLabel, '模型推荐')
  assert.equal(model.saveLabel, '已加入套装库')
  assert.equal(model.previewImages.main.image, 'top.png')
  assert.equal(model.previewImages.secondary.length, 2)
  assert.equal(model.featuredItem.title, '上衣：白色海军领上衣')
  assert.deepEqual(model.featuredItem.tags, ['白色', '轻法式', '春季'])
})

test('buildRecommendViewModel derives quick scenes and service status text', () => {
  const model = buildRecommendViewModel({
    scene: '约会晚餐',
    sceneSuits: [{ id: 1 }, { id: 2 }],
    serviceUnavailable: true,
  })

  assert.equal(model.sceneValue, '约会晚餐')
  assert.equal(model.quickScenes.length, 3)
  assert.equal(model.quickScenes[1].label, '约会')
  assert.match(model.resultMeta, /2 套推荐/)
  assert.equal(model.serviceStatus, '服务暂不可用时，保留重试入口')
})

test('buildRecommendCardModel prioritizes top bottom shoes and keeps empty preview slots', () => {
  const model = buildRecommendCardModel(
    {
      id: 9,
      scene: '通勤',
      source: 'rule',
      description: '保持通勤利落感。',
      items: [
        { cloth_id: 11, type: '上衣', name: '白衬衫', image: 'top.png' },
        { cloth_id: 12, type: '下衣', name: '黑西裤' },
        { cloth_id: 13, type: '鞋子', name: '乐福鞋', image: 'shoes.png' },
        { cloth_id: 14, type: '配饰', name: '手表', image: 'watch.png' },
      ],
    },
    {}
  )

  assert.equal(model.previewImages.main.alt, '白衬衫')
  assert.equal(model.previewImages.secondary.length, 2)
  assert.equal(model.previewImages.secondary[0].alt, '黑西裤')
  assert.equal(model.previewImages.secondary[0].image, '')
  assert.equal(model.previewImages.secondary[1].alt, '乐福鞋')
  assert.equal(model.previewImages.secondary[1].image, 'shoes.png')
})
