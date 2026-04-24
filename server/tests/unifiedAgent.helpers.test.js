const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildRecentMessagesWindow,
  buildSessionRestorePayload,
  buildUnifiedMessagesForModel,
  summarizeSessionMemoryFromMessages,
} = require('../controllers/unifiedAgent.helpers')

test('buildRecentMessagesWindow keeps last 12 messages and summarizes older count', () => {
  const messages = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index + 1}`,
  }))

  const result = buildRecentMessagesWindow(messages, 12)

  assert.equal(result.recentMessages.length, 12)
  assert.equal(result.recentMessages[0].id, 4)
  assert.equal(result.omittedCount, 3)
})

test('buildSessionRestorePayload returns session, recent messages, memory and preference summary', () => {
  const payload = buildSessionRestorePayload({
    session: { id: 1, title: '通勤搭配', status: 'active' },
    messages: [{ id: 1, role: 'user', content: 'hi' }],
    sessionMemory: { summary: '之前讨论了通勤场景' },
    preferenceSummary: { summary: '偏好深色通勤风' },
  })

  assert.deepEqual(payload, {
    session: { id: 1, title: '通勤搭配', status: 'active' },
    recent_messages: [{ id: 1, role: 'user', content: 'hi' }],
    session_memory: { summary: '之前讨论了通勤场景' },
    preference_summary: { summary: '偏好深色通勤风' },
  })
})

test('buildUnifiedMessagesForModel injects preference and session memory before recent messages', () => {
  const messages = buildUnifiedMessagesForModel({
    systemPrompt: 'SYSTEM',
    recentMessages: [{ role: 'user', content: '旧问题' }],
    sessionMemory: { summary: '之前讨论过通勤场景' },
    preferenceSummary: { summary: '偏好深色通勤风' },
    userInput: '继续给我推荐',
  })

  assert.equal(messages[0].role, 'system')
  assert.match(messages[1].content, /偏好深色通勤风/)
  assert.match(messages[2].content, /之前讨论过通勤场景/)
  assert.equal(messages[3].content, '旧问题')
  assert.equal(messages[4].content, '继续给我推荐')
})

test('summarizeSessionMemoryFromMessages compresses older messages into summary payload', () => {
  const messages = [
    { id: 1, role: 'user', content: '我想做通勤搭配' },
    { id: 2, role: 'assistant', content: '先看看你的衣橱' },
    { id: 3, role: 'user', content: '我喜欢深色和简约风格' },
  ]

  const summary = summarizeSessionMemoryFromMessages(messages)

  assert.match(summary.summary, /通勤搭配/)
  assert.equal(summary.last_summarized_message_id, 3)
  assert.ok(Array.isArray(summary.key_facts))
})
