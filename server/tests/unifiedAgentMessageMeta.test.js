const test = require('node:test')
const assert = require('node:assert/strict')

const {
  hydrateMessage,
  normalizeMessageMeta,
  normalizeMessageType,
} = require('../controllers/unifiedAgentMessageMeta')

test('normalizeMessageMeta keeps only supported message meta fields', () => {
  const normalized = normalizeMessageMeta({
    attachments: [
      {
        type: 'image',
        mimeType: 'image/jpeg',
        name: 'shoe.jpg',
        dataUrl: 'data:image/jpeg;base64,abc',
        source: 'wardrobe',
        variant: 'original',
        objectType: 'cloth',
        objectId: 12,
        ignored: 'x',
      },
    ],
    reasoningContent: '  先看图片再保存  ',
    actionButton: {
      label: '打开编辑衣物',
      to: '/update',
      pageKey: 'editCloth',
      pageLabel: '编辑衣物',
      state: { cloth_id: 12, unsafe: undefined },
      ignored: 'x',
    },
    pendingConfirmation: {
      confirmId: 'confirm-1',
      summary: '保存到衣橱',
      targetPage: { key: 'wardrobe', label: '虚拟衣柜', to: '/outfit', ignored: 'x' },
      details: { color: '白色', fn: () => {} },
    },
    toolCalls: [
      { name: 'analyze_image', label: '图片分析', status: 'success', at: 123, ignored: 'x' },
    ],
    toolResultsSummary: ['  图片分析完成  '],
    latestTask: {
      taskType: 'create_cloth',
      status: 'success',
      selectedCloth: {
        cloth_id: 12,
        name: '白色鞋子',
      },
    },
    unknownBlock: { foo: 'bar' },
  })

  assert.deepEqual(normalized, {
    attachments: [
      {
        type: 'image',
        mimeType: 'image/jpeg',
        name: 'shoe.jpg',
        dataUrl: 'data:image/jpeg;base64,abc',
        source: 'wardrobe',
        variant: 'original',
        objectType: 'cloth',
        objectId: 12,
      },
    ],
    reasoningContent: '先看图片再保存',
    actionButton: {
      label: '打开编辑衣物',
      to: '/update',
      pageKey: 'editCloth',
      pageLabel: '编辑衣物',
      state: { cloth_id: 12 },
    },
    pendingConfirmation: {
      confirmId: 'confirm-1',
      summary: '保存到衣橱',
      targetPage: { key: 'wardrobe', label: '虚拟衣柜', to: '/outfit' },
      details: { color: '白色' },
    },
    toolCalls: [
      { name: 'analyze_image', label: '图片分析', status: 'success', at: 123 },
    ],
    toolResultsSummary: ['图片分析完成'],
    latestTask: {
      taskType: 'create_cloth',
      status: 'success',
      selectedCloth: {
        cloth_id: 12,
        name: '白色鞋子',
      },
    },
  })
})

test('normalizeMessageMeta keeps assistant image attachment metadata and drops invalid object ids', () => {
  const normalized = normalizeMessageMeta({
    attachments: [
      {
        type: 'image',
        name: '通勤搭配',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,xyz',
        source: 'composite',
        variant: 'composite',
        objectType: 'recommendation',
        objectId: '18',
        suitIndex: '1',
        suitLabel: '第 2 套',
      },
      {
        type: 'image',
        name: '坏数据',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,def',
        source: 'wardrobe',
        variant: 'original',
        objectType: 'cloth',
        objectId: 'oops',
      },
    ],
  })

  assert.deepEqual(normalized, {
    attachments: [
      {
        type: 'image',
        name: '通勤搭配',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,xyz',
        source: 'composite',
        variant: 'composite',
        objectType: 'recommendation',
        objectId: 18,
        suitIndex: 1,
        suitLabel: '第 2 套',
      },
      {
        type: 'image',
        name: '坏数据',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,def',
        source: 'wardrobe',
        variant: 'original',
        objectType: 'cloth',
      },
    ],
  })
})

test('hydrateMessage parses persisted meta and normalizes message flags', () => {
  const hydrated = hydrateMessage({
    id: 9,
    role: 'assistant',
    content: '已保存',
    message_type: 'unexpected',
    confirmation_status: 'unknown',
    meta_json: JSON.stringify({
      pendingConfirmation: {
        confirmId: 'confirm-2',
        actionLabel: '保存衣物',
      },
      ignored: true,
    }),
  })

  assert.equal(hydrated.message_type, 'chat')
  assert.equal(hydrated.confirmation_status, '')
  assert.deepEqual(hydrated.meta, {
    pendingConfirmation: {
      confirmId: 'confirm-2',
      actionLabel: '保存衣物',
    },
  })
  assert.deepEqual(hydrated.attachments, [])
})

test('normalizeMessageType keeps only known message types', () => {
  assert.equal(normalizeMessageType('confirm_request'), 'confirm_request')
  assert.equal(normalizeMessageType('unknown_type'), 'chat')
})
