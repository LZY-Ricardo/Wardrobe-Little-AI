const test = require('node:test')
const assert = require('node:assert/strict')

const { buildPersistedConfirmationPayload } = require('../controllers/confirmationService')
const { buildConfirmationPayload } = require('../controllers/confirmationService')
const { buildPersistedConfirmedResultSummary } = require('../controllers/confirmationService')

test('buildPersistedConfirmationPayload does not persist previewImages base64 payloads', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-1',
    {
      action: 'create_cloth',
      summary: '将“乐福鞋”保存到衣橱',
      scope: '鞋子 / 棕色',
      risk: '会新增一条衣物记录到当前账号的衣橱中。',
      details: {
        name: '乐福鞋',
      },
      previewImages: [
        {
          type: 'image',
          dataUrl: 'data:image/jpeg;base64,bG9hZmVy',
        },
      ],
      executePayload: {
        name: '乐福鞋',
      },
    },
    123
  )

  assert.deepEqual(persisted, {
    confirmId: 'confirm-1',
    createdAt: 123,
    action: 'create_cloth',
    summary: '将“乐福鞋”保存到衣橱',
    scope: '鞋子 / 棕色',
    risk: '会新增一条衣物记录到当前账号的衣橱中。',
    details: {
      name: '乐福鞋',
    },
    executePayload: {
      name: '乐福鞋',
    },
    recommendationHistoryId: null,
  })
})

test('buildConfirmationPayload keeps preview image for create_cloth confirmation', () => {
  const payload = buildConfirmationPayload({
    action: 'create_cloth',
    latestResult: {
      draftCloth: {
        name: '白色帆布鞋',
        type: '鞋子',
        color: '白色',
        style: '休闲',
        season: '四季',
        material: '帆布',
        image: 'data:image/jpeg;base64,ZmFrZQ==',
      },
    },
  })

  assert.equal(payload.previewImages.length, 1)
  assert.equal(payload.previewImages[0].dataUrl, 'data:image/jpeg;base64,ZmFrZQ==')
})

test('buildConfirmationPayload rejects create_cloth confirmation when image is missing', () => {
  assert.throws(
    () =>
      buildConfirmationPayload({
        action: 'create_cloth',
        latestResult: {
          draftCloth: {
            name: '白色帆布鞋',
            type: '鞋子',
            color: '白色',
            style: '休闲',
            season: '四季',
            material: '帆布',
          },
        },
      }),
    /图片/
  )
})

test('buildPersistedConfirmedResultSummary strips oversized suit cover payload from save_suit history summary', () => {
  const summary = buildPersistedConfirmedResultSummary(
    {
      action: 'save_suit',
    },
    '已保存套装“湖边夜跑穿搭”',
    {
      existed: true,
      suit: {
        suit_id: 402,
        name: '湖边夜跑穿搭',
        scene: '运动',
        signature: '27-37-2604',
        cover: `data:image/jpeg;base64,${'a'.repeat(69000)}`,
      },
    }
  )

  assert.equal(summary.confirmed, true)
  assert.equal(summary.summary, '已保存套装“湖边夜跑穿搭”')
  assert.equal(summary.result.existed, true)
  assert.equal(summary.result.suit.suit_id, 402)
  assert.ok(!('cover' in summary.result.suit))
  assert.ok(JSON.stringify(summary).length < 65535)
})

test('buildPersistedConfirmationPayload strips raw image from create_cloth execute payload', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-cloth',
    {
      action: 'create_cloth',
      summary: '将“黑色针织上衣”保存到衣橱',
      scope: '上衣 / 黑色',
      risk: '会新增一条衣物记录到当前账号的衣橱中。',
      executePayload: {
        name: '黑色针织上衣',
        type: '上衣',
        image: 'data:image/jpeg;base64,ZmFrZQ==',
      },
    },
    456
  )

  assert.deepEqual(persisted.executePayload, {
    name: '黑色针织上衣',
    type: '上衣',
  })
})

test('buildPersistedConfirmationPayload strips raw images from create_clothes_batch execute payload', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-batch',
    {
      action: 'create_clothes_batch',
      summary: '批量保存衣物',
      scope: '2 件衣物 / 批量新增',
      risk: '会新增多条衣物记录到当前账号的衣橱中。',
      executePayload: [
        {
          name: '黑色上衣',
          type: '上衣',
          image: 'data:image/jpeg;base64,ZmFrZQ==',
        },
        {
          name: '白色运动鞋',
          type: '鞋子',
          image: 'data:image/jpeg;base64,eHl6',
        },
      ],
    },
    789
  )

  assert.deepEqual(persisted.executePayload, [
    {
      name: '黑色上衣',
      type: '上衣',
    },
    {
      name: '白色运动鞋',
      type: '鞋子',
    },
  ])
})

