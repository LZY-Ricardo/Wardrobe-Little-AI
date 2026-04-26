const USERNAME_MIN_LENGTH = 6
const USERNAME_MAX_LENGTH = 32
const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 64
const STRONG_PASSWORD_MIN_LENGTH = 8

const normalizeCredential = (value, { trim = true } = {}) => {
  if (typeof value !== 'string') return ''
  return trim ? value.trim() : value
}

const validateUsername = (username, { enforceLength = false, trim = true } = {}) => {
  const value = normalizeCredential(username, { trim })
  if (!String(value).trim()) {
    return { ok: false, message: '用户名不能为空' }
  }
  if (enforceLength && (value.length < USERNAME_MIN_LENGTH || value.length > USERNAME_MAX_LENGTH)) {
    return {
      ok: false,
      message: `用户名长度需为 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 位`,
    }
  }
  return { ok: true, value }
}

const validatePassword = (
  password,
  { enforceLength = false, requireStrong = false, emptyMessage = '密码不能为空', trim = true } = {}
) => {
  const value = normalizeCredential(password, { trim })
  if (!String(value).trim()) {
    return { ok: false, message: emptyMessage }
  }
  if (enforceLength && (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH)) {
    return {
      ok: false,
      message: `密码长度需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位`,
    }
  }
  if (requireStrong) {
    const isStrongLength =
      value.length >= STRONG_PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH
    const hasLowercase = /[a-z]/.test(value)
    const hasUppercase = /[A-Z]/.test(value)
    const hasDigit = /\d/.test(value)
    const hasSpecial = /[^A-Za-z0-9]/.test(value)
    const hasWhitespace = /\s/.test(value)

    if (!isStrongLength || !hasLowercase || !hasUppercase || !hasDigit || !hasSpecial || hasWhitespace) {
      return {
        ok: false,
        message: `密码需为 ${STRONG_PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，且包含大写字母、小写字母、数字和特殊字符`,
      }
    }
  }
  return { ok: true, value }
}

const validateLoginInput = ({ username, password }) => {
  const usernameResult = validateUsername(username, { trim: false })
  if (!usernameResult.ok) return usernameResult

  const passwordResult = validatePassword(password, { trim: false })
  if (!passwordResult.ok) return passwordResult

  return {
    ok: true,
    value: {
      username: usernameResult.value,
      password: passwordResult.value,
    },
  }
}

const validateRegistrationInput = ({ username, password }) => {
  const usernameResult = validateUsername(username, { enforceLength: true })
  if (!usernameResult.ok) return usernameResult

  const passwordResult = validatePassword(password, { enforceLength: true, requireStrong: true })
  if (!passwordResult.ok) return passwordResult

  return {
    ok: true,
    value: {
      username: usernameResult.value,
      password: passwordResult.value,
    },
  }
}

const validatePasswordChangeInput = ({ oldPassword, newPassword }) => {
  const oldPasswordResult = validatePassword(oldPassword, { emptyMessage: '旧密码不能为空' })
  if (!oldPasswordResult.ok) return oldPasswordResult

  const newPasswordResult = validatePassword(newPassword, {
    enforceLength: true,
    requireStrong: true,
    emptyMessage: '新密码不能为空',
  })
  if (!newPasswordResult.ok) return newPasswordResult

  if (oldPasswordResult.value === newPasswordResult.value) {
    return { ok: false, message: '新密码不能与旧密码相同' }
  }

  return {
    ok: true,
    value: {
      oldPassword: oldPasswordResult.value,
      newPassword: newPasswordResult.value,
    },
  }
}

module.exports = {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  STRONG_PASSWORD_MIN_LENGTH,
  normalizeCredential,
  validateUsername,
  validatePassword,
  validateLoginInput,
  validateRegistrationInput,
  validatePasswordChangeInput,
}
