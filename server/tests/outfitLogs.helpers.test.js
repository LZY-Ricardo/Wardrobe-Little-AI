const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeLogDate,
  normalizeOutfitLogItems,
  normalizeOutfitLogPayload,
} = require('../controllers/outfitLogs.helpers')

test('normalizeLogDate keeps yyyy-mm-dd value', () => {
  assert.equal(normalizeLogDate('2026-04-23'), '2026-04-23')
})

test('normalizeLogDate falls back to Asia/Shanghai local date instead of UTC date', () => {
  const RealDate = Date
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length) return new RealDate(...args)
      return new RealDate('2026-04-22T18:30:00.000Z')
    }
    static now() {
      return new RealDate('2026-04-22T18:30:00.000Z').getTime()
    }
  }

  try {
    assert.equal(normalizeLogDate(''), '2026-04-23')
  } finally {
    global.Date = RealDate
  }
})

test('normalizeOutfitLogItems deduplicates and sorts cloth ids', () => {
  assert.deepEqual(normalizeOutfitLogItems([5, '2', 5, 'x', 3]), [2, 3, 5])
})

test('normalizeOutfitLogPayload trims fields and defaults source', () => {
  const payload = normalizeOutfitLogPayload({
    recommendationId: '12',
    suitId: '8',
    logDate: '2026-04-23',
    scene: '  通勤  ',
    weatherSummary: '  多云  ',
    satisfaction: '4',
    source: '',
    note: '  今天想穿得轻松一点  ',
    items: [3, 1, 3],
  })

  assert.deepEqual(payload, {
    recommendationId: 12,
    suitId: 8,
    logDate: '2026-04-23',
    scene: '通勤',
    weatherSummary: '多云',
    satisfaction: 4,
    source: 'manual',
    note: '今天想穿得轻松一点',
    itemIds: [1, 3],
  })
})
