const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveJwtSecret } = require('../utils/jwtConfig')

test('resolveJwtSecret returns trimmed secret from env object', () => {
  assert.equal(resolveJwtSecret({ JWT_SECRET: '  custom-secret  ' }), 'custom-secret')
})

test('resolveJwtSecret throws when secret is missing', () => {
  assert.throws(() => resolveJwtSecret({ JWT_SECRET: '   ' }), /JWT_SECRET/)
})
