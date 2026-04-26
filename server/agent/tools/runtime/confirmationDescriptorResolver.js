const { getToolByName } = require('../registry')
const { clonePageTarget, replaceKnownRoutesWithPageNames } = require('./uiMetadataResolver')

const ACTION_TOOL_NAME_ALIASES = {
  toggle_favorite: 'set_cloth_favorite',
}

const ACTION_PAGE_TARGETS = {
  create_cloth: 'addCloth',
  create_clothes_batch: 'addCloth',
  update_cloth_fields: 'editCloth',
  update_cloth_image: 'editCloth',
  import_closet_data: 'wardrobe',
  toggle_favorite: 'editCloth',
  delete_cloth: 'wardrobe',
  save_suit: 'suitCollection',
  delete_suit: 'suitCollection',
  create_outfit_log: 'outfitLogs',
  update_outfit_log: 'outfitLogs',
  delete_outfit_log: 'outfitLogs',
  update_user_sex: 'person',
  update_user_name: 'person',
  upload_user_avatar: 'person',
  upload_character_model: 'person',
  delete_character_model: 'person',
  update_confirmation_preferences: 'profileInsights',
}

const resolveConfirmationTool = (action = '') => {
  const normalizedAction = String(action || '').trim()
  return getToolByName(ACTION_TOOL_NAME_ALIASES[normalizedAction] || normalizedAction)
}

const buildBaseConfirmationViewModel = (confirmation = {}) => {
  const action = String(confirmation.action || '').trim()
  const pageKey = ACTION_PAGE_TARGETS[action] || ''
  const targetPage = pageKey ? clonePageTarget(pageKey) : null

  return {
    action,
    actionLabel: String(resolveConfirmationTool(action)?.uiLabel || confirmation.summary || action || '待确认操作').trim(),
    summary: replaceKnownRoutesWithPageNames(String(confirmation.summary || '').trim()),
    scope: replaceKnownRoutesWithPageNames(String(confirmation.scope || '').trim()),
    risk: replaceKnownRoutesWithPageNames(String(confirmation.risk || '').trim()),
    details: confirmation.details || null,
    previewImages: Array.isArray(confirmation.previewImages) ? confirmation.previewImages : [],
    targetPage,
  }
}

const resolveConfirmationDescriptor = (tool = {}) => {
  const descriptor = String(tool?.confirmationDescriptor || '').trim()
  if (!descriptor) return null
  return (confirmation = {}) => buildBaseConfirmationViewModel(confirmation)
}

const buildConfirmationViewModel = ({ action = '', confirmation = {} } = {}) => {
  const tool = resolveConfirmationTool(action)
  const descriptor = resolveConfirmationDescriptor(tool)
  return descriptor
    ? descriptor(confirmation)
    : buildBaseConfirmationViewModel({ ...confirmation, action: confirmation.action || action })
}

module.exports = {
  ACTION_TOOL_NAME_ALIASES,
  buildConfirmationViewModel,
  resolveConfirmationDescriptor,
  resolveConfirmationTool,
}
