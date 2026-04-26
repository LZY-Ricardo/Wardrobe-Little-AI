const test = require('node:test')
const assert = require('node:assert/strict')

const {
  __testables,
  importClosetData,
  updateClothImage,
} = require('../agent/tools/handlers/wardrobe/writeTools')

test('pickCloth keeps image payload for downstream edit flows', () => {
  const cloth = __testables.pickCloth({
    cloth_id: 12,
    name: '白色帆布鞋',
    type: '鞋子',
    color: '白色',
    style: '休闲',
    season: '四季',
    material: '帆布',
    favorite: 1,
    image: 'data:image/png;base64,c2hvZQ==',
  })

  assert.deepEqual(cloth, {
    cloth_id: 12,
    name: '白色帆布鞋',
    type: '鞋子',
    color: '白色',
    style: '休闲',
    season: '四季',
    material: '帆布',
    favorite: true,
    hasImage: true,
    image: 'data:image/png;base64,c2hvZQ==',
  })
})

test('updateClothImage rejects missing cloth id', async () => {
  const result = await updateClothImage(1, {
    image: 'data:image/png;base64,c2hvZQ==',
  })

  assert.deepEqual(result, { error: 'INVALID_CLOTH_ID' })
})

test('updateClothImage updates image through injected services', async () => {
  const result = await updateClothImage(
    1,
    {
      cloth_id: 12,
      image: 'data:image/png;base64,c2hvZQ==',
    },
    {
      updateClothFieldsForUser: async () => true,
      getClothByIdForUser: async () => ({
        cloth_id: 12,
        name: '白色帆布鞋',
        type: '鞋子',
        color: '白色',
        style: '休闲',
        season: '四季',
        material: '帆布',
        favorite: 1,
        image: 'data:image/png;base64,c2hvZQ==',
      }),
    }
  )

  assert.equal(result.cloth_id, 12)
  assert.equal(result.updated, true)
  assert.equal(result.hasImage, true)
})

test('importClosetData rejects empty items', async () => {
  const result = await importClosetData(1, { items: [] })
  assert.deepEqual(result, { error: 'EMPTY_ITEMS' })
})

test('importClosetData delegates to injected import helper', async () => {
  const result = await importClosetData(
    1,
    {
      items: [{ name: '黑色上衣', type: '上衣' }],
    },
    {
      importClothesForUser: async () => ({ inserted: 1, total: 1 }),
    }
  )

  assert.deepEqual(result, { inserted: 1, total: 1 })
})
