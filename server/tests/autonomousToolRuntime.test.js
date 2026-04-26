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
  const originalWarn = console.warn
  console.warn = () => {}
  try {
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
  } finally {
    console.warn = originalWarn
  }
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

test('buildClientContextMessage injects local profile and geo context', () => {
  const message = __testables.buildClientContextMessage({
    profile: {
      city: '杭州',
      topSize: 'XL',
    },
    geo: {
      latitude: 30.2741,
      longitude: 120.1551,
    },
  })

  assert.match(message, /当前客户端上下文/)
  assert.match(message, /"city":"杭州"/)
  assert.match(message, /"topSize":"XL"/)
  assert.match(message, /"latitude":30.2741/)
  assert.match(message, /"longitude":120.1551/)
})

test('buildLatestTaskContextMessage supports standardized agentContext payload', () => {
  const message = __testables.buildLatestTaskContextMessage({
    agentContext: {
      focus: {
        type: 'recommendationHistory',
        entity: {
          id: 19,
          scene: '科技园',
          feedback_result: 'like',
        },
      },
    },
  })

  assert.match(message, /当前推荐历史上下文/)
  assert.match(message, /"id":19/)
  assert.match(message, /"scene":"科技园"/)
})

test('runAutonomousToolLoop exposes client context to assistant turn even without latestTask', async () => {
  let firstMessages = null
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '今天天气怎么样',
    intent: 'clothing',
    messages: [{ role: 'user', content: '今天天气怎么样' }],
    multimodal: { attachments: [] },
    deps: {
      clientContext: {
        profile: { city: '杭州' },
        geo: { latitude: 30.2741, longitude: 120.1551 },
      },
      requestAssistantTurn: async (messages) => {
        firstMessages = messages
        return {
          role: 'assistant',
          content: '我知道你当前城市是杭州。',
        }
      },
    },
    sanitizeAssistantReply: (reply) => reply,
  })

  const contextMessages = firstMessages.filter((item) => item.role === 'system').map((item) => item.content)
  assert.ok(contextMessages.some((content) => /当前客户端上下文/.test(content)))
  assert.ok(contextMessages.some((content) => /"city":"杭州"/.test(content)))
  assert.equal(result.kind, 'reply')
  assert.equal(result.reply, '我知道你当前城市是杭州。')
})

test('runAutonomousToolLoop converts timed out tool execution into tool error and continues next turn', async () => {
  const emitted = []
  let turn = 0
  const originalWarn = console.warn
  console.warn = () => {}
  try {
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
  } finally {
    console.warn = originalWarn
  }
})

test('resolveToolExecutionTimeoutMs gives image tool a longer default budget', () => {
  const imageTimeout = __testables.resolveToolExecutionTimeoutMs('analyze_image', {})
  const normalTimeout = __testables.resolveToolExecutionTimeoutMs('list_clothes', {})

  assert.ok(imageTimeout >= normalTimeout)
  assert.ok(imageTimeout >= 65000)
})

test('runAutonomousToolLoop can return media attachments when assistant explicitly calls show_context_images', async () => {
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '把刚刚存入衣橱的鞋子图片展示出来',
    intent: 'clothing',
    messages: [{ role: 'user', content: '把刚刚存入衣橱的鞋子图片展示出来' }],
    multimodal: { attachments: [] },
    latestTask: {
      taskType: 'create_cloth',
      result: {
        cloth_id: 1156,
        name: '白色帆布鞋',
        image: 'data:image/png;base64,shoe',
      },
    },
    deps: {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-show-image-1',
                type: 'function',
                function: {
                  name: 'show_context_images',
                  arguments: JSON.stringify({}),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        assert.match(toolMessage.content, /已准备当前衣物图片/)
        return {
          role: 'assistant',
          content: '已把当前衣物图片发给你。',
        }
      },
      executeTool: async () => ({
        kind: 'media_result',
        summary: '已准备当前衣物图片。',
        attachments: [
          {
            type: 'image',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,shoe',
            source: 'wardrobe',
            variant: 'original',
            objectType: 'cloth',
            objectId: 1156,
          },
        ],
      }),
    },
    emit: () => {},
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'reply')
  assert.match(result.reply, /已把当前衣物图片发给你/)
  assert.equal(result.attachments.length, 1)
  assert.equal(result.attachments[0].objectId, 1156)
})

