const { after, test } = require('node:test')
const assert = require('node:assert/strict')
const { pool } = require('../models/db')

const {
  buildAssistantImageAttachments,
  __testables,
} = require('../controllers/unifiedAgentAttachments')

after(async () => {
  await pool.promise().end()
})

test('buildAssistantImageAttachments returns cloth image as original attachment', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    taskResult: {
      taskType: 'cloth_detail',
      result: {
        selectedCloth: {
          cloth_id: 23,
          name: '白色衬衫',
          image: 'data:image/jpeg;base64,cloth',
        },
      },
    },
  })

  assert.deepEqual(attachments, [
    {
      type: 'image',
      name: '白色衬衫',
      mimeType: 'image/jpeg',
      dataUrl: 'data:image/jpeg;base64,cloth',
      source: 'wardrobe',
      variant: 'original',
      objectType: 'cloth',
      objectId: 23,
    },
  ])
})

test('buildAssistantImageAttachments returns composite first for recommendation images', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    taskResult: {
      taskType: 'recommendation',
      result: {
        recommendationHistoryId: 18,
        suits: [
          {
            scene: '通勤',
            items: [
              { cloth_id: 11, name: '白衬衫', image: 'data:image/jpeg;base64,a' },
              { cloth_id: 12, name: '黑色短袖', image: 'data:image/jpeg;base64,b' },
              { cloth_id: 13, name: '灰色长裤', image: 'data:image/jpeg;base64,c' },
            ],
          },
        ],
      },
    },
  })

  assert.equal(attachments[0].variant, 'composite')
  assert.equal(attachments[0].source, 'composite')
  assert.equal(attachments[0].objectType, 'recommendation')
  assert.equal(attachments[0].objectId, 18)
  assert.equal(attachments.length, 4)
})

test('buildAssistantImageAttachments can resolve current cloth image from latest task when user asks to view picture', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    latestTask: {
      selectedCloth: {
        cloth_id: 9,
        name: '白色鞋子',
        image: 'data:image/png;base64,shoe',
      },
    },
    input: '把这件衣服的图片发我看看',
  })

  assert.equal(attachments.length, 1)
  assert.equal(attachments[0].objectId, 9)
  assert.equal(attachments[0].variant, 'original')
})

test('buildAssistantImageAttachments can resolve image for create_cloth confirmed result', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    latestTask: {
      taskType: 'create_cloth',
      result: {
        cloth_id: 1156,
        name: '白色帆布鞋',
        image: 'data:image/png;base64,shoe',
      },
    },
    input: '把刚刚存入衣橱的鞋子图片展示出来',
  })

  assert.equal(attachments.length, 1)
  assert.equal(attachments[0].objectId, 1156)
})

test('buildAssistantImageAttachments ignores truncated latestTask cloth data url and falls back to db image', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    latestTask: {
      taskType: 'create_cloth',
      selectedCloth: {
        cloth_id: 1156,
        name: '白色帆布鞋',
        image: 'data:image/jpeg;base64,abc',
      },
    },
    input: '把刚刚存入衣橱的鞋子图片展示出来',
    deps: {
      listClothesByIds: async () => ([
        { cloth_id: 1156, name: '白色帆布鞋', image: 'data:image/jpeg;base64,shoe-full' },
      ]),
    },
  })

  assert.equal(attachments.length, 1)
  assert.equal(attachments[0].objectId, 1156)
  assert.equal(attachments[0].dataUrl, 'data:image/jpeg;base64,shoe-full')
})

test('buildAssistantImageAttachments supports standardized latestTask focus payload', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    latestTask: {
      agentContext: {
        focus: {
          type: 'cloth',
          entity: {
            cloth_id: 10,
            name: '黑色西装',
            image: 'data:image/png;base64,suit',
          },
        },
      },
    },
    input: '把当前衣物图片发我',
  })

  assert.equal(attachments.length, 1)
  assert.equal(attachments[0].objectId, 10)
})

test('buildAssistantImageAttachments returns suit detail gallery attachments', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    taskResult: {
      taskType: 'suit_detail',
      result: {
        selectedSuit: {
          suit_id: 7,
          name: '通勤套装',
          scene: '通勤',
          items: [
            { cloth_id: 11, name: '白衬衫', image: 'data:image/jpeg;base64,shirt' },
            { cloth_id: 12, name: '黑裤子', image: 'data:image/jpeg;base64,pants' },
          ],
        },
      },
    },
  })

  assert.equal(attachments[0].objectType, 'suit')
  assert.equal(attachments[0].variant, 'composite')
  assert.equal(attachments.length, 3)
})

