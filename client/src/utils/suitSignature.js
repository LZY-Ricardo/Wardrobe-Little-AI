export const toSuitSignature = (ids = []) => {
  const uniq = new Set()
  ;(ids || []).forEach((id) => {
    const num = Number.parseInt(id, 10)
    if (Number.isFinite(num) && num > 0) uniq.add(num)
  })
  return Array.from(uniq)
    .sort((a, b) => a - b)
    .join('-')
}

export const extractClothIds = (items = []) =>
  (items || [])
    .map((item) => {
      if (typeof item === 'number') return item
      if (typeof item === 'string') return Number.parseInt(item, 10)
      if (item && typeof item === 'object') return item.cloth_id || item.id
      return null
    })
    .filter((id) => Number.isFinite(id) && id > 0)

