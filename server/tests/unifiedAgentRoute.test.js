const test = require('node:test')
const assert = require('node:assert/strict')

const runtimeModulePath = require.resolve('../controllers/unifiedAgentRuntime')
const jwtModulePath = require.resolve('../utils/jwt')
const sseModulePath = require.resolve('../utils/sseHelpers')
const sseEventsModulePath = require.resolve('../utils/unifiedAgentSseEvents')
const routeModulePath = require.resolve('../routes/unifiedAgent')

const originalRuntimeModule = require.cache[runtimeModulePath]
const originalJwtModule = require.cache[jwtModulePath]
const originalSseModule = require.cache[sseModulePath]
const originalSseEventsModule = require.cache[sseEventsModulePath]

test('chat-stream route keeps autonomous tools enabled for streaming runtime', async () => {
  let capturedDeps = null

  require.cache[runtimeModulePath] = {
    exports: {
      appendAgentMessage: async () => ({}),
      cancelUnifiedAgentAction: async () => ({}),
      confirmUnifiedAgentAction: async () => ({}),
      createAgentSession: async () => ({}),
      listAgentSessions: async () => ([]),
      restoreAgentSession: async () => ({}),
      sendUnifiedAgentMessage: async () => ({}),
      sendUnifiedAgentMessageStream: async (_userId, _sessionId, _input, _ctx, deps) => {
        capturedDeps = deps
      },
      updateAgentSessionMemory: async () => ({}),
    },
  }

  require.cache[jwtModulePath] = {
    exports: {
      verify: () => async (ctx, next) => {
        ctx.userId = 123
        await next()
      },
    },
  }

  require.cache[sseModulePath] = {
    exports: {
      setSseHeaders: () => {},
    },
  }

  delete require.cache[routeModulePath]
  const router = require('../routes/unifiedAgent')
  const middleware = router.routes()

  const ctx = {
    method: 'POST',
    path: '/unified-agent/sessions/42/chat-stream',
    request: {
      body: {
        input: '你好',
        attachments: [],
      },
    },
    req: {
      on: () => {},
    },
    res: {},
  }

  try {
    await middleware(ctx, async () => {})
    assert.ok(capturedDeps, 'expected sendUnifiedAgentMessageStream to be called')
    assert.equal(capturedDeps.enableAutonomousTools, true)
  } finally {
    delete require.cache[routeModulePath]
    if (originalRuntimeModule) require.cache[runtimeModulePath] = originalRuntimeModule
    else delete require.cache[runtimeModulePath]
    if (originalJwtModule) require.cache[jwtModulePath] = originalJwtModule
    else delete require.cache[jwtModulePath]
    if (originalSseModule) require.cache[sseModulePath] = originalSseModule
    else delete require.cache[sseModulePath]
  }
})

test('chat-stream route emits sse error event when runtime throws after headers are sent', async () => {
  const written = []
  let ended = false

  require.cache[runtimeModulePath] = {
    exports: {
      appendAgentMessage: async () => ({}),
      cancelUnifiedAgentAction: async () => ({}),
      confirmUnifiedAgentAction: async () => ({}),
      createAgentSession: async () => ({}),
      listAgentSessions: async () => ([]),
      restoreAgentSession: async () => ({}),
      sendUnifiedAgentMessage: async () => ({}),
      sendUnifiedAgentMessageStream: async () => {
        throw new Error('STREAM_BROKEN')
      },
      updateAgentSessionMemory: async () => ({}),
    },
  }

  require.cache[jwtModulePath] = {
    exports: {
      verify: () => async (ctx, next) => {
        ctx.userId = 123
        await next()
      },
    },
  }

  require.cache[sseModulePath] = {
    exports: {
      setSseHeaders: (res) => {
        res.headersSent = true
      },
      writeSse: (_res, data) => written.push(data),
      endSse: () => {
        ended = true
      },
    },
  }

  require.cache[sseEventsModulePath] = {
    exports: {
      buildErrorEvent: (msg) => ({ type: 'error', msg }),
    },
  }

  delete require.cache[routeModulePath]
  const router = require('../routes/unifiedAgent')
  const middleware = router.routes()

  const ctx = {
    method: 'POST',
    path: '/unified-agent/sessions/42/chat-stream',
    request: {
      body: {
        input: '你好',
        attachments: [],
      },
    },
    req: {
      on: () => {},
    },
    res: {
      headersSent: false,
    },
  }

  try {
    await middleware(ctx, async () => {})
    assert.deepEqual(written, [{ type: 'error', msg: 'STREAM_BROKEN' }])
    assert.equal(ended, true)
  } finally {
    delete require.cache[routeModulePath]
    if (originalRuntimeModule) require.cache[runtimeModulePath] = originalRuntimeModule
    else delete require.cache[runtimeModulePath]
    if (originalJwtModule) require.cache[jwtModulePath] = originalJwtModule
    else delete require.cache[jwtModulePath]
    if (originalSseModule) require.cache[sseModulePath] = originalSseModule
    else delete require.cache[sseModulePath]
    if (originalSseEventsModule) require.cache[sseEventsModulePath] = originalSseEventsModule
    else delete require.cache[sseEventsModulePath]
  }
})
