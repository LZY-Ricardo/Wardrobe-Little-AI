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
    action: 'create_cloth',
    confirmation: {
      action: 'create_cloth',
      summary: '将“乐福鞋”保存到衣橱',
      scope: '鞋子 / 棕色',
      risk: '会新增一条衣物记录',
      details: { name: '乐福鞋' },
      previewImages: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: '乐福鞋',
          dataUrl: 'data:image/jpeg;base64,bG9hZmVy',
        },
      ],
    },
  })

  assert.equal(viewModel.action, 'create_cloth')
  assert.equal(viewModel.actionLabel, '保存到衣橱')
  assert.equal(viewModel.summary, '将“乐福鞋”保存到衣橱')
  assert.equal(viewModel.scope, '鞋子 / 棕色')
  assert.equal(viewModel.targetPage?.label, '添加衣物')
  assert.equal(viewModel.previewImages?.length, 1)
})