test('runAutonomousToolLoop can return multiple cloth attachments when assistant calls show_clothes_images', async () => {
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '把这三双鞋子的图片都展示出来',
    intent: 'clothing',
    messages: [{ role: 'user', content: '把这三双鞋子的图片都展示出来' }],
    multimodal: { attachments: [] },
    latestTask: {
      taskType: 'closet_query',
      result: {
        total: 3,
        items: [
          { cloth_id: 21, name: '黑色高帮帆布鞋', type: '鞋子 / 帆布鞋', color: '黑色', hasImage: true },
          { cloth_id: 22, name: '黑色运动鞋', type: '鞋子 / 运动鞋', color: '黑色', hasImage: true },
          { cloth_id: 23, name: '黑色低帮帆布鞋', type: '鞋子 / 帆布鞋', color: '黑色', hasImage: true },
        ],
      },
    },
    deps: {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-show-many-images-1',
                type: 'function',
                function: {
                  name: 'show_clothes_images',
                  arguments: JSON.stringify({ cloth_ids: [21, 22, 23] }),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        assert.match(toolMessage.content, /已准备 3 张衣物图片/)
        return {
          role: 'assistant',
          content: '已把这三双鞋子的图片发给你。',
        }
      },
      executeTool: async () => ({
        kind: 'media_result',
        summary: '已准备 3 张衣物图片。',
        attachments: [
          {
            type: 'image',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,shoe-1',
            source: 'wardrobe',
            variant: 'original',
            objectType: 'cloth',
            objectId: 21,
          },
          {
            type: 'image',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,shoe-2',
            source: 'wardrobe',
            variant: 'original',
            objectType: 'cloth',
            objectId: 22,
          },
          {
            type: 'image',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,shoe-3',
            source: 'wardrobe',
            variant: 'original',
            objectType: 'cloth',
            objectId: 23,
          },
        ],
      }),
    },
    emit: () => {},
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'reply')
  assert.equal(result.attachments.length, 3)
  assert.deepEqual(result.attachments.map((item) => item.objectId), [21, 22, 23])
})

test('runAutonomousToolLoop preserves closet query context from read tools for follow-up image actions', async () => {
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '有没有黑色帆布鞋',
    intent: 'clothing',
    messages: [{ role: 'user', content: '有没有黑色帆布鞋' }],
    multimodal: { attachments: [] },
    deps: {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-read-canvas-shoes',
                type: 'function',
                function: {
                  name: 'list_clothes',
                  arguments: JSON.stringify({ type: '帆布鞋', limit: 10 }),
                },
              },
            ],
          }
        }
        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        assert.match(toolMessage.content, /"cloth_id":21/)
        return {
          role: 'assistant',
          content: '有 2 双黑色帆布鞋。',
        }
      },
      executeTool: async () => ({
        total: 2,
        items: [
          { cloth_id: 21, name: '黑色高帮帆布鞋', type: '鞋子 / 帆布鞋', color: '黑色', hasImage: true },
          { cloth_id: 23, name: '黑色低帮帆布鞋', type: '鞋子 / 帆布鞋', color: '黑色', hasImage: true },
        ],
      }),
    },
    emit: () => {},
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'reply')
  assert.equal(result.reply, '有 2 双黑色帆布鞋。')
  assert.equal(result.contextTask?.taskType, 'closet_query')
  assert.equal(result.contextTask?.result?.items?.length, 2)
})

test('runAutonomousToolLoop can continue after show_context_images and then generate outfit preview in the same turn', async () => {
  let turn = 0
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '根据我当前选中的这套搭配，先展示上衣和裤子，再生成真人预览图',
    intent: 'clothing',
    messages: [{ role: 'user', content: '根据我当前选中的这套搭配，先展示上衣和裤子，再生成真人预览图' }],
    multimodal: { attachments: [] },
    latestTask: {
      manualSuitDraft: {
        name: '白衬衫 + 绿裤子',
        scene: '搭配中心',
        source: 'match-page',
        items: [23, 28],
      },
    },
    deps: {
      requestAssistantTurn: async (messages) => {
        turn += 1
        if (turn === 1) {
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-show-look-images',
                type: 'function',
                function: {
                  name: 'show_context_images',
                  arguments: JSON.stringify({}),
                },
              },
            ],
          }
        }
        if (turn === 2) {
          const toolMessage = messages[messages.length - 1]
          assert.equal(toolMessage.role, 'tool')
          assert.match(toolMessage.content, /已准备当前套装图片/)
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-generate-look-preview',
                type: 'function',
                function: {
                  name: 'generate_outfit_preview',
                  arguments: JSON.stringify({}),
                },
              },
            ],
          }
        }

        const toolMessage = messages[messages.length - 1]
        assert.equal(toolMessage.role, 'tool')
        assert.match(toolMessage.content, /已生成当前搭配预览图/)
        return {
          role: 'assistant',
          content: '已把当前搭配的真人预览图生成好了。',
        }
      },
      executeTool: async (toolName) => {
        if (toolName === 'show_context_images') {
          return {
            kind: 'media_result',
            summary: '已准备当前套装图片。',
            attachments: [
              {
                type: 'image',
                mimeType: 'image/jpeg',
                dataUrl: 'data:image/jpeg;base64,shirt',
                source: 'wardrobe',
                variant: 'original',
                objectType: 'cloth',
                objectId: 23,
              },
              {
                type: 'image',
                mimeType: 'image/jpeg',
                dataUrl: 'data:image/jpeg;base64,pants',
                source: 'wardrobe',
                variant: 'original',
                objectType: 'cloth',
                objectId: 28,
              },
            ],
          }
        }

        if (toolName === 'generate_outfit_preview') {
          return {
            kind: 'media_result',
            summary: '已生成当前搭配预览图。',
            attachments: [
              {
                type: 'image',
                mimeType: 'image/png',
                dataUrl: 'data:image/png;base64,preview',
                source: 'preview',
                variant: 'generated',
                objectType: 'outfit_preview',
              },
            ],
          }
        }

        return { error: 'UNEXPECTED_TOOL' }
      },
    },
    emit: () => {},
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'reply')
  assert.equal(result.reply, '已把当前搭配的真人预览图生成好了。')
  assert.equal(result.attachments.length, 3)
  assert.equal(result.attachments[0].objectId, 23)
  assert.equal(result.attachments[1].objectId, 28)
  assert.equal(result.attachments[2].objectType, 'outfit_preview')
})

