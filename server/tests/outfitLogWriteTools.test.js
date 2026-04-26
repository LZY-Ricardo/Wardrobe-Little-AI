const test = require('node:test')
const assert = require('node:assert/strict')

const { updateOutfitLogTool } = require('../agent/tools/handlers/outfitLogs/writeTools')

test('updateOutfitLogTool rejects missing outfit log id', async () => {
  const result = await updateOutfitLogTool(1, { scene: '通勤' })
  assert.deepEqual(result, { error: 'INVALID_OUTFIT_LOG_ID' })
})

test('updateOutfitLogTool delegates to injected update helper', async () => {
  const result = await updateOutfitLogTool(
    1,
    {
      outfit_log_id: 8,
      scene: '通勤',
      note: '补一条备注',
      items: [11, 12],
    },
    {
      updateOutfitLog: async (_userId, logId, payload) => ({
        id: logId,
        scene: payload.scene,
        note: payload.note,
        items: payload.items.map((cloth_id) => ({ cloth_id })),
      }),
    }
  )

  assert.equal(result.id, 8)
  assert.equal(result.scene, '通勤')
  assert.equal(result.note, '补一条备注')
  assert.equal(result.items.length, 2)
})