test('buildPersistedConfirmationPayload strips raw image from update_cloth_image execute payload', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-image',
    {
      action: 'update_cloth_image',
      summary: '更新衣物图片',
      scope: '衣物 #18',
      risk: '会替换当前衣物的展示图片。',
      executePayload: {
        cloth_id: 18,
        image: 'data:image/jpeg;base64,ZmFrZQ==',
      },
    },
    999
  )

  assert.deepEqual(persisted.executePayload, {
    cloth_id: 18,
  })
})

test('buildPersistedConfirmationPayload strips raw images from import_closet_data execute payload', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-import',
    {
      action: 'import_closet_data',
      summary: '导入衣橱数据',
      scope: '2 件衣物',
      risk: '会新增多条衣物记录到当前账号的衣橱中。',
      executePayload: {
        items: [
          {
            name: '黑色上衣',
            type: '上衣',
            image: 'data:image/jpeg;base64,ZmFrZQ==',
          },
          {
            name: '白色鞋子',
            type: '鞋子',
            image: 'data:image/jpeg;base64,eHl6',
          },
        ],
      },
    },
    1001
  )

  assert.deepEqual(persisted.executePayload, {
    items: [
      {
        name: '黑色上衣',
        type: '上衣',
      },
      {
        name: '白色鞋子',
        type: '鞋子',
      },
    ],
  })
})

test('buildPersistedConfirmationPayload strips raw image from upload_user_avatar execute payload', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-avatar',
    {
      action: 'upload_user_avatar',
      summary: '更新头像',
      scope: 'profile avatar',
      risk: '会替换当前账号头像。',
      executePayload: {
        image: 'data:image/jpeg;base64,ZmFrZQ==',
      },
    },
    1002
  )

  assert.deepEqual(persisted.executePayload, {})
})

test('buildPersistedConfirmationPayload strips raw image from upload_character_model execute payload', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-model',
    {
      action: 'upload_character_model',
      summary: '更新人物模特',
      scope: 'character model',
      risk: '会替换当前人物模特。',
      executePayload: {
        image: 'data:image/jpeg;base64,ZmFrZQ==',
      },
    },
    1003
  )

  assert.deepEqual(persisted.executePayload, {})
})

test('buildPersistedConfirmationPayload keeps structured payload for update_outfit_log', () => {
  const persisted = buildPersistedConfirmationPayload(
    'confirm-outfit-update',
    {
      action: 'update_outfit_log',
      summary: '更新穿搭记录',
      scope: 'outfit_log_id=8',
      risk: '会修改现有穿搭记录。',
      executePayload: {
        outfit_log_id: 8,
        scene: '通勤',
        note: '补一条备注',
        items: [11, 12],
      },
    },
    1004
  )

  assert.deepEqual(persisted.executePayload, {
    outfit_log_id: 8,
    scene: '通勤',
    note: '补一条备注',
    items: [11, 12],
  })
})

test('getPendingAgentTaskByConfirmId can rehydrate create_cloth image from confirmation message meta', async () => {
  const { getPendingAgentTaskByConfirmId } = require('../controllers/confirmationService')

  const pending = await getPendingAgentTaskByConfirmId(1, 'confirm-cloth', {
    getPendingAgentTaskRecordByConfirmId: async () => ({
      row: {
        id: 9,
        user_id: 1,
        create_time: 123,
      },
      confirmation: {
        confirmId: 'confirm-cloth',
        createdAt: 123,
        action: 'create_cloth',
        summary: '将“黑色针织上衣”保存到衣橱',
        executePayload: {
          name: '黑色针织上衣',
          type: '上衣',
        },
      },
    }),
    getPendingConfirmationMessageMetaByConfirmId: async () => ({
      previewImages: [
        {
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
    }),
  })

  assert.equal(pending.executePayload.image, 'data:image/jpeg;base64,ZmFrZQ==')
})

test('getPendingAgentTaskByConfirmId can rehydrate batch images from confirmation message meta', async () => {
  const { getPendingAgentTaskByConfirmId } = require('../controllers/confirmationService')

  const pending = await getPendingAgentTaskByConfirmId(1, 'confirm-batch', {
    getPendingAgentTaskRecordByConfirmId: async () => ({
      row: {
        id: 10,
        user_id: 1,
        create_time: 123,
      },
      confirmation: {
        confirmId: 'confirm-batch',
        createdAt: 123,
        action: 'create_clothes_batch',
        summary: '批量保存衣物',
        executePayload: [
          { name: '黑色上衣', type: '上衣' },
          { name: '白色运动鞋', type: '鞋子' },
        ],
      },
    }),
    getPendingConfirmationMessageMetaByConfirmId: async () => ({
      previewImages: [
        {
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
        {
          dataUrl: 'data:image/jpeg;base64,eHl6',
        },
      ],
    }),
  })

  assert.equal(pending.executePayload[0].image, 'data:image/jpeg;base64,ZmFrZQ==')
  assert.equal(pending.executePayload[1].image, 'data:image/jpeg;base64,eHl6')
})
