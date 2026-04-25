const setSseHeaders = (res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

const writeSse = (res, data) => {
  if (res.writableEnded || res.destroyed) return false
  res.write(`data: ${JSON.stringify(data)}\n\n`)
  return true
}

const endSse = (res) => {
  if (res.writableEnded || res.destroyed) return
  res.write('data: [DONE]\n\n')
  res.end()
}

module.exports = { setSseHeaders, writeSse, endSse }
