const test = require('node:test')
const assert = require('node:assert/strict')

const { mapToolIntentToTaskOptions, resolveWriteActionOptions } = require('../controllers/legacyTaskFallbackService')

test('mapToolIntentToTaskOptions injects current attachment image into create_cloth draft', () => {
  const result = mapToolIntentToTaskOptions(
    'create_cloth',
    {
      name: '乐福鞋',
      type: '鞋子',
      color: '棕色',
      image: { invalid: true },
    },
    {
      multimodal: {
        attachments: [
          {
            type: 'image',
            dataUrl: 'data:image/jpeg;base64,bG9hZmVy',
          },
        ],
      },
    }
  )

  assert.equal(result.action, 'create_cloth')
  assert.equal(result.latestResult.draftCloth.image, 'data:image/jpeg;base64,bG9hZmVy')
})

test('mapToolIntentToTaskOptions injects attachment images into create_clothes_batch drafts', () => {
  const result = mapToolIntentToTaskOptions(
    'create_clothes_batch',
    {
      items: [
        { name: '上衣', type: '上衣', color: '黑色', image: '' },
        { name: '鞋子', type: '鞋子', color: '白色', image: 'oops' },
      ],
    },
    {
      multimodal: {
        attachments: [
          {
            type: 'image',
            dataUrl: 'data:image/jpeg;base64,dG9w',
          },
          {
            type: 'image',
            dataUrl: 'data:image/jpeg;base64,c2hvZQ==',
          },
        ],
      },
    }
  )

  assert.equal(result.action, 'create_clothes_batch')
  assert.equal(result.latestResult.draftClothes[0].image, 'data:image/jpeg;base64,dG9w')
  assert.equal(result.latestResult.draftClothes[1].image, 'data:image/jpeg;base64,c2hvZQ==')
})

test('resolveWriteActionOptions extracts explicit outfit log note text instead of hardcoded placeholder', () => {
  const result = resolveWriteActionOptions(
    '把这条穿搭记录改成面试并补一句备注今天太热了',
    {
      selectedOutfitLog: {
        id: 8,
        log_date: '2026-04-26',
        scene: '日常',
      },
    }
  )

  assert.equal(result.action, 'update_outfit_log')
  assert.equal(result.latestResult.patch.scene, '面试')
  assert.equal(result.latestResult.patch.note, '今天太热了')
})
