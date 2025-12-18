const crypto = require('crypto')

const makeRequestId = () => {
  if (crypto.randomUUID) return crypto.randomUUID()
  return crypto.randomBytes(16).toString('hex')
}

module.exports = function requestContext() {
  return async (ctx, next) => {
    const incoming =
      ctx.get('x-request-id') ||
      ctx.get('x-correlation-id') ||
      ctx.get('x-amzn-trace-id') ||
      ''
    const requestId = incoming.trim() ? incoming.trim().slice(0, 128) : makeRequestId()

    ctx.state.requestId = requestId
    ctx.set('x-request-id', requestId)

    await next()
  }
}

