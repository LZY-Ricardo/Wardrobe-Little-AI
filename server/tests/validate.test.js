const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeClothesType } = require('../utils/validate')

test('normalizeClothesType keeps subtype detail while appending stable category', () => {
  assert.equal(normalizeClothesType('衬衫上衣').value, '衬衫 / 上衣')
  assert.equal(normalizeClothesType('下装（长裤）下衣').value, '长裤 / 下衣')
  assert.equal(normalizeClothesType('帽子配饰').value, '帽子 / 配饰')
})

test('normalizeClothesType prefers shoes over accessory noise in descriptive text', () => {
  assert.equal(
    normalizeClothesType('低帮系带休闲帆布鞋（鞋类配饰），经典圆头楦型，系带式鞋口设计，鞋底带有防滑纹理').value,
    '低帮系带休闲帆布鞋 ，经典圆头楦型，系带式鞋口设计，鞋底带有防滑纹理 / 鞋子'
  )
})
