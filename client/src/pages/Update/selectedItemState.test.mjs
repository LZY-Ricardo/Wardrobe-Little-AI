import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasAgentContextClothFocus,
  mergeSelectedItemWithDetail,
  resolveSelectedClothFromLocationState,
  stripSelectedClothImageForAgentContext,
  shouldFetchSelectedClothDetail,
} from './selectedItemState.js'

test('resolveSelectedClothFromLocationState supports direct state and agentContext focus state', () => {
  assert.deepEqual(
    resolveSelectedClothFromLocationState({ cloth_id: 12, name: '白色帆布鞋' }),
    { cloth_id: 12, name: '白色帆布鞋' }
  )

  assert.deepEqual(
    resolveSelectedClothFromLocationState({
      agentContext: {
        focus: {
          type: 'cloth',
          entity: { cloth_id: 18, name: '棕色皮革乐福鞋' },
        },
      },
    }),
    { cloth_id: 18, name: '棕色皮革乐福鞋' }
  )

  assert.equal(
    hasAgentContextClothFocus({
      agentContext: {
        focus: {
          type: 'cloth',
          entity: { cloth_id: 18, name: '棕色皮革乐福鞋' },
        },
      },
    }),
    true
  )
})

test('stripSelectedClothImageForAgentContext clears image from agentContext entry to avoid invalid first paint', () => {
  assert.deepEqual(
    stripSelectedClothImageForAgentContext(
      {
        agentContext: {
          focus: {
            type: 'cloth',
            entity: { cloth_id: 18, image: 'data:image/jpeg;base64,broken' },
          },
        },
      },
      { cloth_id: 18, image: 'data:image/jpeg;base64,broken', name: '棕色乐福鞋' }
    ),
    { cloth_id: 18, image: '', name: '棕色乐福鞋' }
  )
})

test('shouldFetchSelectedClothDetail returns true when selected item has cloth id but no image', () => {
  assert.equal(shouldFetchSelectedClothDetail({ cloth_id: 12, name: '白色帆布鞋' }), true)
  assert.equal(shouldFetchSelectedClothDetail({ cloth_id: 12, image: 'data:image/png;base64,abc' }), false)
  assert.equal(shouldFetchSelectedClothDetail({}), false)
})

test('mergeSelectedItemWithDetail keeps selected item fields and fills missing image from detail', () => {
  const merged = mergeSelectedItemWithDetail(
    { cloth_id: 12, name: '白色帆布鞋', image: '' },
    { cloth_id: 12, type: '鞋子', image: 'data:image/png;base64,c2hvZQ==' }
  )

  assert.deepEqual(merged, {
    cloth_id: 12,
    name: '白色帆布鞋',
    image: 'data:image/png;base64,c2hvZQ==',
    type: '鞋子',
  })
})
