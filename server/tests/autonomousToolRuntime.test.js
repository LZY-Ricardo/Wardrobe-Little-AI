const test = require('node:test')
const assert = require('node:assert/strict')

const { runAutonomousToolLoop, __testables } = require('../agent/tools/runtime/autonomousToolRuntime')

test('runAutonomousToolLoop streams reasoning and content when streamAssistantTurn is available', async () => {
  const emitted = []
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '你好',
    intent: 'clothing',
    messages: [{ role: 'user', content: '你好' }],
    multimodal: { attachments: [] },
    deps: {
      streamAssistantTurn: async ({ onReasoning, onContent }) => {
        onReasoning('先分析')
        onContent('这是')
        onContent('回复')
        return {
          role: 'assistant',
          content: '这是回复',
          reasoning_content: '先分析',
        }
      },
    },
    emit: (event) => emitted.push(event),
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.deepEqual(emitted, [
    { type: 'reasoning', text: '先分析' },
    { type: 'content', text: '这是' },
    { type: 'content', text: '回复' },
  ])
  assert.equal(result.kind, 'reply')
  assert.equal(result.reply, '这是回复')
  assert.equal(result.reasoningContent, '先分析')
})

test('runAutonomousToolLoop emits tool events and continues streaming after tool calls', async () => {
  const emitted = []
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '看看我的鞋子',
    intent: 'clothing',
    messages: [{ role: 'user', content: '看看我的鞋子' }],
    multimodal: { attachments: [] },
    deps: {
      streamAssistantTurn: async ({ onReasoning, onContent, messages }) => {
        turn += 1
        if (turn === 1) {
          onReasoning('先查一下')
          onContent('我先帮你看看')
          return {
            role: 'assistant',
            content: '我先帮你看看',
            reasoning_content: '先查一下',
            tool_calls: [
              {
                id: 'tool-read-1',
                type: 'function',
                function: {
                  name: 'list_clothes',
                  arguments: JSON.stringify({ type: '鞋', limit: 10 }),
                },
              },
            ],
          }
        }
        assert.equal(messages[messages.length - 1].role, 'tool')
        onReasoning('整理结果')
        onContent('你现在有 2 双鞋')
        return {
          role: 'assistant',
          content: '你现在有 2 双鞋',
          reasoning_content: '整理结果',
        }
      },
      executeTool: async () => ({
        total: 2,
        items: [{ name: '白鞋' }, { name: '黑鞋' }],
      }),
    },
    emit: (event) => emitted.push(event),
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'reply')
  assert.equal(result.reply, '你现在有 2 双鞋')
  assert.equal(result.reasoningContent, '先查一下整理结果')
  assert.deepEqual(
    emitted.map((event) => event.type),
    ['reasoning', 'content', 'tool_call_started', 'tool_call_completed', 'reasoning', 'content']
  )
})

test('runAutonomousToolLoop falls back to a safe reply when tool succeeds but final assistant reply is empty', async () => {
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '把这件白色帆布鞋删除掉',
    intent: 'clothing',
    messages: [{ role: 'user', content: '把这件白色帆布鞋删除掉' }],
    multimodal: { attachments: [] },
    latestTask: {
      selectedCloth: {
        cloth_id: 12,
        name: '白色帆布鞋',
      },
    },
    deps: {
      streamAssistantTurn: async ({ messages }) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '我先确认一下当前这件衣物',
            tool_calls: [
              {
                id: 'tool-read-cloth-1',
                type: 'function',
                function: {
                  name: 'get_cloth_detail',
                  arguments: JSON.stringify({ cloth_id: 12 }),
                },
              },
            ],
          }
        }
        assert.equal(messages[messages.length - 1].role, 'tool')
        return {
          role: 'assistant',
          content: '```json\n{}\n```',
        }
      },
      executeTool: async () => ({
        cloth_id: 12,
        name: '白色帆布鞋',
        type: '鞋类 / 帆布鞋',
      }),
    },
    emit: () => {},
    sanitizeAssistantReply: () => '',
  })

  assert.equal(result.kind, 'reply')
  assert.match(result.reply, /已读取“白色帆布鞋”详情/)
  assert.match(result.reply, /继续删除/)
})

