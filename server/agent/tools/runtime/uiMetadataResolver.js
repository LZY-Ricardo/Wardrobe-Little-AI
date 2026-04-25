const PAGE_TARGETS = {
  addCloth: {
    key: 'addCloth',
    label: '添加衣物',
    to: '/add',
  },
  editCloth: {
    key: 'editCloth',
    label: '编辑衣物',
    to: '/update',
  },
  wardrobe: {
    key: 'wardrobe',
    label: '虚拟衣柜',
    to: '/outfit',
  },
  recommend: {
    key: 'recommend',
    label: '场景推荐',
    to: '/match?tab=recommend',
  },
  suitCollection: {
    key: 'suitCollection',
    label: '套装列表',
    to: '/match?tab=collection',
  },
  outfitLogs: {
    key: 'outfitLogs',
    label: '穿搭记录',
    to: '/outfit-logs',
  },
  person: {
    key: 'person',
    label: '个人中心',
    to: '/person',
  },
  profileInsights: {
    key: 'profileInsights',
    label: '偏好洞察',
    to: '/profile-insights',
  },
  wardrobeAnalytics: {
    key: 'wardrobeAnalytics',
    label: '衣橱统计',
    to: '/wardrobe-analytics',
  },
  home: {
    key: 'home',
    label: '首页',
    to: '/home',
  },
  agent: {
    key: 'agent',
    label: 'AI 对话',
    to: '/unified-agent',
  },
}

const ROUTE_ALIASES = [
  { pattern: /\/recommendations\/history/gi, pageLabel: '推荐历史' },
  { pattern: /\/wardrobe-analytics/gi, pageLabel: '衣橱统计' },
  { pattern: /\/profile-insights/gi, pageLabel: '偏好洞察' },
  { pattern: /\/outfit-logs/gi, pageLabel: '穿搭记录' },
  { pattern: /\/unified-agent/gi, pageLabel: 'AI 对话' },
  { pattern: /\/aichat/gi, pageLabel: 'AI 对话' },
  { pattern: /\/suits\/create/gi, pageLabel: '新建套装' },
  { pattern: /\/suits/gi, pageLabel: '套装列表' },
  { pattern: /\/match\?tab=collection/gi, pageLabel: '套装列表' },
  { pattern: /\/match\?tab=recommend/gi, pageLabel: '场景推荐' },
  { pattern: /\/recommend/gi, pageLabel: '场景推荐' },
  { pattern: /\/match/gi, pageLabel: '搭配中心' },
  { pattern: /\/outfit/gi, pageLabel: '虚拟衣柜' },
  { pattern: /\/update/gi, pageLabel: '编辑衣物' },
  { pattern: /\/add/gi, pageLabel: '添加衣物' },
  { pattern: /\/person/gi, pageLabel: '个人中心' },
  { pattern: /\/home/gi, pageLabel: '首页' },
  { pattern: /\/login/gi, pageLabel: '登录' },
  { pattern: /\/register/gi, pageLabel: '注册' },
]

const clonePageTarget = (pageKey = '', overrides = {}) => {
  const page = PAGE_TARGETS[pageKey]
  if (!page) return null
  return {
    ...page,
    ...overrides,
  }
}

const buildNavigationAction = ({
  pageKey = '',
  label = '',
  state = null,
  reason = '',
  variant = 'secondary',
} = {}) => {
  const page = clonePageTarget(pageKey)
  if (!page) return null
  return {
    label: String(label || `打开${page.label}`).trim(),
    to: page.to,
    state,
    pageKey: page.key,
    pageLabel: page.label,
    reason: String(reason || '').trim(),
    variant,
  }
}

const replaceKnownRoutesWithPageNames = (text = '') => {
  let output = String(text || '')
  ROUTE_ALIASES.forEach(({ pattern, pageLabel }) => {
    output = output.replace(pattern, pageLabel)
  })
  return output
}

module.exports = {
  PAGE_TARGETS,
  buildNavigationAction,
  clonePageTarget,
  replaceKnownRoutesWithPageNames,
}
