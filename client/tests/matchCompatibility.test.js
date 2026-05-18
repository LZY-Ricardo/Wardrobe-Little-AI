import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPreviewCompatibilityError,
  isFemaleSkirtType,
  isPreviewCompatible,
} from '../src/pages/Match/compatibility.js'

test('isFemaleSkirtType identifies female skirt keywords conservatively', () => {
  assert.equal(isFemaleSkirtType('下衣 / 半身裙'), true)
  assert.equal(isFemaleSkirtType('下衣 / 长裤'), false)
  assert.equal(isFemaleSkirtType('下衣 / 裙裤'), false)
})

test('isPreviewCompatible blocks male profile skirt previews', () => {
  assert.equal(isPreviewCompatible({ sex: 'man', bottomType: '百褶裙' }), false)
  assert.equal(isPreviewCompatible({ sex: 'woman', bottomType: '百褶裙' }), true)
})

test('getPreviewCompatibilityError explains blocked male profile skirt previews', () => {
  assert.match(
    getPreviewCompatibilityError({ sex: 'man', bottomType: 'A字裙' }),
    /不支持女性裙装预览/,
  )
  assert.equal(getPreviewCompatibilityError({ sex: 'woman', bottomType: 'A字裙' }), '')
})
