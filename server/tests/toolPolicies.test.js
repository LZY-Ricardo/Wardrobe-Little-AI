const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveConfirmationRequirement } = require('../agent/tools/policies/confirmationPolicy')
const { buildToolContext } = require('../agent/tools/policies/contextPolicy')
const { isToolVisibleForLlm } = require('../agent/tools/policies/toolVisibilityPolicy')
const { getToolByName } = require('../agent/tools/registry')

test('delete tools always require confirmation', () => {
  const result = resolveConfirmationRequirement(
    { mode: 'write', confirmationPolicy: 'always', name: 'delete_cloth' },
    {}
  )
  assert.equal(result.requiresConfirmation, true)
  assert.equal(result.reason, 'policy_always_confirm')
})

test('low risk favorite toggle can honor user preference', () => {
  const result = resolveConfirmationRequirement(
    { mode: 'write', confirmationPolicy: 'low-risk-optional', name: 'set_cloth_favorite' },
    { profile: { confirmationPreferences: { lowRiskNoConfirm: true } } }
  )
  assert.equal(result.requiresConfirmation, false)
  assert.equal(result.reason, 'policy_low_risk_auto_execute')
})

test('context policy can normalize latest task and multimodal context', () => {
  const context = buildToolContext({
    userId: 7,
    intent: 'clothing',
    multimodal: {
      attachments: [{ name: 'coat.jpg', dataUrl: 'data:image/jpeg;base64,abc' }],
    },
    latestTask: {
      selectedCloth: {
        cloth_id: 12,
        name: '黑色针织上衣',
      },
    },
    profile: {
      confirmationPreferences: {
        lowRiskNoConfirm: true,
      },
    },
  })

  assert.equal(context.userId, 7)
  assert.equal(context.hasImage, true)
  assert.equal(context.latestTask.selectedCloth.cloth_id, 12)
  assert.equal(context.profile.confirmationPreferences.lowRiskNoConfirm, true)
})

test('image tool visibility depends on current input mode', () => {
  const listClothes = getToolByName('list_clothes')

  assert.equal(
    isToolVisibleForLlm(
      {
        name: 'analyze_image',
        llmVisible: true,
      },
      { hasImage: false, intent: 'clothing' }
    ),
    false
  )

  assert.equal(
    isToolVisibleForLlm(
      {
        name: 'analyze_image',
        llmVisible: true,
      },
      { hasImage: true, intent: 'clothing' }
    ),
    true
  )

  assert.equal(
    isToolVisibleForLlm(listClothes, { hasImage: false, intent: 'clothing' }),
    true
  )

  assert.equal(
    isToolVisibleForLlm(
      {
        name: 'show_context_images',
        llmVisible: true,
      },
      { hasImage: false, intent: 'clothing' }
    ),
    true
  )
})