test('streamAssistantTurnFromCompletion parses DeepSeek streaming tool call deltas', async () => {
  const reasoningChunks = []
  const contentChunks = []
  const stream = (async function * createStream() {
    yield Buffer.from('data: {"choices":[{"delta":{"reasoning_content":"先判断"}}]}\n')
    yield Buffer.from('data: {"choices":[{"delta":{"content":"我先看下"}}]}\n')
    yield Buffer.from('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"list_clothes","arguments":"{\\"type\\":\\"鞋\\""}}]}}]}\n')
    yield Buffer.from('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"limit\\":10}"}}]}}]}\n')
    yield Buffer.from('data: [DONE]\n')
  })()

  const assistantMessage = await __testables.streamAssistantTurnFromCompletion({
    messages: [{ role: 'user', content: '看看鞋子' }],
    tools: [],
    onReasoning: (text) => reasoningChunks.push(text),
    onContent: (text) => contentChunks.push(text),
    isClientGone: () => false,
    createChatCompletionImpl: async () => ({ data: stream }),
  })

  assert.deepEqual(reasoningChunks, ['先判断'])
  assert.deepEqual(contentChunks, ['我先看下'])
  assert.equal(assistantMessage.reasoning_content, '先判断')
  assert.equal(assistantMessage.content, '我先看下')
  assert.deepEqual(assistantMessage.tool_calls, [
    {
      id: 'call_1',
      type: 'function',
      function: {
        name: 'list_clothes',
        arguments: '{"type":"鞋","limit":10}',
      },
    },
  ])
})

test('runAutonomousToolLoop aborts when client disconnects during tool execution', async () => {
  const emitted = []
  let disconnected = false
  let turn = 0

  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '帮我看看鞋子',
    intent: 'clothing',
    messages: [{ role: 'user', content: '帮我看看鞋子' }],
    multimodal: { attachments: [] },
    deps: {
      isClientGone: () => disconnected,
      streamAssistantTurn: async ({ onReasoning }) => {
        turn += 1
        onReasoning('先查一下')
        return {
          role: 'assistant',
          content: '',
          reasoning_content: '先查一下',
          tool_calls: [
            {
              id: 'tool-read-1',
              type: 'function',
              function: {
                name: 'list_clothes',
                arguments: JSON.stringify({ type: '鞋', limit: 10 }),
              },
            },
          ],
        }
      },
      executeTool: async () => {
        disconnected = true
        return { total: 2 }
      },
    },
    emit: (event) => emitted.push(event),
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'aborted')
  assert.equal(turn, 1)
  assert.deepEqual(
    emitted.map((event) => event.type),
    ['reasoning', 'tool_call_started', 'tool_call_completed']
  )
})

test('runAutonomousToolLoop stops after max autonomous tool rounds budget is exhausted', async () => {
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '不断调用工具',
    intent: 'clothing',
    messages: [{ role: 'user', content: '不断调用工具' }],
    multimodal: { attachments: [] },
    deps: {
      streamAssistantTurn: async () => {
        turn += 1
        return {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `tool-read-${turn}`,
              type: 'function',
              function: {
                name: 'list_clothes',
                arguments: JSON.stringify({ limit: 1 }),
              },
            },
          ],
        }
      },
      executeTool: async () => ({ ok: true }),
    },
    emit: () => {},
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result, null)
  assert.equal(turn, 4)
})

test('runAutonomousToolLoop stops when total duration budget is exhausted', async () => {
  let turn = 0
  let nowTick = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '不断调用工具',
    intent: 'clothing',
    messages: [{ role: 'user', content: '不断调用工具' }],
    multimodal: { attachments: [] },
    deps: {
      autonomousMaxDurationMs: 15,
      now: () => {
        nowTick += 10
        return nowTick
      },
      streamAssistantTurn: async () => {
        turn += 1
        return {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `tool-read-${turn}`,
              type: 'function',
              function: {
                name: 'list_clothes',
                arguments: JSON.stringify({ limit: 1 }),
              },
            },
          ],
        }
      },
      executeTool: async () => ({ ok: true }),
    },
    emit: () => {},
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result, null)
  assert.equal(turn, 1)
})

