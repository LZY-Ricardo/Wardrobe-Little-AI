const test = require('node:test')
const assert = require('node:assert/strict')

const { generateOutfitPreview, showClothesImages } = require('../agent/tools/handlers/media/readTools')

test('showClothesImages returns multiple cloth image attachments in requested order', async () => {
  const result = await showClothesImages(1, { cloth_ids: [23, 28, 99] }, {
    listClothesByIds: async () => ([
      {
        cloth_id: 28,
        name: '绿色长裤',
        type: '下衣 / 长裤',
        image: 'data:image/jpeg;base64,pants',
      },
      {
        cloth_id: 23,
        name: '白色衬衫上衣',
        type: '上衣 / 衬衫',
        image: 'data:image/jpeg;base64,shirt',
      },
      {
        cloth_id: 99,
        name: '无图鞋子',
        type: '鞋子 / 休闲鞋',
        image: '',
      },
    ]),
  })

  assert.equal(result.kind, 'media_result')
  assert.equal(result.attachments.length, 2)
  assert.deepEqual(
    result.attachments.map((item) => item.objectId),
    [23, 28],
  )
  assert.equal(result.attachments[0].dataUrl, 'data:image/jpeg;base64,shirt')
  assert.equal(result.attachments[1].dataUrl, 'data:image/jpeg;base64,pants')
})

test('generateOutfitPreview resolves current match draft into a generated preview image', async () => {
  const result = await generateOutfitPreview(1, {}, {
    latestTask: {
      manualSuitDraft: {
        name: '白色衬衫上衣 + 绿色长裤',
        scene: '搭配中心',
        source: 'match-page',
        items: [23, 28],
      },
    },
    getUserInfoById: async () => ({
      id: 1,
      sex: 'woman',
      characterModel: 'data:image/jpeg;base64,model',
    }),
    listClothesByIds: async () => ([
      {
        cloth_id: 23,
        name: '白色衬衫上衣',
        type: '上衣 / 衬衫',
        image: 'data:image/jpeg;base64,shirt',
      },
      {
        cloth_id: 28,
        name: '绿色长裤',
        type: '下衣 / 长裤',
        image: 'data:image/jpeg;base64,pants',
      },
    ]),
    generatePreviewFromInputs: async ({ top, bottom, characterModel, sex }) => {
      assert.equal(sex, 'woman')
      assert.equal(top.name, '白色衬衫上衣')
      assert.equal(bottom.name, '绿色长裤')
      assert.equal(characterModel.name, 'character-model')
      return 'data:image/png;base64,preview'
    },
  })

  assert.equal(result.kind, 'media_result')
  assert.equal(result.summary, '已生成当前搭配预览图。')
  assert.equal(result.attachments.length, 1)
  assert.equal(result.attachments[0].objectType, 'outfit_preview')
  assert.equal(result.attachments[0].variant, 'generated')
  assert.equal(result.attachments[0].dataUrl, 'data:image/png;base64,preview')
})

test('generateOutfitPreview accepts remote image url returned by preview service', async () => {
  const result = await generateOutfitPreview(1, {}, {
    latestTask: {
      manualSuitDraft: {
        name: '白色衬衫上衣 + 绿色长裤',
        scene: '搭配中心',
        source: 'match-page',
        items: [23, 28],
      },
    },
    getUserInfoById: async () => ({
      id: 1,
      sex: 'woman',
      characterModel: 'data:image/jpeg;base64,model',
    }),
    listClothesByIds: async () => ([
      {
        cloth_id: 23,
        name: '白色衬衫上衣',
        type: '上衣 / 衬衫',
        image: 'data:image/jpeg;base64,shirt',
      },
      {
        cloth_id: 28,
        name: '绿色长裤',
        type: '下衣 / 长裤',
        image: 'data:image/jpeg;base64,pants',
      },
    ]),
    generatePreviewFromInputs: async () => 'https://cdn.example.com/tryon.jpg',
  })

  assert.equal(result.kind, 'media_result')
  assert.equal(result.attachments.length, 1)
  assert.equal(result.attachments[0].dataUrl, 'https://cdn.example.com/tryon.jpg')
  assert.equal(result.attachments[0].mimeType, 'image/jpeg')
})
