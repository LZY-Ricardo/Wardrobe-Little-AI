function resolveJwtSecret(env = process.env) {
  const secret = String(env?.JWT_SECRET ?? '').trim()
  if (!secret) {
    throw new Error('JWT_SECRET 未配置，请在 server/.env 中设置')
  }
  return secret
}

module.exports = {
  resolveJwtSecret,
}
