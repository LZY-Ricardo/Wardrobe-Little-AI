import test from 'node:test'
import assert from 'node:assert/strict'

import { extractCreatedSession } from './sessionBootstrap.js'

test('extractCreatedSession supports axios-interceptor style wrapped payload', () => {
  assert.deepEqual(
    extractCreatedSession({
      code: 1,
      data: {
        session: {
          id: 23,
          title: '新会话',
        },
      },
    }),
    {
      id: 23,
      title: '新会话',
    },
  )
})

test('extractCreatedSession still supports direct session payloads', () => {
  assert.deepEqual(
    extractCreatedSession({
      session: {
        id: 24,
        title: '直接返回',
      },
    }),
    {
      id: 24,
      title: '直接返回',
    },
  )
})

test('extractCreatedSession returns null for invalid payloads', () => {
  assert.equal(extractCreatedSession({ code: 0, msg: '失败' }), null)
  assert.equal(extractCreatedSession(null), null)
})
