import test from 'node:test'
import assert from 'node:assert/strict'

import { getGenerateCompatibilityIssue } from '../src/pages/Match/compatibility.js'

test('male profile with skirt bottom is blocked before preview submission', () => {
  const issue = getGenerateCompatibilityIssue({
    sex: 'man',
    topClothes: { type: '上衣 / 衬衫', image: 'shirt' },
    bottomClothes: { type: '下衣 / 百褶裙', image: 'skirt' },
  })

  assert.match(issue || '', /不支持女性裙装预览/)
})

test('compatible bottom item does not produce a generate compatibility issue', () => {
  const issue = getGenerateCompatibilityIssue({
    sex: 'man',
    topClothes: { type: '上衣 / 衬衫', image: 'shirt' },
    bottomClothes: { type: '下衣 / 长裤', image: 'pants' },
  })

  assert.equal(issue, '')
})
