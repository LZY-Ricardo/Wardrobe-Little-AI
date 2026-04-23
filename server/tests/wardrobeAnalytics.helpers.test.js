const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildWardrobeAnalytics,
} = require('../controllers/wardrobeAnalytics.helpers')

test('buildWardrobeAnalytics aggregates clothes distribution and closure metrics', () => {
  const analytics = buildWardrobeAnalytics({
    clothes: [
      { type: '上衣 / 通勤', color: '黑色', style: '通勤' },
      { type: '下衣 / 通勤', color: '黑色', style: '通勤' },
      { type: '鞋子', color: '白色', style: '休闲' },
      { type: '配饰', color: '蓝色', style: '休闲' },
    ],
    outfitLogs: [
      { log_date: '2026-04-21', scene: '通勤' },
      { log_date: '2026-04-21', scene: '通勤' },
      { log_date: '2026-04-22', scene: '约会' },
    ],
    recommendations: [
      { adopted: 1, saved_as_suit: 1, saved_as_outfit_log: 0 },
      { adopted: 0, saved_as_suit: 0, saved_as_outfit_log: 0 },
      { adopted: 1, saved_as_suit: 0, saved_as_outfit_log: 1 },
    ],
  })

  assert.equal(analytics.totalClothes, 4)
  assert.deepEqual(analytics.typeDistribution.map((item) => item.label), ['上衣', '下衣', '鞋子', '配饰'])
  assert.equal(analytics.recommendationSummary.total, 3)
  assert.equal(analytics.recommendationSummary.adopted, 2)
  assert.equal(analytics.recommendationSummary.adoptionRate, 67)
  assert.deepEqual(analytics.outfitTrend.map((item) => item.date), ['2026-04-21', '2026-04-22'])
  assert.equal(analytics.outfitTrend[0].count, 2)
})
