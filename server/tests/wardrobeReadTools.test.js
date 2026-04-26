const test = require('node:test')
const assert = require('node:assert/strict')

const { exportClosetData } = require('../agent/tools/handlers/wardrobe/readTools')

test('exportClosetData delegates to injected export helper and builds compact summary', async () => {
  const result = await exportClosetData(
    1,
    {},
    {
      exportClothesForUser: async () => ({
        exportedAt: '2026-04-26T10:00:00.000Z',
        includeImages: false,
        items: [
          { cloth_id: 1, name: '黑色上衣' },
          { cloth_id: 2, name: '白色鞋子' },
        ],
      }),
    }
  )

  assert.equal(result.kind, 'media_result')
  assert.equal(result.total, 2)
  assert.equal(result.includeImages, false)
  assert.match(result.summary, /2 件衣物/)
  assert.ok(result.fileName.endsWith('.json'))
  assert.equal(result.attachments[0].type, 'file')
  assert.equal(result.attachments[0].objectType, 'closet_export')
  assert.ok(!('dataUrl' in result.attachments[0]))
  assert.deepEqual(result.attachments[0].content.items, [
    { cloth_id: 1, name: '黑色上衣' },
    { cloth_id: 2, name: '白色鞋子' },
  ])
  assert.deepEqual(result.payload.items, [
    { cloth_id: 1, name: '黑色上衣' },
    { cloth_id: 2, name: '白色鞋子' },
  ])
})