test('runAutonomousToolLoop falls back to tool summary when final assistant turn fails after successful media tool', async () => {
  let turn = 0
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    const result = await runAutonomousToolLoop({
      userId: 1,
      input: '把这两件衣物的图片发我',
      intent: 'clothing',
      messages: [{ role: 'user', content: '把这两件衣物的图片发我' }],
      multimodal: { attachments: [] },
      latestTask: {
        taskType: 'closet_query',
        result: {
          total: 2,
          items: [
            { cloth_id: 23, name: '白色衬衫上衣', type: '上衣 / 衬衫', color: '白色', hasImage: true },
            { cloth_id: 28, name: '绿色长裤', type: '下衣 / 长裤', color: '绿色', hasImage: true },
          ],
        },
      },
      deps: {
        requestAssistantTurn: async (messages) => {
          turn += 1
          if (turn === 1) {
            return {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'tool-show-selected-clothes',
                  type: 'function',
                  function: {
                    name: 'show_clothes_images',
                    arguments: JSON.stringify({ cloth_ids: [23, 28] }),
                  },
                },
              ],
            }
          }
          const error = new Error('DeepSeek unavailable')
          error.status = 503
          throw error
        },
        executeTool: async () => ({
          kind: 'media_result',
          summary: '已准备 2 张衣物图片。',
          attachments: [
            {
              type: 'image',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,shirt',
              source: 'wardrobe',
              variant: 'original',
              objectType: 'cloth',
              objectId: 23,
            },
            {
              type: 'image',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,pants',
              source: 'wardrobe',
              variant: 'original',
              objectType: 'cloth',
              objectId: 28,
            },
          ],
        }),
      },
      emit: () => {},
      sanitizeAssistantReply: (reply) => reply,
    })

    assert.equal(result.kind, 'reply')
    assert.match(result.reply, /已准备 2 张衣物图片/)
    assert.equal(result.attachments.length, 2)
    assert.deepEqual(result.attachments.map((item) => item.objectId), [23, 28])
  } finally {
    console.warn = originalWarn
  }
})

test('runAutonomousToolLoop upgrades generate_scene_suits into recommendation task context', async () => {
  const emitted = []
  const result = await runAutonomousToolLoop({
    userId: 1,
    input: '帮我推荐一套晨跑穿搭',
    intent: 'clothing',
    messages: [{ role: 'user', content: '帮我推荐一套晨跑穿搭' }],
    multimodal: { attachments: [] },
    deps: {
      requestAssistantTurn: async () => ({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tool-generate-suits-1',
            type: 'function',
            function: {
              name: 'generate_scene_suits',
              arguments: JSON.stringify({ scene: '运动', limit: 3 }),
            },
          },
        ],
      }),
      executeTool: async () => ({
        scene: '运动',
        totalClothes: 12,
        suits: [
          {
            scene: '运动',
            reason: '适合晨跑',
            items: [
              { cloth_id: 11, name: '运动短袖', type: '上衣 / 运动', color: '白色' },
              { cloth_id: 12, name: '运动长裤', type: '下衣 / 运动', color: '黑色' },
            ],
          },
        ],
      }),
      createRecommendationHistory: async () => ({ id: 88 }),
    },
    emit: (event) => emitted.push(event),
    sanitizeAssistantReply: (reply) => reply,
  })

  assert.equal(result.kind, 'task')
  assert.equal(result.taskResult.taskType, 'recommendation')
  assert.equal(result.taskResult.result.recommendationHistoryId, 88)
  assert.equal(result.taskResult.result.suits[0].items[0].cloth_id, 11)
  assert.deepEqual(
    emitted.map((event) => event.type),
    ['tool_call_started', 'tool_call_completed']
  )
  assert.match(emitted[1].summary, /当前展示 1 套推荐/)
})
