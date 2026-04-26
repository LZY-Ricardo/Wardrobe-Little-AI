import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveSessionBootstrapState,
  resolveInitialLatestTask,
  resolveInitialPendingImages,
  resolveConfirmedSessionState,
  resolveLoadedSessionState,
  shouldRestorePrefillInput,
} from './sessionState.js'

test('resolveSessionBootstrapState treats bare chat route as a blank new session', () => {
  assert.deepEqual(resolveSessionBootstrapState({
    sessionId: Number.NaN,
    hasSessionIdQuery: false,
    initialLatestTask: { latestWeather: { city: '抚州' } },
  }), {
    mode: 'blank-session',
    session: null,
    messages: [],
    pendingConfirmation: null,
    latestTask: { latestWeather: { city: '抚州' } },
  })
})

test('resolveSessionBootstrapState keeps explicit invalid session links in error mode', () => {
  assert.deepEqual(resolveSessionBootstrapState({
    sessionId: Number.NaN,
    hasSessionIdQuery: true,
    initialLatestTask: null,
  }), {
    mode: 'invalid-session',
    error: '会话不存在',
  })
})

test('resolveLoadedSessionState restores pending confirmation from the latest assistant message', () => {
  const result = resolveLoadedSessionState({
    payload: {
      session: { id: 1, title: '测试会话' },
      recent_messages: [
        {
          id: 1,
          role: 'assistant',
          content: '待确认',
          message_type: 'confirm_request',
          meta: {
            pendingConfirmation: {
              confirmId: 'abc123',
              actionLabel: '保存到衣橱',
            },
          },
        },
      ],
    },
    fallbackSession: { id: 99, title: 'fallback' },
    initialLatestTask: { selectedCloth: { cloth_id: 8 } },
  })

  assert.equal(result.session.id, 1)
  assert.equal(result.messages.length, 1)
  assert.equal(result.pendingConfirmation?.confirmId, 'abc123')
  assert.equal(result.latestTask, null)
})

test('resolveLoadedSessionState falls back to initial latest task when no pending confirmation exists', () => {
  const result = resolveLoadedSessionState({
    payload: {
      recent_messages: [
        {
          id: 2,
          role: 'assistant',
          content: '普通回复',
          message_type: 'chat',
        },
      ],
    },
    fallbackSession: { id: 99, title: 'fallback' },
    initialLatestTask: { selectedCloth: { cloth_id: 8 } },
  })

  assert.equal(result.session.id, 99)
  assert.equal(result.pendingConfirmation, null)
  assert.deepEqual(result.latestTask, { selectedCloth: { cloth_id: 8 } })
})

test('resolveLoadedSessionState restores latest task from the latest assistant message meta', () => {
  const result = resolveLoadedSessionState({
    payload: {
      recent_messages: [
        {
          id: 2,
          role: 'assistant',
          content: '已将“黑色运动短裤”保存到衣橱',
          message_type: 'confirm_result',
          meta: {
            latestTask: {
              taskType: 'create_cloth',
              status: 'success',
              selectedCloth: {
                cloth_id: 18,
                name: '黑色运动短裤',
                image: 'data:image/jpeg;base64,abc',
              },
            },
          },
        },
      ],
    },
    fallbackSession: { id: 99, title: 'fallback' },
    initialLatestTask: null,
  })

  assert.equal(result.pendingConfirmation, null)
  assert.deepEqual(result.latestTask, {
    taskType: 'create_cloth',
    status: 'success',
    selectedCloth: {
      cloth_id: 18,
      name: '黑色运动短裤',
      image: 'data:image/jpeg;base64,abc',
    },
  })
})

test('resolveConfirmedSessionState restores session messages and clears pending confirmation', () => {
  const result = resolveConfirmedSessionState({
    payload: {
      restored: {
        session: { id: 5, title: '确认后会话' },
        recent_messages: [
          {
            id: 3,
            role: 'assistant',
            content: '已保存',
            message_type: 'confirm_result',
          },
        ],
      },
      latest_task: { taskType: 'create_cloth', status: 'success' },
    },
    fallbackSession: { id: 99, title: 'fallback' },
  })

  assert.equal(result.session.id, 5)
  assert.equal(result.messages[0].content, '已保存')
  assert.deepEqual(result.latestTask, { taskType: 'create_cloth', status: 'success' })
  assert.equal(result.pendingConfirmation, null)
})

