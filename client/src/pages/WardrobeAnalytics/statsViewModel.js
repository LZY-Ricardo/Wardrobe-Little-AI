export const buildCompactStats = (items = [], { maxItems = 4, overflowLabel = '其他' } = {}) => {
  if (!Array.isArray(items) || items.length === 0) return []

  const normalized = items
    .filter((item) => item && (item.label || item.date))
    .map((item) => ({
      label: item.label || item.date,
      count: Number(item.count || 0),
    }))

  if (normalized.length <= maxItems) return normalized

  const visible = normalized.slice(0, maxItems - 1)
  const rest = normalized.slice(maxItems - 1)
  const restCount = rest.reduce((sum, item) => sum + item.count, 0)

  return [
    ...visible,
    {
      label: overflowLabel,
      count: restCount,
    },
  ]
}

