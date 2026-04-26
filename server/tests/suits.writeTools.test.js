const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildSuitPayloadFromLatestTask,
  __testables,
} = require('../agent/tools/handlers/suits/writeTools')

test('buildSuitPayloadFromLatestTask keeps existing cover from latest task', async () => {
  const payload = await buildSuitPayloadFromLatestTask(
    12,
    {
      result: {
        suits: [
          {
            scene: '日常出行',
            reason: '适合轻松通勤',
            cover: 'data:image/png;base64,existing-cover',
            items: [{ cloth_id: 3 }, { cloth_id: 5 }, { cloth_id: 8 }],
          },
        ],
      },
    },
    0,
    {
      buildCollectionAttachments: async () => {
        throw new Error('SHOULD_NOT_REBUILD_WHEN_COVER_ALREADY_EXISTS')
      },
    }
  )

  assert.equal(payload.cover, 'data:image/png;base64,existing-cover')
  assert.deepEqual(payload.items, [3, 5, 8])
})

test('buildSuitPayloadFromLatestTask builds composite cover when latest task lacks one', async () => {
  const payload = await buildSuitPayloadFromLatestTask(
    19,
    {
      result: {
        suits: [
          {
            scene: '日常出行',
            description: '鞋衬衫牛仔裤',
            items: [{ cloth_id: 11 }, { cloth_id: 12 }, { cloth_id: 13 }],
          },
        ],
      },
    },
    0,
    {
      buildCollectionAttachments: async (suit, options) => {
        assert.equal(options.userId, 19)
        assert.equal(suit.scene, '日常出行')
        return [
          { variant: 'composite', dataUrl: 'data:image/svg+xml;charset=UTF-8,composite-cover' },
        ]
      },
    }
  )

  assert.equal(payload.cover, 'data:image/svg+xml;charset=UTF-8,composite-cover')
  assert.equal(payload.name, '日常出行套装')
})

test('buildSuitPayloadFromArgs builds composite cover for manual item ids when cover is absent', async () => {
  const payload = await __testables.buildSuitPayloadFromArgs(
    25,
    {
      name: '周末通勤',
      scene: '通勤',
      description: '测试',
      items: [21, 22, 23],
    },
    {
      buildCollectionAttachments: async (suit, options) => {
        assert.equal(options.userId, 25)
        assert.deepEqual(suit.items, [21, 22, 23])
        return [
          { variant: 'composite', dataUrl: 'data:image/svg+xml;charset=UTF-8,manual-composite' },
        ]
      },
    }
  )

  assert.equal(payload.cover, 'data:image/svg+xml;charset=UTF-8,manual-composite')
  assert.equal(payload.source, 'agent')
})
