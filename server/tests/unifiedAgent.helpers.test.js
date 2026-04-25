const test = require('node:test')
const assert = require('node:assert/strict')

const { buildAssistantActionButton, sanitizeAssistantReply } = require('../controllers/unifiedAgent.helpers')

test('sanitizeAssistantReply removes tool result blocks from assistant text', () => {
  const raw = [
    '好的，我来帮你查询刚刚添加的这双白色鞋子的具体信息。',
    '',
    '【TOOL_RESULT name=get_clothes】',
    '{"code":200,"data":{"name":"白色运动鞋","color":"白色"}}',
    '【/TOOL_RESULT】',
    '',
    '以下是这双白色鞋子的详细信息：',
  ].join('\n')

  const cleaned = sanitizeAssistantReply(raw)

  assert.equal(
    cleaned,
    '好的，我来帮你查询刚刚添加的这双白色鞋子的具体信息。\n\n以下是这双白色鞋子的详细信息：'
  )
})

test('sanitizeAssistantReply rewrites route guidance in clothing intent', () => {
  const raw = '如果你需要修改这双鞋的信息（比如添加品牌、更换季节或场合），可以前往 /update 页面进行编辑。或者你想看看这双鞋能搭配什么衣服？'

  const cleaned = sanitizeAssistantReply(raw, { intent: 'clothing' })

  assert.equal(
    cleaned,
    '你的衣物小助手可以直接帮你补充或修改这些信息。你也可以点击下方按钮自行操作。或者你想看看这双鞋能搭配什么衣服？'
  )
})

test('sanitizeAssistantReply replaces raw route names with page names', () => {
  const raw = '点击底部导航中的【虚拟衣柜】（路由：/outfit），如果需要修改可以再进入 /update 页面。'

  const cleaned = sanitizeAssistantReply(raw, { intent: 'project' })

  assert.equal(
    cleaned,
    '点击底部导航中的【虚拟衣柜】（页面：虚拟衣柜），如果需要修改可以再进入 编辑衣物 页面。'
  )
})

test('buildAssistantActionButton returns update action for clothing modification guidance', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '你的衣物小助手可以直接帮你补充或修改这些信息。你也可以点击下方按钮自行操作。',
    latestTask: {
      result: {
        cloth_id: 12,
        name: '白色运动鞋',
        type: '鞋类',
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开编辑衣物',
    to: '/update',
    state: {
      cloth_id: 12,
      name: '白色运动鞋',
      type: '鞋类',
    },
    pageKey: 'editCloth',
    pageLabel: '编辑衣物',
    reason: '继续补充品牌、季节、材质等信息',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns recommend action for styling guidance', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '如果你想看看这双鞋怎么搭，我也可以继续帮你推荐。',
    latestTask: null,
  })

  assert.deepEqual(button, {
    label: '打开场景推荐',
    to: '/match?tab=recommend',
    state: null,
    pageKey: 'recommend',
    pageLabel: '场景推荐',
    reason: '',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns update action for favorite task result', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '已收藏衣物',
    latestTask: {
      taskType: 'toggle_favorite',
      result: {
        selectedCloth: {
          cloth_id: 9,
          name: '灰色卫衣',
        },
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开编辑衣物',
    to: '/update',
    state: {
      cloth_id: 9,
      name: '灰色卫衣',
    },
    pageKey: 'editCloth',
    pageLabel: '编辑衣物',
    reason: '查看或调整这件衣物的详细信息',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns collection action for delete suit task result', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '已删除套装',
    latestTask: {
      taskType: 'delete_suit',
      result: {
        selectedSuit: {
          suit_id: 7,
          name: '通勤套装',
        },
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开套装列表',
    to: '/match?tab=collection',
    state: {
      selectedSuit: {
        suit_id: 7,
        name: '通勤套装',
      },
    },
    pageKey: 'suitCollection',
    pageLabel: '套装列表',
    reason: '',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns outfit log action for delete outfit log task result', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '已删除穿搭记录',
    latestTask: {
      taskType: 'delete_outfit_log',
      result: {
        selectedOutfitLog: {
          id: 3,
          log_date: '2026-04-25',
        },
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开穿搭记录',
    to: '/outfit-logs',
    state: {
      selectedOutfitLog: {
        id: 3,
        log_date: '2026-04-25',
      },
    },
    pageKey: 'outfitLogs',
    pageLabel: '穿搭记录',
    reason: '',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns profile insights action for profile task result', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '已整理出你的长期偏好画像。',
    latestTask: {
      taskType: 'profile',
      result: {
        summary: '偏好通勤与简约风格',
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开偏好洞察',
    to: '/profile-insights',
    state: null,
    pageKey: 'profileInsights',
    pageLabel: '偏好洞察',
    reason: '',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns analytics action for analytics task result', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '已生成衣橱分析。',
    latestTask: {
      taskType: 'analytics',
      result: {
        totalClothes: 18,
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开衣橱统计',
    to: '/wardrobe-analytics',
    state: null,
    pageKey: 'wardrobeAnalytics',
    pageLabel: '衣橱统计',
    reason: '',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns person action for sex update task result', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '已更新性别。',
    latestTask: {
      taskType: 'update_user_sex',
      result: {
        sex: 'woman',
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开个人中心',
    to: '/person',
    state: null,
    pageKey: 'person',
    pageLabel: '个人中心',
    reason: '继续完善个人信息或模特设置',
    variant: 'secondary',
  })
})

test('buildAssistantActionButton returns profile insights action for confirmation preference update result', () => {
  const button = buildAssistantActionButton({
    intent: 'clothing',
    reply: '已更新低风险操作免确认设置。',
    latestTask: {
      taskType: 'update_confirmation_preferences',
      result: {
        lowRiskNoConfirm: true,
      },
    },
  })

  assert.deepEqual(button, {
    label: '打开偏好洞察',
    to: '/profile-insights',
    state: null,
    pageKey: 'profileInsights',
    pageLabel: '偏好洞察',
    reason: '查看或继续调整低风险操作免确认设置',
    variant: 'secondary',
  })
})
