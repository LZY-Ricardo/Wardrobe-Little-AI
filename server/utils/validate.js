const MAX_FIELD_LEN = 64

const trimToString = (value) => String(value ?? '').trim()

const isProbablyBase64Image = (text) =>
  typeof text === 'string' && text.startsWith('data:image/') && text.includes('base64,')

const REQUIRED_CLOTHES_TYPES = ['上衣', '下衣', '鞋子', '配饰']
const CLOTHES_TYPE_KEYWORDS = {
  上衣: ['上衣', '上装', '外套', '夹克', '卫衣', 'T恤', '衬衫', '毛衣', '针织', '西装', '大衣', '风衣', '背心', '开衫', '马甲', '羽绒', '棉服', '套头衫', '连帽衫'],
  下衣: ['下衣', '下装', '裤', '裙', '短裤', '长裤', '牛仔', '半身裙', '连衣裙', '阔腿', '打底', '西裤', '运动裤', '卫裤'],
  鞋子: ['鞋子', '鞋类', '鞋', '靴', '球鞋', '运动鞋', '皮鞋', '高跟', '凉鞋', '拖鞋', '马丁', '帆布鞋', '板鞋', '乐福鞋'],
  配饰: ['配饰', '帽', '围巾', '包', '手套', '腰带', '皮带', '首饰', '耳环', '项链', '手链', '墨镜', '眼镜', '袜'],
}
const TYPE_PRIORITY = {
  鞋子: 4,
  上衣: 3,
  下衣: 2,
  配饰: 1,
}
const CATEGORY_NOISE_KEYWORDS = {
  上衣: ['上衣', '上装'],
  下衣: ['下衣', '下装'],
  鞋子: ['鞋子', '鞋类'],
  配饰: ['配饰'],
}

const cleanTypeText = (value) =>
  trimToString(value)
    .replace(/[（）()]/g, ' ')
    .replace(/[\\/｜|]+/g, ' ')
    .replace(/[-–—]+/g, ' ')
    .replace(/[,:：;；]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const inferClothesTypeCategory = (value) => {
  const text = trimToString(value)
  if (!text) return ''

  let bestType = ''
  let bestScore = 0

  Object.entries(CLOTHES_TYPE_KEYWORDS).forEach(([type, keywords]) => {
    const score = keywords.reduce((sum, keyword) => (text.includes(keyword) ? sum + keyword.length : sum), 0)
    if (score > bestScore) {
      bestType = type
      bestScore = score
      return
    }
    if (score === bestScore && score > 0 && TYPE_PRIORITY[type] > TYPE_PRIORITY[bestType]) {
      bestType = type
    }
  })

  return bestType
}

const stripCategoryNoise = (value, category) => {
  let next = cleanTypeText(value)
  if (!next) return ''

  Object.values(CATEGORY_NOISE_KEYWORDS).flat().forEach((keyword) => {
    next = next.replace(new RegExp(keyword, 'g'), ' ')
  })

  return next.replace(/\s+/g, ' ').trim()
}

const hasRequiredClothesType = (value) => {
  const text = trimToString(value)
  return REQUIRED_CLOTHES_TYPES.some((type) => text.includes(type))
}

const normalizeClothesType = (value) => {
  const text = trimToString(value)
  if (!text) return { value: '', added: '' }

  const matched = inferClothesTypeCategory(text)
  if (!matched) return { value: text, added: '' }

  const detail = stripCategoryNoise(text, matched)
  if (!detail) return { value: matched, added: matched }
  return { value: `${detail} / ${matched}`, added: text.includes(matched) ? '' : matched }
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
  inferClothesTypeCategory,
}
