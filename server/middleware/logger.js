const { log } = require('../utils/logger')

module.exports = function requestLogger() {
  return async (ctx, next) => {
    const startedAt = Date.now()
    const requestId = ctx.state.requestId
    const method = ctx.method
    const path = ctx.path

    const baseMeta = {
      requestId,
      method,
      path,
      ip: ctx.request.ip,
      userId: ctx.userId,
    }

    log('info', 'request_start', baseMeta)

    let attachedClose = false
    const attachCloseListener = () => {
      if (attachedClose) return
      attachedClose = true
      let closed = false
      ctx.res.on('close', () => {
        if (closed) return
        closed = true
        log('info', 'request_end', {
          ...baseMeta,
          status: ctx.status,
          durationMs: Date.now() - startedAt,
          sse: true,
        })
      })
    }

    if (ctx.respond === false) attachCloseListener()

    try {
      await next()
    } finally {
      if (ctx.respond === false) {
        attachCloseListener()
        return
      }
      log('info', 'request_end', {
        ...baseMeta,
        status: ctx.status,
        durationMs: Date.now() - startedAt,
      })
    }
  }
}
