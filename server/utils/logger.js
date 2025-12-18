const LEVELS = ['debug', 'info', 'warn', 'error']

const getLevelIndex = (level) => {
  const idx = LEVELS.indexOf(level)
  return idx === -1 ? 1 : idx
}

const CURRENT_LEVEL = process.env.LOG_LEVEL || 'info'
const CURRENT_LEVEL_INDEX = getLevelIndex(CURRENT_LEVEL)

const shouldLog = (level) => getLevelIndex(level) >= CURRENT_LEVEL_INDEX

const safeStringify = (value) => {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: 'STRINGIFY_FAILED' })
  }
}

const log = (level, message, meta = {}) => {
  if (!shouldLog(level)) return
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  }
  const line = safeStringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

module.exports = {
  log,
}

