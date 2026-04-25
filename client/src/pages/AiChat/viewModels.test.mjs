import test from 'node:test'
import assert from 'node:assert/strict'

import { mapMessage } from './viewModels.js'

test('mapMessage normalizes supported meta blocks and drops malformed payloads', () => {
  const message = mapMessage({
    id: 1,
    role: 'assistant',
    content: '已保存到衣橱',
    message_type: 'task_result',
    meta: {
      reasoningContent: '  先分析图片  ',
      actionButton: {
        label: '打开编辑衣物',
        to: '/update',
        pageLabel: '编辑衣物',
        state: { cloth_id: 5, fn: () => {} },
      },
      pendingConfirmation: {
        confirmId: 'confirm-1',
        targetPage: { label: '虚拟衣柜', to: '/outfit' },
      },
      toolCalls: [
        { name: 'analyze_image', label: '图片分析', status: 'success', at: 123, extra: true },
      ],
      toolResultsSummary: ['  已识别鞋子  '],
      ignored: { raw: true },
    },
  })

  assert.equal(message.reasoningContent, '先分析图片')
  assert.deepEqual(message.actionButton, {
    label: '打开编辑衣物',
    to: '/update',
    pageLabel: '编辑衣物',
    state: { cloth_id: 5 },
  })
  assert.deepEqual(message.pendingConfirmation, {
    confirmId: 'confirm-1',
    targetPage: { label: '虚拟衣柜', to: '/outfit' },
  })
  assert.deepEqual(message.toolCalls, [
    { name: 'analyze_image', label: '图片分析', status: 'success', at: 123 },
  ])
  assert.deepEqual(message.toolResultsSummary, ['已识别鞋子'])
})

test('mapMessage falls back to normalized meta attachments when message attachments are absent', () => {
  const message = mapMessage({
    id: 2,
    role: 'user',
    content: '[图片消息]',
    message_type: 'image',
    meta: {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/png',
          name: 'shoe.png',
          dataUrl: 'data:image/png;base64,abc',
        },
      ],
    },
  })

  assert.deepEqual(message.attachments, [
    {
      type: 'image',
      mimeType: 'image/png',
      name: 'shoe.png',
      dataUrl: 'data:image/png;base64,abc',
    },
  ])
})

test('mapMessage keeps assistant attachment metadata and orders composite image before originals', () => {
  const message = mapMessage({
    id: 3,
    role: 'assistant',
    content: '这是你要看的图片',
    message_type: 'chat',
    meta: {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: '白衬衫',
          dataUrl: 'data:image/jpeg;base64,cloth',
          source: 'wardrobe',
          variant: 'original',
          objectType: 'cloth',
          objectId: 23,
        },
        {
          type: 'image',
          mimeType: 'image/svg+xml',
          name: '通勤搭配',
          dataUrl: 'data:image/svg+xml;base64,cover',
          source: 'composite',
          variant: 'composite',
          objectType: 'recommendation',
          objectId: 18,
        },
      ],
    },
  })

  assert.deepEqual(message.attachments, [
    {
      type: 'image',
      mimeType: 'image/svg+xml',
      name: '通勤搭配',
      dataUrl: 'data:image/svg+xml;base64,cover',
      source: 'composite',
      variant: 'composite',
      objectType: 'recommendation',
      objectId: 18,
    },
    {
      type: 'image',
      mimeType: 'image/jpeg',
      name: '白衬衫',
      dataUrl: 'data:image/jpeg;base64,cloth',
      source: 'wardrobe',
      variant: 'original',
      objectType: 'cloth',
      objectId: 23,
    },
  ])
})
