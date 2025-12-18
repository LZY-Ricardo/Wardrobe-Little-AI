const MAX_FIELD_LEN = 64

const trimToString = (value) => String(value ?? '').trim()

const isProbablyBase64Image = (text) =>
  typeof text === 'string' && text.startsWith('data:image/') && text.includes('base64,')

const clampLen = (value, maxLen = MAX_FIELD_LEN) => trimToString(value).slice(0, maxLen)

const ensureLen = (value, name, maxLen = MAX_FIELD_LEN) => {
  const text = trimToString(value)
  if (!text) {
    const error = new Error(`${name}不能为空`)
    error.status = 400
    throw error
  }
  if (text.length > maxLen) {
    const error = new Error(`${name}长度不能超过${maxLen}`)
    error.status = 400
    throw error
  }
  return text
}

const calcBase64Size = (value = '') => {
  if (!value || typeof value !== 'string') return 0
  const base64 = value.includes(',') ? value.split(',').pop() : value
  if (!base64) return 0
  const padding = (base64.match(/=+$/) || [''])[0].length
  return Math.floor((base64.length * 3) / 4) - padding
}

module.exports = {
  MAX_FIELD_LEN,
  trimToString,
  clampLen,
  ensureLen,
  isProbablyBase64Image,
  calcBase64Size,
}

