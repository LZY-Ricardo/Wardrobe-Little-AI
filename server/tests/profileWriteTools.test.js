const test = require('node:test')
const assert = require('node:assert/strict')

const {
  deleteCharacterModelTool,
  updateUserNameTool,
  uploadCharacterModelTool,
  uploadUserAvatarTool,
} = require('../agent/tools/handlers/profile/writeTools')

test('updateUserNameTool rejects empty name', async () => {
  const result = await updateUserNameTool(1, { name: '' })
  assert.deepEqual(result, { error: 'INVALID_NAME' })
})

test('updateUserNameTool delegates to injected update helper', async () => {
  const result = await updateUserNameTool(
    1,
    { name: '新昵称' },
    { updateUserName: async () => true }
  )
  assert.deepEqual(result, { name: '新昵称', updated: true })
})

test('uploadUserAvatarTool rejects missing image', async () => {
  const result = await uploadUserAvatarTool(1, {})
  assert.deepEqual(result, { error: 'MISSING_IMAGE' })
})

test('uploadUserAvatarTool delegates to injected upload helper', async () => {
  const result = await uploadUserAvatarTool(
    1,
    { image: 'data:image/jpeg;base64,avatar' },
    { uploadAvatar: async () => true }
  )
  assert.deepEqual(result, { updated: true, avatarUpdated: true })
})

test('uploadCharacterModelTool delegates to injected upload helper', async () => {
  const result = await uploadCharacterModelTool(
    1,
    { image: 'data:image/jpeg;base64,model' },
    { uploadPhoto: async () => true }
  )
  assert.deepEqual(result, { updated: true, characterModelUpdated: true })
})

test('deleteCharacterModelTool delegates to injected delete helper', async () => {
  const result = await deleteCharacterModelTool(
    1,
    {},
    { uploadPhoto: async () => true }
  )
  assert.deepEqual(result, { updated: true, deleted: true })
})
