import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveLoadedSessionState } from './sessionState.js'
import {
  buildToolCallTimeline,
  buildToolSummaryList,
  getConfirmationTitle,
  getDisplayMessageText,
} from './viewModels.js'

test('restored assistant message can recover confirmation card, tool timeline and clean display text', () => {
  const result = resolveLoadedSessionState({
    payload: {
      session: { id: 7, title: '鞋子录入' },
      recent_messages: [
        {
          id: 1,
          role: 'assistant',
          content: [
            '已识别这双鞋，准备帮你存入衣橱。',
            '',
            '```json',
            '{"internal":"debug-only"}',
            '```',
          ].join('\n'),
          message_type: 'confirm_request',
          confirmation_status: 'pending',
          task_id: 99,
          meta: {
            reasoningContent: '先分析图片再生成待确认操作',
            pendingConfirmation: {
              confirmId: 'confirm-99',
              actionLabel: '保存到衣橱',
              summary: '即将新增一件鞋类衣物',
              targetPage: {
                key: 'wardrobe',
                label: '虚拟衣柜',
                to: '/outfit',
              },
              details: {
                name: '白色运动鞋',
                type: '鞋类',
                color: '白色',
                season: '春秋',
              },
            },
            toolCalls: [
              {
                name: 'analyze_image',
                label: '图片分析',
                status: 'success',
                at: 123,
              },
              {
                name: 'create_cloth',
                label: '保存衣物',
                status: 'staged',
                at: 456,
              },
            ],
            toolResultsSummary: [
              '识别到一双白色运动鞋',
              '已生成待确认保存操作',
            ],
          },
        },
      ],
    },
  })

  assert.equal(result.session.id, 7)
  assert.equal(result.pendingConfirmation?.confirmId, 'confirm-99')

  const message = result.messages[0]
  assert.equal(getDisplayMessageText(message), '已识别这双鞋，准备帮你存入衣橱。')
  assert.equal(getConfirmationTitle(message.pendingConfirmation), '保存到衣橱')
  assert.deepEqual(buildToolCallTimeline(message), [
    {
      id: 'analyze_image-123',
      name: 'analyze_image',
      label: '图片分析',
      status: 'success',
    },
    {
      id: 'create_cloth-456',
      name: 'create_cloth',
      label: '保存衣物',
      status: 'staged',
    },
  ])
  assert.deepEqual(buildToolSummaryList(message), [
    '识别到一双白色运动鞋',
    '已生成待确认保存操作',
  ])
})

test('restored assistant message keeps image attachments for gallery rendering', () => {
  const result = resolveLoadedSessionState({
    payload: {
      session: { id: 8, title: '通勤搭配' },
      recent_messages: [
        {
          id: 2,
          role: 'assistant',
          content: '这是刚才那套的图片',
          message_type: 'task_result',
          meta: {
            attachments: [
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
            ],
          },
        },
      ],
    },
  })

  assert.equal(result.messages[0].attachments.length, 2)
  assert.equal(result.messages[0].attachments[0].variant, 'composite')
  assert.equal(result.messages[0].attachments[1].objectId, 23)
})
