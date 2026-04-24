const test = require('node:test')
const assert = require('node:assert/strict')

const { pool, query } = require('../models/db')
const { getTodayInChina } = require('../utils/date')
const {
  createRecommendationHistory,
  getRecommendationDetailForUser,
  submitRecommendationFeedback,
} = require('../controllers/recommendations')
const {
  createOutfitLog,
  updateOutfitLog,
  deleteOutfitLog,
} = require('../controllers/outfitLogs')
const {
  refreshProfileInsight,
  gatherSourceData,
  buildWardrobeAnalytics,
} = require('../controllers/profileInsights')

test('closure flow keeps recommendation state, profile insight and analytics consistent', async () => {
  const now = Date.now()
  const username = `closure_test_${now}_${Math.random().toString(16).slice(2, 8)}`
  let userId = null
  let clothIds = []
  let recommendationIds = []
  let outfitLogId = null

  try {
    const userRes = await query(
      'INSERT INTO user (username, password, create_time, update_time) VALUES (?, ?, ?, ?)',
      [username, 'test-password', now, now]
    )
    userId = userRes.insertId

    const clothesPayload = [
      ['测试上衣', '上衣 / 通勤', '黑色', '通勤', '春季', '棉'],
      ['测试下衣', '下衣 / 通勤', '蓝色', '通勤', '秋季', '牛仔'],
      ['测试鞋子', '鞋子', '白色', '休闲', '秋季', '皮革'],
    ]

    for (const [name, type, color, style, season, material] of clothesPayload) {
      // eslint-disable-next-line no-await-in-loop
      const res = await query(
        `INSERT INTO clothes (user_id, name, type, color, style, season, material, image, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, type, color, style, season, material, '', now, now]
      )
      clothIds.push(res.insertId)
    }

    const recommendationA = await createRecommendationHistory(userId, {
      scene: '通勤',
      triggerSource: 'integration-test',
      suits: [
        {
          scene: '通勤',
          source: 'llm',
          description: '第一套推荐',
          items: [
            { cloth_id: clothIds[0], name: '测试上衣', type: '上衣 / 通勤', color: '黑色', style: '通勤', season: '春季' },
            { cloth_id: clothIds[1], name: '测试下衣', type: '下衣 / 通勤', color: '蓝色', style: '通勤', season: '秋季' },
          ],
        },
      ],
    })
    const recommendationB = await createRecommendationHistory(userId, {
      scene: '面试',
      triggerSource: 'integration-test',
      suits: [
        {
          scene: '面试',
          source: 'llm',
          description: '第二套推荐',
          items: [
            { cloth_id: clothIds[0], name: '测试上衣', type: '上衣 / 通勤', color: '黑色', style: '通勤', season: '春季' },
            { cloth_id: clothIds[2], name: '测试鞋子', type: '鞋子', color: '白色', style: '休闲', season: '秋季' },
          ],
        },
      ],
    })
    recommendationIds = [recommendationA.id, recommendationB.id]

    await submitRecommendationFeedback(userId, recommendationA.id, {
      feedbackResult: 'like',
      reasonTags: ['颜色不喜欢', '太正式'],
      note: '第一轮反馈',
    })

    const createdLog = await createOutfitLog(userId, {
      recommendationId: recommendationA.id,
      logDate: getTodayInChina(),
      scene: '通勤',
      weatherSummary: '晴',
      satisfaction: 4,
      source: 'recommendation',
      note: '基于推荐创建',
      items: [clothIds[0], clothIds[1]],
    })
    outfitLogId = createdLog.id

    let detailA = await getRecommendationDetailForUser(userId, recommendationA.id)
    assert.equal(detailA.saved_as_outfit_log, 1)
    assert.equal(detailA.adopted, 1)

    await updateOutfitLog(userId, outfitLogId, {
      recommendationId: recommendationB.id,
      scene: '面试',
      items: [clothIds[0], clothIds[2]],
    })

    detailA = await getRecommendationDetailForUser(userId, recommendationA.id)
    const detailB = await getRecommendationDetailForUser(userId, recommendationB.id)
    assert.equal(detailA.saved_as_outfit_log, 0)
    assert.equal(detailA.adopted, 0)
    assert.equal(detailB.saved_as_outfit_log, 1)
    assert.equal(detailB.adopted, 1)

    const profile = await refreshProfileInsight(userId)
    assert.deepEqual(profile.likedReasonTags, ['颜色不喜欢', '太正式'])
    assert.match(profile.summary, /颜色不喜欢/)

    const sourceData = await gatherSourceData(userId)
    const analytics = buildWardrobeAnalytics(sourceData)
    assert.equal(analytics.recommendationSummary.total, 2)
    assert.equal(analytics.recommendationSummary.adopted, 1)
    assert.equal(analytics.recommendationSummary.savedAsOutfitLog, 1)
    assert.equal(analytics.outfitTrend.length, 1)

    await deleteOutfitLog(userId, outfitLogId)
    outfitLogId = null

    const detailBAfterDelete = await getRecommendationDetailForUser(userId, recommendationB.id)
    assert.equal(detailBAfterDelete.saved_as_outfit_log, 0)
    assert.equal(detailBAfterDelete.adopted, 0)
  } finally {
    if (outfitLogId) {
      await query('DELETE FROM outfit_log_items WHERE outfit_log_id = ?', [outfitLogId])
      await query('DELETE FROM outfit_logs WHERE id = ?', [outfitLogId])
    }
    if (recommendationIds.length) {
      await query('DELETE FROM recommendation_feedback WHERE recommendation_id IN (?)', [recommendationIds])
      await query('DELETE FROM recommendation_history WHERE id IN (?)', [recommendationIds])
    }
    if (userId) {
      await query('DELETE FROM user_style_profile WHERE user_id = ?', [userId])
      if (clothIds.length) {
        await query('DELETE FROM clothes WHERE cloth_id IN (?)', [clothIds])
      }
      await query('DELETE FROM user WHERE id = ?', [userId])
    }
  }
})

test.after(async () => {
  try {
    await pool.promise().end()
  } catch {}
})