test('buildAssistantImageAttachments returns outfit log detail gallery attachments', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    taskResult: {
      taskType: 'outfit_log_detail',
      result: {
        selectedOutfitLog: {
          id: 9,
          log_date: '2026-04-25',
          scene: '通勤',
          items: [
            { cloth_id: 21, name: '外套', image: 'data:image/jpeg;base64,coat' },
            { cloth_id: 22, name: '牛仔裤', image: 'data:image/jpeg;base64,jeans' },
          ],
        },
      },
    },
  })

  assert.equal(attachments[0].objectType, 'outfit_log')
  assert.equal(attachments[0].variant, 'composite')
  assert.equal(attachments.length, 3)
})

test('buildAssistantImageAttachments can enrich recommendation images by cloth ids when images are absent', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    taskResult: {
      taskType: 'recommendation',
      result: {
        recommendationHistoryId: 20,
        suits: [
          {
            scene: '通勤',
            items: [
              { cloth_id: 31, name: '上衣' },
              { cloth_id: 32, name: '裤子' },
            ],
          },
        ],
      },
    },
    deps: {
      listClothesByIds: async () => ([
        { cloth_id: 31, name: '上衣', image: 'data:image/jpeg;base64,top' },
        { cloth_id: 32, name: '裤子', image: 'data:image/jpeg;base64,bottom' },
      ]),
    },
  })

  assert.equal(attachments.length, 3)
  assert.equal(attachments[0].variant, 'composite')
  assert.deepEqual(
    attachments.slice(1).map((item) => item.objectId),
    [31, 32]
  )
})

test('buildAssistantImageAttachments can resolve current draft suit images from numeric cloth ids', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    latestTask: {
      manualSuitDraft: {
        name: '白衬衫 + 绿裤子',
        scene: '搭配中心',
        items: [23, 28],
        source: 'match-page',
      },
    },
    input: '根据我当前选中的这套搭配生成预览图，先把图发我看看',
    deps: {
      listClothesByIds: async () => ([
        { cloth_id: 23, name: '白色衬衫上衣', image: 'data:image/jpeg;base64,shirt' },
        { cloth_id: 28, name: '绿色长裤', image: 'data:image/jpeg;base64,pants' },
      ]),
    },
  })

  assert.equal(attachments.length, 3)
  assert.equal(attachments[0].objectType, 'suit')
  assert.equal(attachments[0].variant, 'composite')
  assert.equal(attachments[1].objectId, 23)
  assert.equal(attachments[2].objectId, 28)
})

test('buildAssistantImageAttachments can resolve filtered cloth images from closet query context', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    latestTask: {
      taskType: 'closet_query',
      result: {
        total: 3,
        items: [
          { cloth_id: 21, name: '黑色高帮帆布鞋', type: '鞋子 / 帆布鞋', color: '黑色', hasImage: true },
          { cloth_id: 22, name: '白色低帮帆布鞋', type: '鞋子 / 帆布鞋', color: '白色', hasImage: true },
          { cloth_id: 23, name: '黑色高帮帆布鞋', type: '鞋子 / 帆布鞋', color: '黑色', hasImage: true },
        ],
      },
    },
    input: '把黑色帆布鞋的图片给我看看',
    deps: {
      listClothesByIds: async () => ([
        { cloth_id: 21, name: '黑色高帮帆布鞋', image: 'data:image/jpeg;base64,black-1' },
        { cloth_id: 22, name: '白色低帮帆布鞋', image: 'data:image/jpeg;base64,white-1' },
        { cloth_id: 23, name: '黑色高帮帆布鞋', image: 'data:image/jpeg;base64,black-2' },
      ]),
    },
  })

  assert.equal(attachments.length, 2)
  assert.deepEqual(
    attachments.map((item) => item.objectId),
    [21, 23]
  )
})

test('buildAssistantImageAttachments keeps multiple recommendation suits as separate image groups', async () => {
  const attachments = await buildAssistantImageAttachments({
    userId: 1,
    taskResult: {
      taskType: 'recommendation',
      result: {
        recommendationHistoryId: 21,
        suits: [
          {
            scene: '通勤',
            items: [
              { cloth_id: 41, name: '衬衫', image: 'data:image/jpeg;base64,shirt' },
              { cloth_id: 42, name: '裤子', image: 'data:image/jpeg;base64,pants' },
            ],
          },
          {
            scene: '运动',
            items: [
              { cloth_id: 51, name: '短袖', image: 'data:image/jpeg;base64,tee' },
              { cloth_id: 52, name: '短裤', image: 'data:image/jpeg;base64,shorts' },
            ],
          },
        ],
      },
    },
  })

  assert.equal(attachments.length, 6)
  assert.equal(attachments[0].variant, 'composite')
  assert.equal(attachments[0].suitIndex, 0)
  assert.equal(attachments[0].suitLabel, '第 1 套')
  assert.equal(attachments[3].variant, 'composite')
  assert.equal(attachments[3].suitIndex, 1)
  assert.equal(attachments[3].suitLabel, '第 2 套')
})

test('createCompositeAttachmentDataUrl returns empty string when there are no images', () => {
  assert.equal(__testables.createCompositeAttachmentDataUrl([]), '')
})
