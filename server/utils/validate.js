const MAX_FIELD_LEN = 64

const trimToString = (value) => String(value ?? '').trim()

const isProbablyBase64Image = (text) =>
  typeof text === 'string' && text.startsWith('data:image/') && text.includes('base64,')

const REQUIRED_CLOTHES_TYPES = ['上衣', '下衣', '鞋子', '配饰']
const CLOTHES_TYPE_KEYWORDS = {
  上衣: ['上衣', '外套', '夹克', '卫衣', 'T恤', '衬衫', '毛衣', '针织', '西装', '大衣', '风衣', '背心', '开衫', '马甲', '羽绒', '棉服'],
  下衣: ['下衣', '裤', '裙', '短裤', '长裤', '牛仔', '半身裙', '连衣裙', '阔腿', '打底', '西裤', '运动裤'],
  鞋子: ['鞋', '靴', '球鞋', '运动鞋', '皮鞋', '高跟', '凉鞋', '拖鞋', '马丁'],
  配饰: ['配饰', '帽', '围巾', '包', '手套', '腰带', '皮带', '首饰', '耳环', '项链', '手链', '墨镜', '眼镜', '袜'],
}

const hasRequiredClothesType = (value) => {
  const text = trimToString(value)
  return REQUIRED_CLOTHES_TYPES.some((type) => text.includes(type))
}

const normalizeClothesType = (value) => {
  const text = trimToString(value)
  if (!text) return { value: '', added: '' }

  let matched = REQUIRED_CLOTHES_TYPES.find((type) => text.includes(type))
  if (!matched) {
    for (const [type, keywords] of Object.entries(CLOTHES_TYPE_KEYWORDS)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        matched = type
        break
      }
    }
  }

  if (!matched || text.includes(matched)) return { value: text, added: '' }
  return { value: `${text} / ${matched}`, added: matched }
}

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
  normalizeClothesType,
  hasRequiredClothesType,
}
