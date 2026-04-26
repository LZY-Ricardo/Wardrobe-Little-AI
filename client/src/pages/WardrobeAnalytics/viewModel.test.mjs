import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWardrobeAnalyticsViewModel } from './viewModel.js'

test('buildWardrobeAnalyticsViewModel derives hero insight and recommendation from analytics data', () => {
  const model = buildWardrobeAnalyticsViewModel({
    totalClothes: 43,
    recommendationSummary: {
      total: 4,
      adopted: 0,
      adoptionRate: 0,
    },
    typeDistribution: [
      { label: '鞋子', count: 23 },
      { label: '下衣', count: 10 },
      { label: '上衣', count: 8 },
    ],
    styleDistribution: [
      { label: '休闲', count: 18 },
      { label: '休闲风格', count: 8 },
      { label: '轻复古', count: 1 },
    ],
  })

  assert.equal(model.heroInsightLabel, '衣橱结论')
  assert.match(model.heroInsightText, /鞋/)
  assert.match(model.heroInsightText, /采纳率偏低/)
  assert.equal(model.focusNote.text, '先清理低频鞋履，再补基础上衣。')
  assert.equal(model.focusNote.badge, '重点')
  assert.equal(model.trendItems.length, 3)
  assert.equal(model.trendItems[0].label, '鞋子')
})
