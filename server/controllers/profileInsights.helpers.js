const toCounterList = (values = []) => {
  const counter = new Map()
  const firstSeen = new Map()
  values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((value, index) => {
      counter.set(value, (counter.get(value) || 0) + 1)
      if (!firstSeen.has(value)) firstSeen.set(value, index)
    })
  return { counter, firstSeen }
}

const summarizeTopValues = (values = [], limit = 3) => {
  const meta = toCounterList(values)
  return Array.from(meta.counter.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return meta.firstSeen.get(a[0]) - meta.firstSeen.get(b[0])
    })
    .slice(0, limit)
    .map(([label]) => label)
}

const normalizeConfirmationPreferences = (currentPreferences = {}) => ({
  lowRiskNoConfirm: Boolean(currentPreferences?.lowRiskNoConfirm),
})

const buildSummary = ({ preferredColors, preferredStyles, frequentScenes, frequentSeasons, likedReasonTags }) => {
  const parts = []
  if (preferredColors.length) parts.push(`偏好颜色以${preferredColors.join('、')}为主`)
  if (preferredStyles.length) parts.push(`常用风格偏向${preferredStyles.join('、')}`)
  if (frequentScenes.length) parts.push(`高频场景包括${frequentScenes.join('、')}`)
  if (frequentSeasons.length) parts.push(`近期集中在${frequentSeasons.join('、')}穿搭`)
  if (likedReasonTags.length) parts.push(`最近更关注${likedReasonTags.join('、')}这类反馈`)
  return parts.join('；')
}

const buildProfileInsight = ({ clothes = [], outfitLogs = [], feedbacks = [], currentPreferences = {} }) => {
  const preferredColors = summarizeTopValues(clothes.map((item) => item.color), 3)
  const preferredStyles = summarizeTopValues(clothes.map((item) => item.style), 3)
  const frequentScenes = summarizeTopValues(outfitLogs.map((item) => item.scene), 3)
  const seasonCandidates = [
    ...clothes.map((item) => item.season),
    ...outfitLogs.flatMap((log) => (Array.isArray(log.items) ? log.items.map((item) => item.season) : [])),
  ]
  const frequentSeasons = summarizeTopValues(seasonCandidates, 3)
  const likedReasonTags = summarizeTopValues(
    feedbacks
      .filter((item) => item.feedback_result === 'like')
      .flatMap((item) => (Array.isArray(item.feedback_reason_tags) ? item.feedback_reason_tags : [])),
    3
  )

  const result = {
    preferredColors,
    preferredStyles,
    frequentScenes,
    frequentSeasons,
    confirmationPreferences: normalizeConfirmationPreferences(currentPreferences),
    likedReasonTags,
  }
  result.summary = buildSummary(result)
  return result
}

module.exports = {
  summarizeTopValues,
  buildProfileInsight,
}
