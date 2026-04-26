import { createFocusReader } from '../../utils/agentContext.js'

const readFocusedCloth = createFocusReader('cloth')

export const hasAgentContextClothFocus = (locationState = null) => {
  const focusedCloth = readFocusedCloth(locationState)
  return Boolean(focusedCloth?.cloth_id)
}

export const stripSelectedClothImageForAgentContext = (locationState = null, selectedItem = null) => {
  if (!hasAgentContextClothFocus(locationState) || !selectedItem || typeof selectedItem !== 'object') {
    return selectedItem
  }

  return {
    ...selectedItem,
    image: '',
  }
}

export const resolveSelectedClothFromLocationState = (locationState = null) => {
  const focusedCloth = readFocusedCloth(locationState)
  if (focusedCloth?.cloth_id) return focusedCloth

  if (locationState && typeof locationState === 'object' && !Array.isArray(locationState)) {
    const directClothId = Number.parseInt(locationState?.cloth_id, 10)
    if (Number.isFinite(directClothId) && directClothId > 0) {
      return locationState
    }
  }

  return null
}

export const shouldFetchSelectedClothDetail = (selectedItem = null) => {
  const clothId = Number.parseInt(selectedItem?.cloth_id, 10)
  return Number.isFinite(clothId) && clothId > 0 && !String(selectedItem?.image || '').trim()
}

export const mergeSelectedItemWithDetail = (selectedItem = null, detail = null) => {
  if (!selectedItem || !detail || typeof detail !== 'object') return selectedItem
  return {
    ...selectedItem,
    ...detail,
    cloth_id: Number.parseInt(detail.cloth_id || selectedItem.cloth_id, 10) || selectedItem.cloth_id,
  }
}
