const { log } = require('../utils/logger')
const jwt = require('jsonwebtoken')

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

const WINDOW_MS = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000)
const DEFAULT_MAX = parsePositiveInt(process.env.RATE_LIMIT_MAX, 120)
const CHAT_MAX = parsePositiveInt(process.env.RATE_LIMIT_CHAT_MAX, 30)
const GENERATE_MAX = parsePositiveInt(process.env.RATE_LIMIT_GENERATE_MAX, 20)
const ANALYZE_MAX = parsePositiveInt(process.env.RATE_LIMIT_ANALYZE_MAX, 10)

const buckets = new Map()

const JWT_SECRET = process.env.JWT_SECRET || 'lzy'

const tryGetUserIdFromAuthHeader = (ctx) => {
  const authHeader = ctx.get('authorization') || ''
  if (!authHeader) return null
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const id = decoded?.id
    return id ? String(id) : null
  } catch {
    return null
  }
}

const getBucketKey = (ctx) => {
  if (ctx.userId) return `u:${ctx.userId}`
  const inferredUserId = tryGetUserIdFromAuthHeader(ctx)
  if (inferredUserId) return `u:${inferredUserId}`
  const ip = ctx.request.ip || ctx.get('x-forwarded-for') || 'unknown'
  return `ip:${String(ip).split(',')[0].trim()}`
}

const pickLimit = (ctx) => {
  const path = ctx.path || ''
  if (path.startsWith('/chat')) return CHAT_MAX
  if (path.startsWith('/scene/generateSceneSuits')) return GENERATE_MAX
  if (path.startsWith('/clothes/analyze') || path.startsWith('/clothes/genPreview')) return ANALYZE_MAX
  return DEFAULT_MAX
}

const cleanupExpired = (now) => {
  if (buckets.size < 2000) return
  for (const [key, bucket] of buckets.entries()) {
    if (!bucket || now > bucket.resetAt + WINDOW_MS) buckets.delete(key)
  }
}

module.exports = function rateLimit() {
  return async (ctx, next) => {
    const enabled = String(process.env.RATE_LIMIT_ENABLED || '1') !== '0'
    if (!enabled) return next()

    const limit = pickLimit(ctx)
    const key = `${getBucketKey(ctx)}:${ctx.method}:${pickLimit(ctx)}:${ctx.path}`
    const now = Date.now()
    cleanupExpired(now)

    const existing = buckets.get(key)
    if (!existing || now >= existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
      return next()
    }

    existing.count += 1
    if (existing.count <= limit) return next()

    ctx.status = 429
    ctx.set('retry-after', String(Math.ceil((existing.resetAt - now) / 1000)))
    ctx.body = { code: 0, msg: '请求过于频繁，请稍后再试', requestId: ctx.state.requestId }

    log('warn', 'rate_limited', {
      requestId: ctx.state.requestId,
      method: ctx.method,
      path: ctx.path,
      userId: ctx.userId,
      ip: ctx.request.ip,
      limit,
      windowMs: WINDOW_MS,
    })
  }
}
