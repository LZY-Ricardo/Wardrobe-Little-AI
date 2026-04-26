const { updateConfirmationPreferences } = require('../../../../controllers/profileInsights')
const { updateSex, updateUserName, uploadAvatar, uploadPhoto } = require('../../../../controllers/user')
const { calcBase64Size, isProbablyBase64Image } = require('../../../../utils/validate')

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))
const IMAGE_TYPE_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,/i
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const CHARACTER_MODEL_MAX_BYTES = 5 * 1024 * 1024

const normalizeSex = (value) => {
  const raw = safeString(value).trim().toLowerCase()
  if (!raw) return ''
  if (['man', 'male', 'm', '男'].includes(raw)) return 'man'
  if (['woman', 'female', 'f', '女'].includes(raw)) return 'woman'
  return ''
}

const updateUserSex = async (userId, args = {}) => {
  const sex = normalizeSex(args.sex)
  if (!sex) return { error: 'INVALID_SEX', allowed: ['man', 'woman'] }
  const ok = await updateSex(userId, sex)
  if (!ok) return { error: 'UPDATE_FAILED' }
  return { sex, updated: true }
}

const validateProfileImage = (image = '', maxBytes = AVATAR_MAX_BYTES) => {
  const normalized = safeString(image).trim()
  if (!normalized) return { error: 'MISSING_IMAGE' }
  if (!isProbablyBase64Image(normalized)) return { error: 'INVALID_IMAGE' }
  if (!IMAGE_TYPE_PATTERN.test(normalized)) return { error: 'UNSUPPORTED_IMAGE_TYPE' }
  if (calcBase64Size(normalized) > maxBytes) return { error: 'IMAGE_TOO_LARGE' }
  return { ok: true, image: normalized }
}

const updateUserNameTool = async (userId, args = {}, deps = {}) => {
  const name = safeString(args.name).trim()
  if (!name) return { error: 'INVALID_NAME' }
  const updater = deps.updateUserName || updateUserName
  const ok = await updater(userId, name)
  if (!ok) return { error: 'UPDATE_FAILED' }
  return { name, updated: true }
}

const uploadUserAvatarTool = async (userId, args = {}, deps = {}) => {
  const validated = validateProfileImage(args.image, AVATAR_MAX_BYTES)
  if (validated.error) return { error: validated.error }
  const uploader = deps.uploadAvatar || uploadAvatar
  const ok = await uploader(validated.image, userId)
  if (!ok) return { error: 'UPDATE_FAILED' }
  return { updated: true, avatarUpdated: true }
}

const uploadCharacterModelTool = async (userId, args = {}, deps = {}) => {
  const validated = validateProfileImage(args.image, CHARACTER_MODEL_MAX_BYTES)
  if (validated.error) return { error: validated.error }
  const uploader = deps.uploadPhoto || uploadPhoto
  const ok = await uploader(validated.image, userId)
  if (!ok) return { error: 'UPDATE_FAILED' }
  return { updated: true, characterModelUpdated: true }
}

const deleteCharacterModelTool = async (userId, args = {}, deps = {}) => {
  const uploader = deps.uploadPhoto || uploadPhoto
  const ok = await uploader(null, userId)
  if (!ok) return { error: 'UPDATE_FAILED' }
  return { updated: true, deleted: true }
}

const updateConfirmationPreferencesTool = async (userId, args = {}) => {
  if (!Object.prototype.hasOwnProperty.call(args, 'lowRiskNoConfirm')) {
    return { error: 'MISSING_LOW_RISK_NO_CONFIRM' }
  }
  return updateConfirmationPreferences(userId, {
    lowRiskNoConfirm: Boolean(args.lowRiskNoConfirm),
  })
}

module.exports = {
  deleteCharacterModelTool,
  updateConfirmationPreferencesTool,
  updateUserNameTool,
  updateUserSex,
  uploadCharacterModelTool,
  uploadUserAvatarTool,
}
