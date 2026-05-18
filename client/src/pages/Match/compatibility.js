const FEMALE_SKIRT_KEYWORDS = ['半身裙', '短裙', '长裙', '百褶裙', 'A字裙', '包臀裙', '连衣裙']

const normalizeText = (value = '') => String(value || '').trim()

const hasStandaloneSkirtSegment = (type = '') =>
  normalizeText(type)
    .split(/[\/|｜,，、·\s]+/)
    .some((segment) => segment === '裙')

export const isFemaleSkirtType = (type = '') =>
  FEMALE_SKIRT_KEYWORDS.some((keyword) => normalizeText(type).includes(keyword)) ||
  hasStandaloneSkirtSegment(type)

export const isPreviewCompatible = ({ sex = '', bottomType = '' } = {}) =>
  !(normalizeText(sex) === 'man' && isFemaleSkirtType(bottomType))

export const getPreviewCompatibilityError = ({ sex = '', bottomType = '' } = {}) =>
  isPreviewCompatible({ sex, bottomType }) ? '' : '当前男模特不支持女性裙装预览，请更换下衣'

export const resolveVisibleMatchMaterials = ({
  activeTab = 'top',
  sex = '',
  topItems = [],
  bottomItems = [],
} = {}) => {
  if (activeTab === 'top') return Array.isArray(topItems) ? topItems : []

  const items = Array.isArray(bottomItems) ? bottomItems : []
  return items.filter((item) => isPreviewCompatible({ sex, bottomType: item?.type }))
}

export const getGenerateCompatibilityIssue = ({ sex = '', bottomClothes = null } = {}) =>
  getPreviewCompatibilityError({ sex, bottomType: bottomClothes?.type || '' })
