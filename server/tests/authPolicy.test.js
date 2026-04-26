const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeCredential,
  validateLoginInput,
  validateRegistrationInput,
  validatePasswordChangeInput,
} = require('../utils/authPolicy')

test('normalizeCredential trims string input', () => {
  assert.equal(normalizeCredential('  abc123  '), 'abc123')
  assert.equal(normalizeCredential(''), '')
  assert.equal(normalizeCredential(null), '')
})

test('validateRegistrationInput rejects short username and password', () => {
  assert.deepEqual(validateRegistrationInput({ username: 'user', password: '12345' }), {
    ok: false,
    message: '用户名长度需为 6-32 位',
  })
})

test('validateRegistrationInput rejects weak password missing required character groups', () => {
  assert.deepEqual(
    validateRegistrationInput({ username: 'user123', password: 'alllowercase123' }),
    {
      ok: false,
      message: '密码需为 8-64 位，且包含大写字母、小写字母、数字和特殊字符',
    }
  )
})

test('validateRegistrationInput accepts trimmed valid credentials', () => {
  assert.deepEqual(
    validateRegistrationInput({ username: '  user123  ', password: '  Strong#123  ' }),
    {
      ok: true,
      value: {
        username: 'user123',
        password: 'Strong#123',
      },
    }
  )
})

test('validateLoginInput keeps raw credentials for legacy compatibility while still rejecting blank input', () => {
  assert.deepEqual(
    validateLoginInput({ username: '  legacy-user  ', password: '  Legacy#123  ' }),
    {
      ok: true,
      value: {
        username: '  legacy-user  ',
        password: '  Legacy#123  ',
      },
    }
  )

  assert.deepEqual(validateLoginInput({ username: '   ', password: 'valid' }), {
    ok: false,
    message: '用户名不能为空',
  })
})

test('validatePasswordChangeInput rejects same old and new password', () => {
  assert.deepEqual(
    validatePasswordChangeInput({ oldPassword: 'Strong#123', newPassword: ' Strong#123 ' }),
    {
      ok: false,
      message: '新密码不能与旧密码相同',
    }
  )
})

test('validatePasswordChangeInput rejects weak new password even when old password is valid', () => {
  assert.deepEqual(
    validatePasswordChangeInput({ oldPassword: 'Strong#123', newPassword: 'weakpass1' }),
    {
      ok: false,
      message: '密码需为 8-64 位，且包含大写字母、小写字母、数字和特殊字符',
    }
  )
})
