const REQUIRED_TYPES = ['上衣', '下衣', '鞋子', '配饰']

const TYPE_KEYWORDS = {
  上衣: ['上衣', '外套', '夹克', '卫衣', 'T恤', '衬衫', '毛衣', '针织衫', '针织上衣', '针织外套', '西装', '大衣', '风衣', '背心', '开衫', '马甲', '羽绒', '棉服', '套头衫', '连帽衫'],
  下衣: ['下衣', '裤', '裙', '短裤', '长裤', '牛仔', '半身裙', '连衣裙', '阔腿', '打底', '西裤', '运动裤'],
  鞋子: ['鞋', '靴', '球鞋', '运动鞋', '皮鞋', '高跟鞋', '凉鞋', '拖鞋', '马丁', '帆布鞋', '板鞋', '乐福鞋'],
  配饰: ['配饰', '围巾', '丝巾', '围脖', '披肩', '披巾', '领巾', '手套', '手包', '手袋', '包包', '背包', '手提包', '腰包', '钱包', '帆布包', '购物袋', '托特包', '书包', '帽子', '鸭舌帽', '棒球帽', '渔夫帽', '贝雷帽', '针织帽', '毛线帽', '遮阳帽', '首饰', '耳环', '项链', '手链', '戒指', '手表', '胸针', '墨镜', '太阳镜', '眼镜', '发箍', '发带', '发夹', '发卡', '腰带', '皮带', '领带', '领结', '口罩', '袜子', '丝袜', '打底袜'],
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
    next = next.replace(new RegExp(`\(${type}\)`, 'g'), '')
    next = next.replace(new RegExp(`\uFF08${type}\uFF09`, 'g'), '')
    next = next.split(type).join('')
  })
  return next.replace(/[\/|\u3001,\uff0c-]\s*$/g, '').trim()
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
