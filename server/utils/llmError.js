const axios = require('axios')

const extractProviderMessage = (data) => {
  if (!data) return ''
  if (typeof data === 'string') return data
  return data?.error?.message || data?.message || data?.msg || ''
}

const createStatusError = (status, message, options = {}) => {
  const error = new Error(message)
  error.status = status
  Object.assign(error, options)
  return error
}

const buildSceneMessages = (scene = {}) => ({
  unavailable: scene.unavailable || '当前不可用',
  config: scene.config || '服务配置异常',
  quota: scene.quota || '服务额度不足',
  rateLimit: scene.rateLimit || '请稍后再试',
  failed: scene.failed || '操作失败',
})

const normalizeLlmError = (error, provider = '模型服务', sceneMessages = {}) => {
  if (!axios.isAxiosError(error)) {
    return error
  }

  const status = error.response?.status
  const providerMessage = extractProviderMessage(error.response?.data)
  const messages = buildSceneMessages(sceneMessages)

  console.error(`[${provider}] 调用失败`, {
    status,
    message: error.message,
    providerMessage,
    data: error.response?.data,
  })

  if (!status) {
    return createStatusError(503, messages.unavailable, {
      cause: error,
      providerMessage,
    })
  }

  if (status === 401) {
    return createStatusError(503, messages.config, {
      cause: error,
      providerMessage,
    })
  }

  if (status === 402) {
    return createStatusError(503, messages.quota, {
      cause: error,
      providerMessage,
    })
  }

  if (status === 429) {
    return createStatusError(503, messages.rateLimit, {
      cause: error,
      providerMessage,
    })
  }

  if (status >= 500) {
    return createStatusError(503, messages.unavailable, {
      cause: error,
      providerMessage,
    })
  }

  return createStatusError(502, providerMessage || messages.failed, {
    cause: error,
    providerMessage,
  })
}

module.exports = {
  normalizeLlmError,
}
