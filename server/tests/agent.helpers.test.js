const test = require('node:test')
const assert = require('node:assert/strict')

const {
  classifyAgentTask,
  summarizeAgentResult,
  buildAgentExecutionPreview,
  summarizeAgentHistoryItem,
} = require('../controllers/agent.helpers')

test('classifyAgentTask recognizes closet query', () => {
  const result = classifyAgentTask('帮我看看我的衣橱里有哪些收藏衣物')
  assert.deepEqual(result, {
    taskType: 'closet_query',
    scene: '',
    favoriteOnly: true,
  })
})

test('classifyAgentTask recognizes scene recommendation with scene extraction', () => {
  const result = classifyAgentTask('帮我推荐一套通勤穿搭')
  assert.deepEqual(result, {
    taskType: 'recommendation',
    scene: '通勤',
    favoriteOnly: false,
  })
})

test('summarizeAgentResult summarizes recommendation result', () => {
  const summary = summarizeAgentResult({
    taskType: 'recommendation',
    result: { suits: [{}, {}] },
  })
  assert.equal(summary, '生成了 2 套推荐')
})

test('buildAgentExecutionPreview builds recommendation steps', () => {
  const preview = buildAgentExecutionPreview({
    input: '帮我推荐一套通勤穿搭',
    classification: {
      taskType: 'recommendation',
      scene: '通勤',
      favoriteOnly: false,
    },
    requiresConfirmation: false,
  })

  assert.equal(preview.intent, '场景推荐')
  assert.match(preview.why, /通勤/)
  assert.deepEqual(preview.steps, [
    '读取当前衣橱数据',
    '按场景生成推荐结果',
    '返回推荐摘要与可执行后续动作',
  ])
  assert.equal(preview.canAutoRun, true)
})

test('buildAgentExecutionPreview builds write-action steps with confirmation', () => {
  const preview = buildAgentExecutionPreview({
    input: '把当前推荐的第1套保存为套装',
    classification: {
      taskType: 'save_suit',
      scene: '',
      favoriteOnly: false,
    },
    requiresConfirmation: true,
  })

  assert.equal(preview.intent, '保存套装')
  assert.equal(preview.canAutoRun, false)
  assert.deepEqual(preview.steps, [
    '读取当前推荐结果',
    '生成待确认操作摘要',
    '等待你确认后写入套装库',
  ])
})

test('summarizeAgentHistoryItem formats status and related object info', () => {
  const summary = summarizeAgentHistoryItem({
    task_type: 'save_suit',
    status: 'success',
    confirmation_status: 'confirmed',
    related_object_type: 'suit',
    related_object_id: 88,
  })

  assert.deepEqual(summary, {
    statusLabel: '已完成',
    confirmationLabel: '已确认',
    relatedObjectLabel: 'suit #88',
  })
})
