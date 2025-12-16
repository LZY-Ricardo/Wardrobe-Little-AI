const axios = require('axios')

const getBaseUrl = () => (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')

const getApiKey = () => process.env.DEEPSEEK_API_KEY || ''

const ensureApiKey = () => {
  const key = getApiKey()
  if (!key) {
    throw new Error('DEEPSEEK_API_KEY is not set')
  }
  return key
}

const buildHeaders = () => ({
  Authorization: `Bearer ${ensureApiKey()}`,
  'Content-Type': 'application/json',
})

const createChatCompletion = (body, { stream = false, timeout } = {}) => {
  const url = `${getBaseUrl()}/v1/chat/completions`
  return axios.post(url, { ...body, stream }, { headers: buildHeaders(), timeout, responseType: stream ? 'stream' : 'json' })
}

module.exports = {
  createChatCompletion,
  ensureApiKey,
  getBaseUrl,
  getApiKey,
  buildHeaders,
}
