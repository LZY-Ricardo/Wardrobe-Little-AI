const AUTO_SCROLL_THRESHOLD_PX = 48

export const isScrollNearBottom = (
  { scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = {},
  threshold = AUTO_SCROLL_THRESHOLD_PX
) => {
  const distanceToBottom = scrollHeight - clientHeight - scrollTop
  return distanceToBottom <= threshold
}

export { AUTO_SCROLL_THRESHOLD_PX }
