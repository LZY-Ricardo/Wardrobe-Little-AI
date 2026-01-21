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

export const normalizeClothesTypeInput = (rawValue) => {
  const text = String(rawValue ?? '').trim()
  if (!text) return { value: '', added: '' }

  const matched = findRequiredType(text) || inferRequiredType(text)
  if (!matched || text.includes(matched)) return { value: text, added: '' }

  return { value: `${text} / ${matched}`, added: matched }
}

export const REQUIRED_CLOTHES_TYPES = REQUIRED_TYPES