test('buildLatestTaskContextMessage injects recommendation history context', () => {
  const message = __testables.buildLatestTaskContextMessage({
    recommendationHistory: {
      id: 9,
      scene: '科技园',
      adopted: 1,
      saved_as_suit: 1,
      saved_as_outfit_log: 0,
      trigger_source: 'recommend-page',
      feedback_result: 'like',
      feedback_reason_tags: ['颜色不喜欢'],
      feedback_note: '整体不错',
    },
  })

  assert.match(message, /当前推荐历史上下文/)
  assert.match(message, /"id":9/)
  assert.match(message, /"scene":"科技园"/)
  assert.match(message, /"saved_as_suit":1/)
  assert.match(message, /"feedback_result":"like"/)
})

test('buildLatestTaskContextMessage injects manual suit draft context', () => {
  const message = __testables.buildLatestTaskContextMessage({
    manualSuitDraft: {
      name: '通勤搭配',
      scene: '搭配中心',
      description: '白衬衫 + 黑裤子',
      source: 'match-page',
      items: [11, 22],
    },
  })

  assert.match(message, /当前搭配草稿上下文/)
  assert.match(message, /"scene":"搭配中心"/)
  assert.match(message, /"items":\[11,22\]/)
})

test('buildLatestTaskContextMessage injects wardrobe analytics context', () => {
  const message = __testables.buildLatestTaskContextMessage({
    latestAnalytics: {
      totalClothes: 18,
      recommendationSummary: {
        total: 5,
        adopted: 2,
      },
      styleDistribution: [{ label: '通勤', count: 6 }],
    },
  })

  assert.match(message, /当前衣橱分析上下文/)
  assert.match(message, /"totalClothes":18/)
  assert.match(message, /"adopted":2/)
  assert.match(message, /"styleDistribution":\[/)
})

test('buildLatestTaskContextMessage injects weather context', () => {
  const message = __testables.buildLatestTaskContextMessage({
    latestWeather: {
      city: '上海',
      temp: '24°C',
      text: '多云',
      adviceTags: ['舒适'],
    },
  })

  assert.match(message, /当前天气上下文/)
  assert.match(message, /"city":"上海"/)
  assert.match(message, /"temp":"24°C"/)
})

test('buildLatestTaskContextMessage injects style profile context', () => {
  const message = __testables.buildLatestTaskContextMessage({
    styleProfile: {
      city: '南昌',
      style: '通勤 \/ 简约',
      scenes: '上班 \/ 出行',
      topSize: 'M',
      clothesCount: 12,
    },
  })

  assert.match(message, /当前穿搭档案上下文/)
  assert.match(message, /"city":"南昌"/)
  assert.match(message, /"topSize":"M"/)
  assert.match(message, /"clothesCount":12/)
})

test('runAutonomousToolLoop converts timed out tool execution into tool error and continues next turn', async () => {
  const emitted = []
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '看看我的鞋子',
    intent: 'clothing',
    messages: [{ role: 'user', content: '看看我的鞋子' }],
    multimodal: { attachments: [] },
    deps: {
      toolExecutionTimeoutMs: 5,
      streamAssistantTurn: async ({ messages }) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-read-timeout',
                type: 'function',
                function: {
                  name: 'list_clothes',
                  arguments: JSON.stringify({ type: '鞋', limit: 10 }),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        assert.match(toolMessage.content, /TOOL_TIMEOUT/)
        return {
          role: 'assistant',
          content: '工具超时了，我先给你保守答复。',
        }
      },
      executeTool: async () => new Promise(() => {}),
    },
    emit: (event) => emitted.push(event),
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'reply')
  assert.equal(result.reply, '工具超时了，我先给你保守答复。')
  assert.deepEqual(
    emitted.map((event) => event.type),
    ['tool_call_started', 'tool_call_completed']
  )
  assert.equal(emitted[1].ok, false)
  assert.match(emitted[1].summary, /工具执行超时/)
})

test('resolveToolExecutionTimeoutMs gives image tool a longer default budget', () => {
  const imageTimeout = __testables.resolveToolExecutionTimeoutMs('analyze_image', {})
  const normalTimeout = __testables.resolveToolExecutionTimeoutMs('list_clothes', {})

  assert.ok(imageTimeout >= normalTimeout)
  assert.ok(imageTimeout >= 65000)
})
