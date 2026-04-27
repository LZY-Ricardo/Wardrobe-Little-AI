const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildRecommendationRequestSummary,
  buildRecommendationResultSummary,
  normalizeFeedbackReasonTags,
  normalizeRecommendationAdoptionPatch,
} = require('../controllers/recommendations.helpers')

test('buildRecommendationRequestSummary trims scene and keeps structured scene preferences', () => {
  const summary = buildRecommendationRequestSummary({
    scene: '  面试通勤  ',
    formality: ' 正式 ',
    temperaturePreference: ' 偏冷 ',
    weatherSummary: ' 上海 18℃ 小雨 ',
    triggerSource: 'recommend-page',
  })

  assert.deepEqual(summary, {
    scene: '面试通勤',
    formality: '正式',
    temperaturePreference: '偏冷',
    weatherSummary: '上海 18℃ 小雨',
    triggerSource: 'recommend-page',
  })
})

test('buildRecommendationResultSummary summarizes suit count and first reasons', () => {
  const summary = buildRecommendationResultSummary([
    { reason: '正式低调', items: [{ cloth_id: 1 }, { cloth_id: 2 }] },
    { reason: '深色稳重', items: [{ cloth_id: 3 }, { cloth_id: 4 }] },
    { reason: '第三套', items: [{ cloth_id: 5 }, { cloth_id: 6 }] },
  ])

  assert.equal(summary.suitCount, 3)
  assert.equal(summary.itemCount, 6)
  assert.deepEqual(summary.reasons, ['正式低调', '深色稳重'])
})

test('normalizeFeedbackReasonTags deduplicates and trims structured tags', () => {
  const tags = normalizeFeedbackReasonTags([' 太正式 ', '颜色不喜欢', '太正式', '', null])

  assert.deepEqual(tags, ['太正式', '颜色不喜欢'])
})

test('normalizeRecommendationAdoptionPatch keeps adopted true when linked states exist', () => {
  const next = normalizeRecommendationAdoptionPatch(
    { adopted: 1, saved_as_suit: 1, saved_as_outfit_log: 0 },
    { adopted: 0 }
  )

  assert.deepEqual(next, {
    adopted: 1,
    saved_as_suit: 1,
    saved_as_outfit_log: 0,
  })
})
