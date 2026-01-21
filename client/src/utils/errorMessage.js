export const getErrorMessage = (error, fallback = '') => {
  if (!error) return fallback
  if (typeof error === 'string') return error || fallback
  if (typeof error === 'object') {
    if (typeof error.msg === 'string' && error.msg) return error.msg
    const responseMessage = error.response?.data?.msg
    if (typeof responseMessage === 'string' && responseMessage) return responseMessage
    if (typeof error.message === 'string' && error.message) return error.message
  }
  return fallback
}
