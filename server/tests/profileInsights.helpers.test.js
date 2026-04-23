const test = require('node:test')
const assert = require('node:assert/strict')

const {
  summarizeTopValues,
  buildProfileInsight,
} = require('../controllers/profileInsights.helpers')

test('summarizeTopValues sorts by frequency then by label', () => {
  const result = summarizeTopValues(['通勤', '约会', '通勤', '旅行', '约会', '通勤'], 2)

  assert.deepEqual(result, ['通勤', '约会'])
})

test('buildProfileInsight aggregates clothes, logs and feedback into profile summary', () => {
  const profile = buildProfileInsight({
    clothes: [
      { color: '黑色', style: '通勤', season: '春季' },
      { color: '蓝色', style: '通勤', season: '秋季' },
      { color: '黑色', style: '休闲', season: '秋季' },
    ],
    outfitLogs: [
      { scene: '通勤', items: [{ season: '秋季' }, { season: '秋季' }] },
      { scene: '面试', items: [{ season: '春季' }] },
    ],
    feedbacks: [
      { feedback_result: 'like', feedback_reason_tags: ['颜色不喜欢'] },
      { feedback_result: 'like', feedback_reason_tags: ['太正式'] },
    ],
    currentPreferences: { lowRiskNoConfirm: true },
  })

  assert.deepEqual(profile.preferredColors, ['黑色', '蓝色'])
  assert.deepEqual(profile.preferredStyles, ['通勤', '休闲'])
  assert.deepEqual(profile.frequentScenes, ['通勤', '面试'])
  assert.deepEqual(profile.frequentSeasons, ['秋季', '春季'])
  assert.deepEqual(profile.likedReasonTags, ['颜色不喜欢', '太正式'])
  assert.equal(profile.confirmationPreferences.lowRiskNoConfirm, true)
  assert.match(profile.summary, /黑色/)
  assert.match(profile.summary, /通勤/)
  assert.match(profile.summary, /颜色不喜欢/)
})
