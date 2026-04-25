const test = require('node:test')
const assert = require('node:assert/strict')

const { buildSystemPrompt, isProjectIntent } = require('../utils/aichatPrompt')

test('isProjectIntent does not classify generic clothing query as project intent', () => {
  assert.equal(isProjectIntent('查看刚刚添加的白色鞋子'), false)
  assert.equal(isProjectIntent('帮我推荐一套通勤穿搭'), false)
})

test('isProjectIntent keeps explicit project help query as project intent', () => {
  assert.equal(isProjectIntent('这个页面怎么用'), true)
  assert.equal(isProjectIntent('为什么这个按钮点了报错'), true)
  assert.equal(isProjectIntent('虚拟衣柜页面在哪里进入'), true)
})

test('buildSystemPrompt for clothing does not expose raw routes', () => {
  const prompt = buildSystemPrompt({ intent: 'clothing' })
  assert.equal(prompt.includes('/outfit'), false)
  assert.equal(prompt.includes('/update'), false)
  assert.match(prompt, /不要主动让用户前往某个原始路由/)
})

test('buildSystemPrompt can inject current china date for temporal grounding', () => {
  const prompt = buildSystemPrompt({ intent: 'clothing', currentDate: '2026-04-25' })
  assert.match(prompt, /当前中国日期是 2026-04-25/)
  assert.match(prompt, /必须以这个日期为准/)
})
