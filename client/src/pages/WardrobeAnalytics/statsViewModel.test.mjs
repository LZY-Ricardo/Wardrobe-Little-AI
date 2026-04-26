import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCompactStats } from './statsViewModel.js'

test('buildCompactStats keeps top items and folds the rest into overflow bucket', () => {
  const items = [
    { label: '休闲', count: 19 },
    { label: '休闲风格', count: 8 },
    { label: '轻复古', count: 1 },
    { label: '学院风、休闲风格', count: 1 },
    { label: '可爱、休闲', count: 1 },
    { label: '甜美、复古风格', count: 1 },
  ]

  const result = buildCompactStats(items, { maxItems: 4, overflowLabel: '其他风格' })

  assert.deepEqual(result, [
    { label: '休闲', count: 19 },
    { label: '休闲风格', count: 8 },
    { label: '轻复古', count: 1 },
    { label: '其他风格', count: 3 },
  ])
})

