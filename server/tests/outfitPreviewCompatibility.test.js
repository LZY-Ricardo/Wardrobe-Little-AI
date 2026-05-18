const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getPreviewCompatibilityError,
  isFemaleSkirtType,
  isPreviewCompatible,
} = require('../utils/outfitPreviewCompatibility')

test('backend compatibility helper identifies female skirt types', () => {
  assert.equal(isFemaleSkirtType('下衣 / 包臀裙'), true)
  assert.equal(isFemaleSkirtType('下衣 / 牛仔裤'), false)
})

test('backend compatibility helper blocks male profile skirt previews', () => {
  assert.equal(isPreviewCompatible({ sex: 'man', bottomType: 'A字裙' }), false)
  assert.equal(isPreviewCompatible({ sex: 'woman', bottomType: 'A字裙' }), true)
  assert.match(
    getPreviewCompatibilityError({ sex: 'man', bottomType: 'A字裙' }),
    /不支持所选女性裙装预览|不支持女性裙装预览/,
  )
})
