import test from 'node:test'
import assert from 'node:assert/strict'

import { buildOutfitLogsViewModel } from './viewModel.js'

test('buildOutfitLogsViewModel derives selected items and recent logs summary', () => {
  const model = buildOutfitLogsViewModel({
    form: {
      logDate: '2026-04-26',
      scene: '通勤',
      weatherSummary: '晴 22°C',
      satisfaction: 4,
      note: '',
      items: [1, 2],
    },
    logs: [
      { id: 11, log_date: '2026-04-26' },
      { id: 10, log_date: '2026-04-25' },
      { id: 9, log_date: '2026-04-24' },
      { id: 8, log_date: '2026-04-23' },
    ],
    clothes: [
      { cloth_id: 1, name: '白衬衫', type: '上衣', color: '白色', style: '通勤' },
      { cloth_id: 2, name: '牛仔裤', type: '下衣', color: '蓝色', style: '休闲' },
    ],
  })

  assert.equal(model.fields[0].value, '2026-04-26')
  assert.equal(model.fields[1].value, '通勤')
  assert.equal(model.selectedCount, 2)
  assert.deepEqual(
    model.selectedItems.map((item) => item.label),
    ['白衬衫', '牛仔裤']
  )
  assert.equal(model.recentLogs.length, 3)
})

