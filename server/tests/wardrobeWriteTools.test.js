const test = require('node:test')
const assert = require('node:assert/strict')

const { __testables } = require('../agent/tools/handlers/wardrobe/writeTools')

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
