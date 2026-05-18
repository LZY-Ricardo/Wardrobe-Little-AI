const FEMALE_SKIRT_KEYWORDS = ['半身裙', '短裙', '长裙', '百褶裙', 'A字裙', '包臀裙', '连衣裙']

const normalizeText = (value = '') => String(value || '').trim()

const hasStandaloneSkirtSegment = (type = '') =>
  normalizeText(type)
    .split(/[\/|｜,，、·\s]+/)
    .some((segment) => segment === '裙')

const isFemaleSkirtType = (type = '') =>
  FEMALE_SKIRT_KEYWORDS.some((keyword) => normalizeText(type).includes(keyword)) ||
  hasStandaloneSkirtSegment(type)

const isPreviewCompatible = ({ sex = '', bottomType = '' } = {}) =>
  !(normalizeText(sex) === 'man' && isFemaleSkirtType(bottomType))

const getPreviewCompatibilityError = ({ sex = '', bottomType = '' } = {}) =>
  isPreviewCompatible({ sex, bottomType }) ? '' : '当前男模特不支持女性裙装预览，请更换下衣'

module.exports = {
  getPreviewCompatibilityError,
  isFemaleSkirtType,
  isPreviewCompatible,
}