test('resolveInitialLatestTask restores recommendation history context from page state', () => {
  const result = resolveInitialLatestTask({
    agentContext: {
      focus: {
        type: 'recommendationHistory',
        entity: {
          id: 12,
          scene: '科技园',
          adopted: 1,
          saved_as_suit: 0,
          saved_as_outfit_log: 1,
          feedback_result: 'like',
        },
      },
    },
  })

  assert.deepEqual(result, {
    recommendationHistory: {
      id: 12,
      scene: '科技园',
      adopted: 1,
      saved_as_suit: 0,
      saved_as_outfit_log: 1,
      feedback_result: 'like',
    },
  })
})

test('resolveInitialLatestTask prefers latestResult when both latestResult and page object exist', () => {
  const result = resolveInitialLatestTask({
    agentContext: {
      latestTask: {
        taskType: 'recommendation',
        result: { recommendationHistoryId: 18 },
      },
      focus: {
        type: 'recommendationHistory',
        entity: {
          id: 18,
          scene: '通勤',
        },
      },
    },
  })

  assert.deepEqual(result, {
    taskType: 'recommendation',
    result: { recommendationHistoryId: 18 },
  })
})

test('resolveInitialLatestTask restores analytics context from page state', () => {
  const result = resolveInitialLatestTask({
    agentContext: {
      insight: {
        type: 'analytics',
        entity: {
          totalClothes: 24,
          recommendationSummary: {
            total: 8,
            adopted: 3,
          },
        },
      },
    },
  })

  assert.deepEqual(result, {
    latestAnalytics: {
      totalClothes: 24,
      recommendationSummary: {
        total: 8,
        adopted: 3,
      },
    },
  })
})

test('resolveInitialPendingImages restores valid image attachments from page state', () => {
  const result = resolveInitialPendingImages({
    agentContext: {
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'shoe.jpg',
          dataUrl: 'data:image/jpeg;base64,abc',
        },
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'broken.jpg',
          dataUrl: 'https://example.com/a.jpg',
        },
      ],
    },
  })

  assert.deepEqual(result, [
    {
      type: 'image',
      mimeType: 'image/jpeg',
      name: 'shoe.jpg',
      dataUrl: 'data:image/jpeg;base64,abc',
    },
  ])
})

test('resolveInitialLatestTask restores weather context from page state', () => {
  const result = resolveInitialLatestTask({
    agentContext: {
      insight: {
        type: 'weather',
        entity: {
          city: '上海',
          temp: '24°C',
          text: '多云',
        },
      },
    },
  })

  assert.deepEqual(result, {
    latestWeather: {
      city: '上海',
      temp: '24°C',
      text: '多云',
    },
  })
})

test('resolveInitialLatestTask restores style profile context from page state', () => {
  const result = resolveInitialLatestTask({
    agentContext: {
      insight: {
        type: 'styleProfile',
        entity: {
          city: '南昌',
          style: '通勤 / 简约',
          scenes: '上班 / 出行',
          topSize: 'M',
        },
      },
    },
  })

  assert.deepEqual(result, {
    styleProfile: {
      city: '南昌',
      style: '通勤 / 简约',
      scenes: '上班 / 出行',
      topSize: 'M',
    },
  })
})

test('resolveInitialLatestTask still supports legacy fields for backward compatibility', () => {
  const result = resolveInitialLatestTask({
    selectedCloth: {
      cloth_id: 88,
      name: '白色卫衣',
    },
  })

  assert.deepEqual(result, {
    selectedCloth: {
      cloth_id: 88,
      name: '白色卫衣',
    },
  })
})

test('shouldRestorePrefillInput returns true for first successful empty session bootstrap', () => {
  assert.equal(shouldRestorePrefillInput({
    prefillText: '继续处理当前搭配',
    status: 'success',
    input: '',
    displayedMessageCount: 0,
  }), true)
})

test('shouldRestorePrefillInput returns false when returning to a session with existing messages', () => {
  assert.equal(shouldRestorePrefillInput({
    prefillText: '继续处理当前搭配',
    status: 'success',
    input: '',
    displayedMessageCount: 3,
  }), false)
})

test('shouldRestorePrefillInput returns false when user has already typed something', () => {
  assert.equal(shouldRestorePrefillInput({
    prefillText: '继续处理当前搭配',
    status: 'success',
    input: '我已经开始输入了',
    displayedMessageCount: 0,
  }), false)
})
