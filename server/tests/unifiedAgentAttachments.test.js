const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildAssistantImageAttachments,
  __testables,
} = require('../controllers/unifiedAgentAttachments')

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

test('createCompositeAttachmentDataUrl returns empty string when there are no images', () => {
  assert.equal(__testables.createCompositeAttachmentDataUrl([]), '')
})
