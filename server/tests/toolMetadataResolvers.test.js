const test = require('node:test')
const assert = require('node:assert/strict')

const { getToolByName } = require('../agent/tools/registry')
const { resolveResultPresenter, presentToolResult } = require('../agent/tools/runtime/resultPresenterResolver')
const {
  resolveConfirmationDescriptor,
  buildConfirmationViewModel,
} = require('../agent/tools/runtime/confirmationDescriptorResolver')

test('result presenter resolver can resolve catalog presenter strings compatibly', () => {
  const imageTool = getToolByName('analyze_image')
  const clothListTool = getToolByName('list_clothes')

  assert.equal(typeof resolveResultPresenter(imageTool), 'function')
  assert.equal(typeof resolveResultPresenter(clothListTool), 'function')
  assert.equal(
    presentToolResult({ tool: imageTool, result: { summary: '识别到一双黑色鞋子' } }),
    '识别到一双黑色鞋子'
  )
})

test('confirmation descriptor resolver can resolve catalog descriptor strings compatibly', () => {
  const createClothTool = getToolByName('create_cloth')
  const favoriteTool = getToolByName('set_cloth_favorite')

  assert.equal(typeof resolveConfirmationDescriptor(createClothTool), 'function')
  assert.equal(typeof resolveConfirmationDescriptor(favoriteTool), 'function')

  const viewModel = buildConfirmationViewModel({
    action: 'toggle_favorite',
    confirmation: {
      action: 'toggle_favorite',
      summary: '收藏衣物 黑色上衣',
      scope: 'cloth_id=12',
      risk: '会修改收藏状态',
      details: null,
    },
  })

  assert.equal(viewModel.action, 'toggle_favorite')
  assert.equal(viewModel.actionLabel, '更新收藏')
  assert.equal(viewModel.summary, '收藏衣物 黑色上衣')
  assert.equal(viewModel.scope, 'cloth_id=12')
  assert.equal(viewModel.targetPage?.label, '编辑衣物')
})
