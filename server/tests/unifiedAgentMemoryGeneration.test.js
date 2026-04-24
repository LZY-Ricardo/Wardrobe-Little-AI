const test = require('node:test')
const assert = require('node:assert/strict')

const {
  deriveSessionTitle,
  summarizeSessionMemoryFromMessages,
  parseStructuredMemoryPayload,
} = require('../controllers/unifiedAgent.helpers')

test('parseStructuredMemoryPayload falls back to rule summary when llm output is invalid', () => {
  const messages = [
    { id: 1, role: 'user', content: '我想做通勤搭配' },
    { id: 2, role: 'assistant', content: '先看看你的衣橱' },
    { id: 3, role: 'user', content: '我偏好深色和简约' },
  ]

  const parsed = parseStructuredMemoryPayload('not-json', messages)

  assert.equal(parsed.last_summarized_message_id, 3)
  assert.match(parsed.summary, /通勤搭配/)
  assert.ok(Array.isArray(parsed.key_facts))
})

test('parseStructuredMemoryPayload keeps valid llm structured fields', () => {
  const messages = [{ id: 8, role: 'user', content: '保存当前套装' }]
  const parsed = parseStructuredMemoryPayload(
    JSON.stringify({
      summary: '本会话主要在处理通勤搭配和套装保存。',
      key_facts: ['偏好深色', '偏好通勤风'],
      active_goals: ['保存当前推荐套装'],
      pending_actions: ['等待用户确认'],
    }),
    messages
  )

  assert.equal(parsed.summary, '本会话主要在处理通勤搭配和套装保存。')
  assert.deepEqual(parsed.key_facts, ['偏好深色', '偏好通勤风'])
  assert.deepEqual(parsed.active_goals, ['保存当前推荐套装'])
  assert.deepEqual(parsed.pending_actions, ['等待用户确认'])
  assert.equal(parsed.last_summarized_message_id, 8)
})

test('deriveSessionTitle still provides short fallback title', () => {
  const title = deriveSessionTitle('帮我推荐一套适合明天面试的通勤穿搭方案')
  assert.ok(title.length <= 32)
  assert.match(title, /帮我推荐/)
})
