const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveAgentWorkflow } = require('../controllers/agentOrchestrator')

test('resolveAgentWorkflow routes image plus wardrobe save intent to cloth ingestion workflow', async () => {
  const result = await resolveAgentWorkflow({
    input: '把这张图片存入我的衣橱',
    multimodal: {
      text: '把这张图片存入我的衣橱',
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'shirt.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
    },
  })

  assert.equal(result.shouldHandle, true)
  assert.equal(result.workflowType, 'ingest_cloth_from_image')
})

test('resolveAgentWorkflow routes image plus wardrobe put-in intent to cloth ingestion workflow', async () => {
  const result = await resolveAgentWorkflow({
    input: '帮我把这个鞋子放入我的衣橱中',
    multimodal: {
      text: '帮我把这个鞋子放入我的衣橱中',
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'shoes.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
    },
  })

  assert.equal(result.shouldHandle, true)
  assert.equal(result.workflowType, 'ingest_cloth_from_image')
})

test('resolveAgentWorkflow ignores regular multimodal question without save intent', async () => {
  const result = await resolveAgentWorkflow({
    input: '这件衣服适合什么场景',
    multimodal: {
      text: '这件衣服适合什么场景',
      attachments: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          name: 'shirt.jpg',
          dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        },
      ],
    },
  })

  assert.equal(result.shouldHandle, false)
  assert.equal(result.workflowType, '')
})
