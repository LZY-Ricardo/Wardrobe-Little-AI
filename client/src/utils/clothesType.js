const REQUIRED_TYPES = ['上衣', '下衣', '鞋子', '配饰']

const TYPE_KEYWORDS = {
  上衣: ['上衣', '外套', '夹克', '卫衣', 'T恤', '衬衫', '毛衣', '针织', '西装', '大衣', '风衣', '背心', '开衫', '马甲', '羽绒', '棉服'],
  下衣: ['下衣', '裤', '裙', '短裤', '长裤', '牛仔', '半身裙', '连衣裙', '阔腿', '打底', '西裤', '运动裤'],
  鞋子: ['鞋', '靴', '球鞋', '运动鞋', '皮鞋', '高跟', '凉鞋', '拖鞋', '马丁'],
  配饰: ['配饰', '帽', '围巾', '包', '手套', '腰带', '皮带', '首饰', '耳环', '项链', '手链', '墨镜', '眼镜', '袜'],
}

const findRequiredType = (text) => REQUIRED_TYPES.find((type) => text.includes(type))

const inferRequiredType = (text) => {
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return type
  }
  return ''
}

const stripOtherRequiredTypes = (text, matched) => {
  let next = text
  REQUIRED_TYPES.forEach((type) => {
    if (type === matched) return
    next = next.replace(new RegExp(`\\(${type}\\)`, 'g'), '')
    next = next.replace(new RegExp(`（${type}）`, 'g'), '')
    next = next.split(type).join('')
  })
  return next.replace(/[\\/|、,，-]\\s*$/g, '').trim()
}

export const normalizeClothesTypeInput = (rawValue) => {
  const text = String(rawValue ?? '').trim()
  if (!text) return { value: '', added: '' }

  const matched = inferRequiredType(text) || findRequiredType(text)
  if (!matched) return { value: text, added: '' }

  const cleaned = stripOtherRequiredTypes(text, matched)
  const value = cleaned || matched
  if (value.includes(matched)) return { value, added: '' }

  return { value: `${value} / ${matched}`, added: matched }
}

export const REQUIRED_CLOTHES_TYPES = REQUIRED_TYPES
