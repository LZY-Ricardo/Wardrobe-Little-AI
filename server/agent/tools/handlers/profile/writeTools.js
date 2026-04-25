const { updateConfirmationPreferences } = require('../../../../controllers/profileInsights')
const { updateSex } = require('../../../../controllers/user')

const safeString = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))

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

const updateConfirmationPreferencesTool = async (userId, args = {}) => {
  if (!Object.prototype.hasOwnProperty.call(args, 'lowRiskNoConfirm')) {
    return { error: 'MISSING_LOW_RISK_NO_CONFIRM' }
  }
  return updateConfirmationPreferences(userId, {
    lowRiskNoConfirm: Boolean(args.lowRiskNoConfirm),
  })
}

module.exports = {
  updateConfirmationPreferencesTool,
  updateUserSex,
}
