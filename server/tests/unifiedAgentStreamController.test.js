const test = require('node:test')
const assert = require('node:assert/strict')

const controllerModulePath = require.resolve('../controllers/unifiedAgentRuntime')
const deepseekModulePath = require.resolve('../utils/deepseekClient')
const llmErrorModulePath = require.resolve('../utils/llmError')
const promptModulePath = require.resolve('../utils/aichatPrompt')
const sseModulePath = require.resolve('../utils/sseHelpers')
const orchestratorModulePath = require.resolve('../controllers/agentOrchestrator')
const profileModulePath = require.resolve('../controllers/profileInsights')
const agentModulePath = require.resolve('../controllers/agent')
const fallbackModulePath = require.resolve('../controllers/legacyTaskFallbackService')
const toolRegistryModulePath = require.resolve('../utils/toolRegistry')
const autonomousRuntimeModulePath = require.resolve('../agent/tools/runtime/autonomousToolRuntime')
const sessionsModulePath = require.resolve('../controllers/unifiedAgentSessions')
const memoryModulePath = require.resolve('../controllers/unifiedAgentMemory')
const helpersModulePath = require.resolve('../controllers/unifiedAgent.helpers')
const multimodalModulePath = require.resolve('../utils/unifiedAgentMultimodal')

const originalCaches = new Map(
  [
    controllerModulePath,
    deepseekModulePath,
    llmErrorModulePath,
    promptModulePath,
    sseModulePath,
    orchestratorModulePath,
    profileModulePath,
    agentModulePath,
    fallbackModulePath,
    toolRegistryModulePath,
    autonomousRuntimeModulePath,
    sessionsModulePath,
    memoryModulePath,
    helpersModulePath,
    multimodalModulePath,
  ].map((path) => [path, require.cache[path]])
)

test('sendUnifiedAgentMessageStream emits no terminal event when autonomous runtime aborts after client disconnect', async () => {
  const sseEvents = []
  const appendedMessages = []

  require.cache[deepseekModulePath] = {
    exports: {
      createChatCompletion: async () => {
        throw new Error('should not call createChatCompletion in this test')
      },
    },
  }
  require.cache[llmErrorModulePath] = {
    exports: {
      normalizeLlmError: (error) => error,
    },
  }
  require.cache[promptModulePath] = {
    exports: {
      buildSystemPrompt: () => 'system-prompt',
      isProjectIntent: () => false,
    },
  }
  require.cache[sseModulePath] = {
    exports: {
      writeSse: (_res, data) => sseEvents.push(data),
      endSse: (_res) => sseEvents.push({ type: 'ended' }),
    },
  }
  require.cache[orchestratorModulePath] = {
    exports: {
      runAgentWorkflow: async () => null,
    },
  }
  require.cache[profileModulePath] = {
    exports: {
      getProfileInsight: async () => 'profile',
    },
  }
  require.cache[agentModulePath] = {
    exports: {
      executeAgentTask: async () => null,
      executeAgentToolIntent: async () => null,
      confirmAgentTask: async () => ({}),
      cancelAgentTask: async () => ({}),
    },
  }
  require.cache[fallbackModulePath] = {
    exports: {
      resolveWriteActionOptions: () => null,
    },
  }
  require.cache[toolRegistryModulePath] = {
    exports: {
      executeTool: async () => ({}),
    },
  }
  require.cache[autonomousRuntimeModulePath] = {
    exports: {
      defaultStreamAssistantTurn: async () => ({}),
      runAutonomousToolLoop: async ({ emit }) => {
        emit({ type: 'reasoning', text: '先查一下' })
        emit({ type: 'tool_call_started', tool: 'list_clothes' })
        emit({ type: 'tool_call_completed', tool: 'list_clothes', ok: true })
        return { kind: 'aborted', reasoningContent: '先查一下' }
      },
    },
  }
  require.cache[sessionsModulePath] = {
    exports: {
      appendMessage: async (_userId, _sessionId, payload) => {
        appendedMessages.push(payload)
        return { id: appendedMessages.length, ...payload }
      },
      createSession: async () => ({}),
      findLatestSessionByTitle: async () => null,
      getSessionById: async () => ({
        id: 9,
        title: '新会话',
      }),
      listMessagesForSession: async () => [],
      listSessionsForUser: async () => [],
      updateSessionMeta: async () => ({}),
    },
  }
  require.cache[memoryModulePath] = {
    exports: {
      getSessionMemory: async () => null,
      upsertSessionMemory: async () => null,
    },
  }
  require.cache[helpersModulePath] = {
    exports: {
      buildAssistantActionButton: () => null,
      buildRecentMessagesWindow: (messages) => ({ recentMessages: messages }),
      buildSessionRestorePayload: ({ session, messages, sessionMemory, preferenceSummary }) => ({
        session,
        recent_messages: messages,
        session_memory: sessionMemory,
        preference_summary: preferenceSummary,
      }),
      buildUnifiedMessagesForModel: () => [{ role: 'system', content: 'prompt' }],
      deriveSessionTitle: () => '测试标题',
      sanitizeAssistantReply: (reply) => reply,
      tryParseStructuredMemoryPayload: () => ({ ok: false }),
      summarizeSessionMemoryFromMessages: () => null,
    },
  }
  require.cache[multimodalModulePath] = {
    exports: {
      buildMultimodalPrompt: ({ text }) => text,
      buildUserMessageContent: ({ text }) => text,
      getUserMessageType: () => 'chat',
      normalizeAttachments: (attachments) => attachments,
    },
  }

  delete require.cache[controllerModulePath]
  const { sendUnifiedAgentMessageStream } = require('../controllers/unifiedAgentRuntime')

  const ctx = {
    res: {},
  }

  try {
    await sendUnifiedAgentMessageStream(1, 9, '看看鞋子', ctx, {
      enableAutonomousTools: true,
      attachments: [],
      isClientGone: (() => {
        let calls = 0
        return () => {
          calls += 1
          return calls >= 2
        }
      })(),
    })

    assert.equal(appendedMessages.length, 1)
    assert.equal(appendedMessages[0].role, 'user')
    assert.deepEqual(
      sseEvents.map((event) => event.type),
      ['meta', 'reasoning', 'tool_call_started', 'tool_call_completed', 'ended']
    )
  } finally {
    delete require.cache[controllerModulePath]
    for (const [modulePath, cached] of originalCaches.entries()) {
      if (cached) require.cache[modulePath] = cached
      else delete require.cache[modulePath]
    }
  }
})
