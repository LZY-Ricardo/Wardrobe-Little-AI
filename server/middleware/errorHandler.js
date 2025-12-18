const { log } = require('../utils/logger')

module.exports = function errorHandler() {
  return async (ctx, next) => {
    try {
      await next()
    } catch (err) {
      const requestId = ctx.state.requestId
      const status = Number(err.status) || Number(err.statusCode) || 500
      const message = err.expose ? err.message : '服务器错误'

      log('error', 'request_error', {
        requestId,
        method: ctx.method,
        path: ctx.path,
        status,
        userId: ctx.userId,
        ip: ctx.request.ip,
        error: err.message,
      })

      if (ctx.respond === false) {
        try {
          if (!ctx.res.headersSent) {
            ctx.res.writeHead(status, {
              'Content-Type': 'application/json; charset=utf-8',
              'x-request-id': requestId,
            })
          }
          ctx.res.end(JSON.stringify({ code: 0, msg: message, requestId }))
        } catch {
          // ignore
        }
        return
      }

      ctx.status = status
      ctx.body = { code: 0, msg: message, requestId }
    }
  }
}

